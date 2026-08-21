# Phase 5 Report — Inventory, Categories, Suppliers

## Honesty check (same as always)

This was built and syntax-checked in the same way as Phase 3 — no live
Supabase connection, no real `npm install`/build here. Verified: every
internal import resolves to a real file, and a syntax-only TypeScript pass
across the whole project (Phase 3 + Phase 5 combined) found zero unexpected
errors (one real issue was caught and fixed — see below). A genuine build/
typecheck/RLS test still needs to happen in your actual environment.

## New SQL migration

`14_inventory_functions.sql` — one new function, `add_product_batch()`.
Everything else (product CRUD, category CRUD, supplier CRUD) uses direct
table access through existing RLS policies — no new functions needed there.
`add_product_batch` exists specifically because a batch must never be added
without a `stock_movements` ledger entry (architecture §21: "never silently
modify stock"), and that has to be atomic, so it's a `SECURITY DEFINER`
function like every other multi-step write in this system.

**Apply this after `13_audit_and_rpc_fixes.sql`.**

## What's implemented

- **Product list** (`/inventory`) — real query against `products` +
  `product_stock_summary`, search (name/generic name/barcode), status
  filters (Low Stock / Out of Stock / Expiring Soon / Expired), using your
  store's actual `expiry_alert_days` setting for the threshold.
- **Add/Edit product** (`/inventory/new`, `/inventory/[id]/edit`) — owner-
  only (redirects cashier server-side, not just hidden in the UI), full
  field set from your spec (generic name, brand, category, medicine type,
  barcode, min stock, rack location, description).
- **Product detail** (`/inventory/[id]`) — batch table (cost column
  automatically hidden for a cashier session, via the masked view from
  Phase 3/the bugfix migration — not a UI hide, a database-level null),
  "Add Batch" form (owner-only, calls `add_product_batch`), and full stock
  movement history (owner-only, per existing RLS).
- **Categories** (`/inventory/categories`) — list + add, owner-only.
- **Suppliers** (`/suppliers`) — list + add, owner-only, shows live
  outstanding balance per supplier via the existing `supplier_outstanding`
  view from Phase 2 (nothing new needed there — it was already correct).

## What's NOT in this phase (next phases, not skipped/forgotten)

- Editing/deactivating suppliers and categories (create + list only for now)
- Deactivating a product (soft delete) — straightforward addition, held
  back only to keep this phase reviewable in one pass
- Purchases module (recording a full purchase invoice against a supplier
  with payment status) — that's Phase 6; `add_product_batch` is a
  lighter-weight "just add stock" path for Inventory, not a replacement
  for it
- Barcode *scanning* (camera) — Phase 7 (POS), where it's actually used;
  the `barcode` field and exact-match search already work here

## One real type issue caught and fixed during the syntax pass

The Suppliers page's outstanding-balance `Map` inferred as `Map<string, {}>`
instead of `Map<string, number>` — a side effect of the hand-written
placeholder database types (real generated types would have caught this
correctly from the start). Fixed with an explicit type annotation. This is
exactly the kind of drift the placeholder-types warning at the top of
`types/database.types.ts` flags — another reason to run the real
`supabase gen types` command as soon as you can connect.

## Next phase

Phase 6 (Purchases) or Phase 7 (POS) — POS is the more urgent one since
it's the module you'll actually use daily. Say the word and I'll continue
in the same pattern: real code, syntax-checked, honestly reported.
