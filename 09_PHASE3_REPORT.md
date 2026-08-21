# Phase 3 Report — Authentication, RBAC, Offline Foundation, Store Setup

## Honesty check first

I do not have a live Supabase project or a running Next.js app connected in this
environment — no network access, no persistent server, nothing to actually execute
migrations against or click through. Everything below is **written and internally
consistent**, but "tested" in the sense you asked for (run against a real database,
a real transaction flow exercised, a real build produced) has **not** happened yet
and I won't claim otherwise. The "Testing Still Required" section at the bottom is
the real, unfinished part of Phase 3 — hand it to Claude Code running against your
actual Supabase project, where it can genuinely do those things.

---

## Files created this round

### Database migrations (run in this order, after 02/03/04 from Phase 1–2)
| File | Purpose |
|---|---|
| `06_phase3_schema_and_rls_updates.sql` | Collapses roles to owner/cashier, masks cost/profit from cashier via views + revoked grants, changes invoice numbering to `RMS-YYYY-NNNNNN`, adds offline idempotency column, adds return-approval workflow columns |
| `07_phase3_functions_updates.sql` | `process_sale` v2 (idempotent, new invoice format), `process_return` v2 (cashier → pending, owner → auto-approved), new `approve_return()` |

### Documentation
| File | Purpose |
|---|---|
| `08_OFFLINE_SYNC_ARCHITECTURE.md` | Full offline design: IndexedDB schema, sync flow, explicit multi-device conflict behavior |

