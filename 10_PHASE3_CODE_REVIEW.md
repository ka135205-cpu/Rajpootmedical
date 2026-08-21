# Repository Review — Findings Before Phase 3

Reviewed: `01_ARCHITECTURE.md`, `02_schema.sql`, `03_rls_policies.sql`,
`04_functions_triggers.sql`, `05_DECISIONS_NEEDED.md`, plus the Phase 3
decision patches (`06_phase3_schema_and_rls_updates.sql`,
`07_phase3_functions_updates.sql`). Two genuine bugs found; both are fixed
in a new migration (`11_phase3_bugfixes.sql`) rather than edited in place,
so the history of what changed and why stays intact.

---

## BUG 1 (Critical — breaks all product/sale reads): `security_invoker = true`
combined with revoked base-table grants

**Where:** `06_phase3_schema_and_rls_updates.sql`, the
`product_batches_pos_view` and `sale_items_detail_view` definitions.

**What's wrong:** The migration does two things together that cancel each
other out:
```sql
revoke select on product_batches from authenticated;
...
create view product_batches_pos_view with (security_invoker = true) as ...
```
A `security_invoker = true` view checks the **querying role's own**
privileges on the underlying tables — it does not borrow the view owner's
privileges. Since `SELECT` on `product_batches` was just revoked from
`authenticated`, and every real user (owner *and* cashier) connects as
`authenticated`, **every query through this view would fail with
"permission denied for table product_batches"** — including for the owner,
who is supposed to see everything. Same problem on
`sale_items_detail_view`. This would have completely broken POS product
search and the dashboard the moment Phase 5/7 tried to use these views.

**Why `security_invoker` isn't needed here:** The masking logic
(`case when is_owner() then ... else null end`) and the store-isolation
filter (`where store_id = current_store_id()`) both call `SECURITY DEFINER`
helper functions that read `auth.uid()` from the session directly — they
get the right answer regardless of which Postgres role actually executes
the view's underlying table scan. So the view doesn't need invoker rights
to be correct; it only needs the *view owner* to have table access (true by
default, since migrations run as a privileged role), which is exactly what
dropping `security_invoker = true` restores.

**Fix:** `11_phase3_bugfixes.sql` recreates both views without the
`security_invoker` clause.

---

## BUG 2 (Critical — breaks store creation / owner registration)

**Where:** `03_rls_policies.sql` (`stores_select` policy) combined with the
Phase 3 `/api/setup/create-store` route I wrote last round.

**What's wrong:**
```sql
create policy stores_select on stores for select using (id = current_store_id());
```
`current_store_id()` looks up `user_roles` for the current user. At the
exact moment a brand-new owner's `stores` row is inserted, **no
`user_roles` row exists yet** (that's the next statement) — so
`current_store_id()` returns `null`, and `id = null` is never true. In
Postgres, the `RETURNING` clause of an `INSERT` is filtered by the table's
`SELECT` row-security policy. That means the `.insert().select()` call the
registration route makes (a completely standard Supabase pattern) would
**appear to fail — return no row — even though the store was actually
created**, because RLS hides it from the very insert that just created it.
This is a real chicken-and-egg bug in the original Phase 1–2 RLS design
that only surfaces once you try to actually call it, which is exactly what
happened when I wrote the Phase 3 route last round.

**Fix:** Rather than patch around RLS with more special-case policies
(fragile, easy to accidentally widen), `11_phase3_bugfixes.sql` adds one
`SECURITY DEFINER` function, `create_store_and_owner(p_store_name text)`,
that does the store + owner-role + settings inserts atomically and returns
just the new `store_id` as a scalar — not a table row subject to RLS at
all. This matches the pattern already used everywhere else in this system
(`process_sale`, `process_purchase`, etc.) instead of being the one place
that did raw multi-step table inserts from the client. The Phase 3
`create-store` route is updated to call this function instead.

---

## Lower-severity consistency issues (fixed, not urgent)

1. **`adjust_stock()` and `record_supplier_payment()` still check
   `role in ('owner', 'inventory_manager')` literally**, instead of calling
   the shared `is_inventory_manager_or_owner()` helper that Decision #1's
   patch already collapsed to owner-only. Functionally harmless *today*
   (nobody is ever assigned `inventory_manager`), but it's an inconsistency
   that would bite you later: if `inventory_manager` is ever reactivated,
   these two functions would silently start granting it access while most
   RLS policies wouldn't, unless someone remembers to update policies too.
   Fixed in `11_phase3_bugfixes.sql` to call the shared helper.
2. **`04_functions_triggers.sql` is no longer an accurate standalone
   description of current behavior** — `07_phase3_functions_updates.sql`
   supersedes its `process_sale` and `process_return` via `CREATE OR
   REPLACE`. This is fine functionally as long as migrations run in the
   documented order (02→03→04→06→07→10), but it's a maintainability smell.
   **Recommendation:** once Phase 3 is stable and tested, squash 02–10 into
   one canonical schema file for anyone onboarding to the repo later. Not
   done now, to avoid touching anything mid-review.

## Things I checked and confirmed are NOT bugs

- `products.barcode` unique constraint with nullable barcode — standard
  SQL treats each `NULL` as distinct, so multiple products with no barcode
  is fine; intentional per Decision #9 (implicit).
- `profiles_insert_own` RLS policy looks unused (the `handle_new_user`
  trigger inserts profiles instead) — confirmed harmless: the trigger is
  `SECURITY DEFINER` and runs as the migration-owning role, which owns the
  `profiles` table and therefore bypasses its own RLS by default (Postgres
  standard behavior unless `FORCE ROW LEVEL SECURITY` is set, which it
  isn't here). No fix needed.
- `daily_sales_summary`'s correlated subquery inside `sum(...)` — valid
  Postgres, evaluates per grouped row before aggregating.
- FEFO batch-locking loop in `process_sale` (`FOR UPDATE` cursor with early
  `EXIT`) — locks acquired before the exit are correctly held until
  transaction end; no partial-lock leak.
- No SQL syntax errors found by manual parse of every statement. I want to
  be upfront about a real limitation here, though: **I do not have a local
  Postgres instance or network access in this sandbox to actually execute
  these files**, so this is a careful manual read, not a real `psql` run.
  Claude Code should still run these migrations against your actual
  Supabase project and treat that as the real syntax check.

---

## Net effect on architecture/decisions documents

No architectural or business-decision changes were needed — both bugs are
implementation-level fixes within the existing design, not signs the
design itself was wrong. `01_ARCHITECTURE.md` and `05_DECISIONS_NEEDED.md`
stand as-is.
