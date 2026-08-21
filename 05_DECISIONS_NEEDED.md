# Technical Decisions Needed Before Development Begins

These are points where I made a reasonable default choice so Phase 1–2 could be
complete, but they affect later phases enough that you should confirm or override
them *before* Claude Code starts building UI — changing them later is cheap now,
expensive after Phase 7+.

## 1. Roles: 3 or 4?
Spec listed "Owner/Admin" as one line and "Cashier" / "Inventory Manager" as others.
I collapsed Owner+Admin into a single `owner` role (anyone with full access is an
owner). If you actually want a separate "Admin" that has full access *except* some
owner-only things (e.g. can't delete the store, can't remove the real owner), tell me
now — it's one more enum value + a few policy tweaks, trivial now, not trivial once
20 screens check `is_owner()`.

## 2. Multi-store readiness
Schema supports multiple stores/branches even though you only need one today
(`stores`, `user_roles` are already store-scoped). This costs nothing now. If you're
certain there will **never** be a second branch, we could simplify by dropping the
`stores` table and hardcoding store context — I recommend **against** this; keep it
as-is unless you have a strong reason.

## 3. Offline sales — confirm the decision
Architecture doc §18 makes a firm call: **the POS will not allow completing a sale
while offline.** It will preserve the in-progress cart locally so nothing is lost,
but "Complete Sale" is disabled until connectivity returns. This was the spec's own
instruction ("do NOT pretend offline sync exists unless you actually implement it
safely"). Building true offline-first sales with conflict-free stock reconciliation
across two devices is realistically its own multi-week project. **Confirm you're OK
shipping without it**, or tell me to scope it in as an explicit later phase.

## 4. Batch merging on purchase
When receiving stock, I default to merging into an existing batch only on an *exact*
match of product + batch_number + expiry_date + purchase_price; otherwise a new
batch row is always created. Confirm this matches how the shop actually thinks about
"batches" — some pharmacies would rather **always** create a new batch per purchase
line, even if it's identical, to keep purchase-to-batch traceability 1:1. Easy to
flip a flag in `process_purchase`.

## 5. Selling price: per-batch or per-product?
Currently selling price lives on `product_batches` (so it can change with each
purchase). This matches "different purchase prices" in the spec but means two
batches of the same medicine could show different customer-facing prices at the same
time (POS shows the FEFO batch's price). If you'd rather have **one consistent
shelf price per product** regardless of batch/cost, that's a different model
(selling price on `products`, only purchase price on batches) — tell me which
matches how Rajput Medical Store actually prices things.

## 6. Tax
`store_settings.tax_enabled` / `tax_percent` are in the schema but **not yet wired
into `process_sale`'s math** (spec said "tax settings if required" — optional). If
you need GST/sales tax applied, say so now so Phase 7 (POS) includes it in the RPC
from the start rather than retrofitting the profit math.

## 7. Expense visibility
I scoped Expenses to **owner-only** (spec didn't explicitly say, but expenses are
sensitive financial data). If the Inventory Manager should also see/enter expenses,
that's a one-line RLS/role change — confirm.

## 8. Negative selling price / free items / donations
Schema currently `check (selling_price >= 0)` — no discounts can make a line go
negative (discount is capped implicitly by your UI, not the DB). Do you want the DB
itself to hard-block a line total going below zero (e.g. accidental huge discount),
or is that acceptable to allow for goodwill/damaged-item write-offs at the counter?

## 9. Barcode uniqueness
`products.barcode` is unique per store but nullable (many small pharmacies don't
barcode everything). Confirm this is fine, vs. requiring every product to have a
barcode.

## 10. Invoice numbering
Invoice numbers are a simple incrementing integer per store (`store_settings.
next_invoice_number`), reserved atomically inside `process_sale`. If you want a
specific format like `RMS-2026-000123` (year-prefixed, reset annually), tell me now
— it changes the column type and the increment logic, easy pre-launch, annoying to
migrate later once invoices exist.

## 11. Deleting vs archiving
Products/customers/suppliers use `is_active` (soft-delete/archive) rather than hard
delete, since sales history references them and must never break. Confirm this
matches your expectation — nothing in the UI should ever hard-delete a product that
has ever been sold.

## 12. Printing target hardware
Architecture assumes standard USB/network thermal printers with a normal
Windows/Android print driver (browser `window.print()` / Android share sheet). If
Rajput Medical Store has (or will buy) a specific ESC/POS Bluetooth-only printer with
no driver, direct Bluetooth printing needs a native wrapper (Capacitor) — doable, but
it's a distinct later phase, not part of the Next.js web app itself. Good to know the
actual printer model before Phase 8.

---

**Recommendation:** skim items 1, 3, 5, 6, 10 first — those are the ones most likely
to actually differ from my defaults for a real Haripur medical store. The rest are
safe as-is for basically any pharmacy.