### Application code (`phase3-code/`)
| File | Purpose |
|---|---|
| `lib/supabase/client.ts`, `lib/supabase/server.ts` | Supabase clients (browser + server), anon key only |
| `middleware.ts` | Session refresh + route protection |
| `lib/auth/permissions.ts` | UI-only permission map (owner/cashier) |
| `lib/auth/getSessionContext.ts` | Server helper: current user's store + role |
| `app/(auth)/login/page.tsx` | Login |
| `app/(auth)/register/page.tsx` | Owner self-registration (only path that creates a store) |
| `app/api/setup/create-store/route.ts` | Creates store + owner role + settings, RLS-gated, no service role |
| `app/api/users/create-cashier/route.ts` | Owner-only: creates cashier accounts (uses service role, gated by an explicit server-side owner check before it's touched) |
| `app/(setup)/onboarding/page.tsx` | Minimal post-signup landing stub |
| `lib/offline/db.ts` | IndexedDB schema (product cache + pending sales queue) |
| `lib/offline/queue.ts` | Enqueue/read/prune API for offline sales |
| `lib/offline/sync.ts` | Sync manager — flushes queue via `process_sale` RPC, idempotent |
| `lib/offline/useOnlineStatus.ts` | React hook for the offline banner + auto-sync |

---

## How each of your 12 decisions was implemented

1. **Roles** — `is_inventory_manager_or_owner()` redefined to be owner-only;
   `user_role` enum keeps the unused `inventory_manager` value (can't cheaply drop
   enum values) so re-activating a third role later needs zero schema rebuild —
   just new policies. `permissions.ts` only exposes `'owner' | 'cashier'`.
2. **Offline sales** — full IndexedDB queue + idempotent sync via
   `client_transaction_id`; see `08_OFFLINE_SYNC_ARCHITECTURE.md` for the
   conflict-handling policy you asked to have documented explicitly.
3. **Batches** — unchanged from Phase 2 (already per-batch, FEFO); confirmed no
   regressions from this round's changes.
4. **Cost/selling price + cashier masking** — this was the one decision that
   needed new mechanism, not just confirmation: RLS alone can't hide *columns*
   (only rows), so I revoked direct `SELECT` on `product_batches` and
   `sale_items` from the `authenticated` Postgres role and replaced client reads
   with `product_batches_pos_view` / `sale_items_detail_view`, which return
   `null` for `purchase_price` / `unit_cost` / `line_profit` unless
   `is_owner()`. This is enforced in Postgres, not just hidden in the UI — a
   cashier hitting the REST API directly still gets nulled columns.
5. **Expiry management** — unchanged; `store_settings.expiry_alert_days`
   already governs the "expiring soon" threshold from Phase 2.
6. **Customer credit** — unchanged; already derived via `customer_outstanding`
   view + `payments` table, matches your Rs. 5,000/2,000/3,000 example exactly.
7. **Supplier credit** — unchanged; `supplier_payments` + `supplier_outstanding`
   view already implemented this in Phase 2, confirmed correct.
8. **Returns** — new: `process_return` now checks `is_owner()`. Owner calls are
   auto-approved and restock immediately (unchanged behavior). Cashier calls
   insert a `pending` return with **no stock movement yet**; the new
   `approve_return(return_id, approve)` function (owner-only) performs the
   actual restock and finalizes the sale's status, or marks it `rejected` with
   nothing touched.
9. **Reports** — no schema change needed; all the views/functions Phase 2 built
   (`daily_sales_summary`, `customer_outstanding`, `supplier_outstanding`,
   `product_stock_summary`) already satisfy this list. Actual report *pages*
   are Phase 12 per your original plan, not Phase 3.
10. **Invoice format** — `sales.invoice_number` changed from integer to
    `RMS-YYYY-NNNNNN` text, generated inside `process_sale` from a
    year-aware counter in `store_settings` (`invoice_seq_year`,
    `invoice_seq_number`), reserved via a single `UPDATE ... RETURNING` so
    two concurrent devices can never collide.
11. **Single-owner-now, multi-user-later** — this was already true of the
    Phase 1–2 schema (store_id + user_roles from day one) and remains true;
    nothing architecturally changed by adding a second role at any point.
12. **Development priority** — this document + the two migrations above.

---

## Known limitations / things I did NOT build in this pass

- **No actual Next.js project scaffold.** Per your own spec item 41 ("inspect
  the existing project... do not overwrite working code unnecessarily"), I did
  not generate `package.json`, `next.config.js`, `tailwind.config.js`, or a
  `types/database.types.ts` — Claude Code should generate the real types via
  `supabase gen types typescript` against your actual project, and scaffold
  the Next.js app (or detect one already in progress) before dropping these
  files in.
- **`process_return`'s partial-discount refund math** (`unit_price * qty -
  discount * qty / original_qty`) is a reasonable proration but hasn't been
  run against real numbers — flag for a unit test with a few concrete
  discount scenarios before relying on it.
- **Cashier account disable/remove** — Decision #1 says the owner should be
  able to "create, disable, or remove" cashier accounts. I built **create**
  (`/api/users/create-cashier`). Disable/remove endpoints follow the same
  pattern (owner-check → service-role call to `supabase.auth.admin.updateUserById`
  for disable, or delete the `user_roles` row for "remove access without
  deleting their login") but weren't built this round — say the word and I'll
  add them, or leave them for whichever phase does the Settings → Users screen.
- **`SUPABASE_SERVICE_ROLE_KEY` requirement** — the cashier-creation route
  needs this in server env vars. Confirm it's set in your Vercel project
  before that screen is used; nothing else in Phase 3 needs it.

---

## Testing Still Required (the part that needs a real project)

Claude Code, running against your actual Supabase project, should do the
following before Phase 3 is actually marked done:

1. **Inspect first** — confirm whether any project/schema already exists at
   the target Supabase instance; if `sales` already has rows, do NOT run the
   `alter column invoice_number type text` line in
   `06_phase3_schema_and_rls_updates.sql` as-is — write a backfill migration
   instead (format existing integer invoice numbers using their `created_at`
   year) and verify uniqueness before adding the constraint back.
2. Apply migrations 02 → 03 → 04 → 06 → 07 in order; run
   `supabase gen types typescript` afterward.
3. **RLS verification**: create one owner + one cashier test user; confirm the
   cashier's session genuinely gets `null` for `purchase_price`/`unit_cost`/
   `line_profit` from the views, and gets a permission error (not just an
   empty result) on direct writes to `expenses`, `suppliers`, `purchases`.
4. **Transaction flow test**: run `process_sale` twice with the *same*
   `p_client_transaction_id` and confirm the second call returns the same
   `sale_id` with no duplicate stock deduction.
5. **Concurrency test**: simulate two simultaneous `process_sale` calls
   against a batch with only enough stock for one of them; confirm one
   succeeds and one raises the insufficient-stock exception (never both
   succeeding, never negative stock).
6. **Invoice numbering test**: fire several concurrent sales and confirm no
   duplicate `RMS-YYYY-NNNNNN` values are produced.
7. **Return approval flow**: cashier-initiated return → confirm stock is
   unchanged and `returns.status = 'pending'` → owner calls
   `approve_return(..., true)` → confirm stock restocked exactly once →
   confirm calling it a second time is rejected (status is no longer
   `'pending'`).
8. **Offline flow (manual)**: disable network in devtools, complete a sale
   from the POS (once Phase 7 exists to test this end-to-end), confirm it
   queues; re-enable network, confirm auto-sync commits it and the receipt
   updates from "pending" to a real invoice number.
9. `npm run build` — confirm the actual Next.js project builds cleanly with
   these files added, once the real project scaffold exists.

## Build status

**Not run.** No build step has been executed anywhere in this conversation —
there is no Next.js project instantiated in this sandbox to build. This is
the accurate status; Claude Code should report a real one after step 9 above.
