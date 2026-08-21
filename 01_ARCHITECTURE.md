# Rajput Medical Store — System Architecture (Phase 1)

## 0. High-Level Summary

A single Supabase (PostgreSQL) backend serves both the Android (PWA) client and the
desktop/laptop client from the **same Next.js codebase**, deployed once to Vercel.
There is no separate mobile app and no separate API server — Next.js Route Handlers
(and/or Supabase RPC functions called directly from the client) are the entire backend.
Real-time consistency between phone and computer comes from Supabase's Postgres +
Realtime subscriptions, not from any custom sync layer.

```
 Android phone (PWA, installed)        Laptop / Desktop (browser)
        │                                       │
        └────────────────┬──────────────────────┘
                          │  HTTPS (same Next.js app, same build)
                          ▼
                Next.js 14 (App Router) on Vercel
                - Server Components (data fetch)
                - Route Handlers (/api/*) for privileged ops
                - Client Components (POS, forms)
                          │
                          ▼
                 Supabase JS Client (RLS-aware)
                          │
        ┌─────────────────┴─────────────────┐
        ▼                                     ▼
  Supabase Auth                    Supabase Postgres (RLS ON)
  (email/password)                 - Tables
                                    - RPC functions (SECURITY DEFINER)
                                    - Triggers
                                    - Realtime replication
```

Because both devices talk to the same Postgres instance through Supabase, a sale rung
up on the phone is visible on the laptop dashboard within seconds via Supabase
Realtime (Postgres logical replication → websocket), with a manual refetch fallback.

---

## 1. Next.js Project Structure

Use the **App Router** (Next.js 14+), TypeScript, Tailwind. One app serves both
form factors; responsive layout + route-level UI branching (not separate apps).

```
rajput-medical-store/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx           # store owner sign-up + store creation
│   │   └── layout.tsx
│   ├── (setup)/
│   │   └── onboarding/page.tsx         # Phase-37 first-run wizard
│   ├── (app)/                          # authenticated area, has shell layout
│   │   ├── layout.tsx                  # sidebar (desktop) / bottom nav (mobile)
│   │   ├── dashboard/page.tsx
│   │   ├── pos/page.tsx
│   │   ├── inventory/
│   │   │   ├── page.tsx
│   │   │   ├── [productId]/page.tsx
│   │   │   ├── low-stock/page.tsx
│   │   │   └── expiry/page.tsx
│   │   ├── sales/
│   │   │   ├── page.tsx
│   │   │   └── [saleId]/page.tsx
│   │   ├── returns/page.tsx
│   │   ├── purchases/
│   │   │   ├── page.tsx
│   │   │   └── new/page.tsx
│   │   ├── suppliers/
│   │   │   ├── page.tsx
│   │   │   └── [supplierId]/page.tsx
│   │   ├── customers/
│   │   │   ├── page.tsx
│   │   │   └── [customerId]/page.tsx
│   │   ├── expenses/page.tsx
│   │   ├── reports/
│   │   │   ├── sales/page.tsx
│   │   │   ├── profit/page.tsx
│   │   │   ├── inventory/page.tsx
│   │   │   └── customers/page.tsx
│   │   ├── users/page.tsx              # role management, owner-only
│   │   ├── audit-log/page.tsx
│   │   └── settings/page.tsx
│   ├── api/
│   │   ├── sales/route.ts              # thin wrapper if needed beyond RPC
│   │   ├── purchases/route.ts
│   │   ├── reports/export/route.ts     # CSV generation
│   │   └── invoices/[id]/pdf/route.ts  # server-rendered receipt → PDF
│   ├── manifest.ts                     # PWA manifest (Next.js native support)
│   ├── globals.css
│   └── layout.tsx
├── components/
│   ├── ui/                             # DashboardCard, DataTable, EmptyState,
│   │                                    # LoadingState, ConfirmationDialog, etc.
│   ├── pos/                            # POSCart, MedicineSelector, BarcodeScanner
│   ├── inventory/                      # ProductForm, BatchForm, ProductSearch
│   ├── invoice/                        # InvoicePreview, ReceiptPrintLayout
│   ├── customers/                      # CustomerSelector, CreditLedger
│   ├── suppliers/                      # SupplierSelector
│   └── reports/                        # ReportCard, DateRangePicker, charts
├── lib/
│   ├── supabase/
│   │   ├── client.ts                   # browser client (anon key)
│   │   ├── server.ts                   # server client (cookies, RLS still ON)
│   │   └── middleware.ts               # session refresh
│   ├── auth/                           # role/permission helpers
│   ├── pos/                            # cart math, discount logic (client mirror
│   │                                    # of server calc, server is source of truth)
│   ├── printing/                       # receipt formatting (58mm/80mm), PDF gen
│   ├── offline/                        # local cart persistence, offline indicator
│   └── validation/                     # zod schemas shared client+server
├── types/
│   └── database.types.ts               # generated via `supabase gen types typescript`
├── supabase/
│   ├── migrations/                     # numbered SQL migration files (source of truth)
│   ├── functions/                      # (optional) Edge Functions, not used for MVP
│   └── seed.sql                        # demo data, dev only
├── public/
│   ├── icons/                          # PWA icons (multiple sizes)
│   └── sw.js                           # service worker (or generated by plugin)
├── middleware.ts                       # Supabase session + route protection
├── next.config.js
└── package.json
```

Key decisions embedded here:
- **Server Components** do the initial data fetch for every page (fast, RLS-enforced,
  no waterfall spinners on first load).
- **Client Components** are used only where interactivity is required: POS screen,
  forms, barcode scanner, charts.
- Route groups `(auth)`, `(setup)`, `(app)` give three different layouts without
  affecting the URL.

---

## 2. React / TypeScript Architecture

- **Data fetching**: Server Components + Supabase server client for reads. Mutations
  go through Supabase RPC calls (`supabase.rpc('process_sale', {...})`) from Client
  Components, or through `/app/api/*` Route Handlers when a mutation needs privileged
  logic that shouldn't run with the user's own RLS-scoped session (e.g. some report
  exports).
- **State management**: No global state library needed. Local component state +
  React Context only for: (a) current user/role/store, (b) POS cart (with offline
  persistence), (c) toast/notification system. Server data is fetched per-page;
  mutations trigger `router.refresh()` or optimistic local updates followed by
  Realtime reconciliation.
- **Realtime sync (phone ↔ computer)**: Dashboard, low-stock page, and sales list
  subscribe to `postgres_changes` on `sales`, `product_batches`, `stock_movements`
  filtered by `store_id`. This is how a sale on the phone shows up on the laptop
  without a manual refresh.
- **Forms**: `react-hook-form` + `zod` resolver. The same zod schema is reused for
  server-side validation inside Route Handlers/RPC input checks, so validation rules
  are defined once.
- **Component reuse**: all list/detail screens (products, suppliers, customers,
  purchases) share one `<DataTable>` (desktop) / `<CardList>` (mobile) pair driven by
  column config, so 6+ modules don't reimplement pagination/sorting/search.

---

## 3. Supabase Architecture

- One Supabase project, one Postgres database, **multi-store-capable schema** even
  though Rajput Medical Store is a single store today (see §4 for why).
- **Auth**: Supabase Auth (email + password). `auth.users` is the source of identity;
  a `profiles` row is created via trigger on signup; role/store assignment happens
  through `user_roles`.
- **RLS is mandatory and always on** — every table check is enforced at the database
  layer, not just in the UI, so a compromised or buggy client can never read/write
  another store's data or exceed its role's permissions.
- **RPC functions** (`SECURITY DEFINER`, but still store/role-checked internally) do
  all multi-step writes atomically: `process_sale`, `process_purchase`,
  `process_return`, `record_customer_payment`, `record_supplier_payment`,
  `adjust_stock`. The client never assembles a sale by issuing raw inserts into
  `sales` + `sale_items` + `stock_movements` separately — that would risk partial
  writes and race conditions on stock.
- **Realtime**: enabled on `sales`, `product_batches`, `stock_movements`,
  `sale_items` for live dashboard/inventory updates.
- **Storage**: a `store-assets` bucket for the store logo (Settings page), scoped by
  RLS to the owning store.

---

## 4. Authentication Flow

1. Owner signs up (email/password) → Supabase Auth creates `auth.users` row.
2. A DB trigger (`handle_new_user`) creates a `profiles` row.
3. Because this is the *first* user, the sign-up Route Handler also creates a `stores`
   row and inserts a `user_roles` row with role `owner`, linking the new user to the
   new store. (Every subsequent user is invited *into* an existing store by the
   owner/admin from Settings → Users, never self-registers into a store.)
4. Owner is redirected into the onboarding wizard (§37 of the spec).
5. On every request, `middleware.ts` refreshes the Supabase session cookie so SSR
   Server Components have a valid session; RLS then scopes every query automatically
   using `auth.uid()`.
6. Logging in on the phone and the laptop with the same account creates two
   independent sessions against the same account/store — this is intentional and is
   *how* the two devices share data (not a special "sync" mechanism).

**Why store-scoped, not multi-tenant SaaS from day one, but schema supports it:**
Building `stores` + `user_roles` in from the start costs nothing extra now and avoids
a full schema rewrite if Rajput Medical Store ever opens a second branch or the
product is white-labeled for other pharmacies later (explicitly to satisfy the "do
not make assumptions that force a rebuild" requirement).

---

## 5. RBAC Structure

Three roles, defined as a Postgres enum (`user_role`): `owner`, `cashier`,
`inventory_manager`. (`admin` is treated as a second `owner`-level account, not a
separate role — the spec's "Owner/Admin: full access" collapses to one role with
possibly multiple people holding it.)

| Capability | owner | inventory_manager | cashier |
|---|---|---|---|
| Dashboard (full financials) | ✅ | Inventory-only view | Today's sales only |
| POS / create sale | ✅ | ❌ | ✅ |
| Inventory (products/batches) | ✅ | ✅ | Read-only (for POS search) |
| Purchases / suppliers | ✅ | ✅ | ❌ |
| Customers / credit | ✅ | Read-only | ✅ (record payments) |
| Expenses | ✅ | ❌ | ❌ |
| Reports | ✅ | Inventory/Purchase reports | Own sales only |
| Settings / user management | ✅ | ❌ | ❌ |
| Audit log | ✅ | ❌ | ❌ |
| Price changes | ✅ | ✅ (purchase price only) | ❌ |

This table is implemented twice, consistently:
- **Server truth**: RLS policies + role checks inside RPC functions (§ security SQL).
- **UI convenience**: a `usePermissions()` hook hides/disables buttons the role can't
  use — purely cosmetic, never trusted for security.

---

## 6. PWA Architecture

- `app/manifest.ts` (Next.js native manifest route) defines name, short_name, icons
  (multiple sizes incl. maskable), `display: "standalone"`, theme/background colors,
  `start_url: "/dashboard"`.
- A service worker (via `next-pwa` or a hand-written `public/sw.js`) caches:
  - The app shell (static JS/CSS/fonts) — `stale-while-revalidate`.
  - Never caches API/Supabase responses as if they were fresh truth — data is always
    fetched live when online; the service worker's job is making the *app itself*
    load instantly and installably, not faking an offline database.
- "Add to Home Screen" works automatically once manifest + service worker + HTTPS
  are satisfied (Vercel gives HTTPS by default).
- Splash screen generated from manifest icons/background color (standard PWA
  behavior, no custom native code needed).

---

## 7. POS Architecture

Client-side cart, server-side truth:

1. Cashier searches/scans → `ProductSearch` queries `products` + `product_batches`
   (RLS-scoped) with a debounced full-text/trigram search.
2. Adding an item to the cart is **purely client-side state** (React Context +
   localStorage mirror for crash/offline recovery) — no DB write yet. This keeps the
   POS instant and lets the cashier freely add/remove/edit quantities.
3. Client-side running totals (subtotal, discounts, tax if enabled) are computed for
   instant UI feedback using the same calculation module (`lib/pos/calc.ts`) that the
   server also uses — but these are **advisory only**.
4. On "Complete Sale", the entire cart (product ids + quantities + item discounts +
   payment info + customer id) is sent in one call to the `process_sale` RPC
   function, which is the single source of truth: it re-validates stock, re-prices
   from the database, picks batches via FEFO, and only then commits.
5. Server response returns the finalized `sale_id`, computed totals, and per-item
   cost/profit — client renders the invoice from this authoritative response, not
   from its own running total (protects against price/stock changing between two
   devices mid-transaction).

---

## 8. Billing / Printing Architecture

- **Invoice data** always comes from the database (`sales` + `sale_items` joined),
  never re-derived from the POS cart, so a reprint days later is guaranteed accurate
  even if prices changed since.
- **Desktop / thermal printing**: a dedicated print-only route
  (`/pos/receipt/[saleId]`) renders a minimal HTML page sized for 58mm/80mm width
  using `@media print` CSS (`width: 58mm` / `80mm`, no browser chrome), triggered via
  `window.print()`. This works with any thermal printer that has a Windows/driver
  print queue — no paid service, no native SDK required for MVP.
- **Mobile**: the same route is used to generate a PDF (via a server Route Handler
  using a headless-rendering library) which is then shared via the Web Share API
  (`navigator.share`) or downloaded — covering "print via Android's share sheet"
  without needing Bluetooth printer SDKs.
- **Future native Bluetooth printing**: kept possible by isolating all receipt
  formatting in `lib/printing/receipt.ts` as a plain data-to-lines transform, so a
  later native Android wrapper (Capacitor, etc.) can consume the same formatted
  output and send raw ESC/POS commands instead of `window.print()`.

---

## 9. Inventory Architecture

- `products` = the *catalog* entry (name, generic name, brand, category, barcode,
  reorder level, description) — **not** where stock quantity or price lives.
- `product_batches` = the *stock* entry: every physical batch received has its own
  row with its own quantity, purchase price, selling price (batches can be priced
  differently over time), expiry date, batch/lot number, and rack/location.
- A product's "current stock" is always `SUM(product_batches.quantity)` for that
  product (never a separate cached column that can drift) — exposed via a view
  (`product_stock_summary`) for fast dashboard reads.
- "Selling price" shown in POS search defaults to the current/active batch's selling
  price (FEFO batch), editable per-line at sale time only within policy (see item
  discount rules), not by silently changing the catalog price.

---

## 10. Batch & Expiry / FEFO Logic

- Every batch row carries `expiry_date`, `quantity`, `purchase_price`.
- **FEFO selection** happens inside `process_sale`: for the requested product and
  quantity, the function selects from `product_batches` where
  `expiry_date >= CURRENT_DATE AND quantity > 0`, ordered by `expiry_date ASC`, and
  consumes across batches if a single batch doesn't have enough quantity (e.g. sell
  12 units: 5 from the batch expiring soonest, 7 from the next), writing one
  `sale_item` row *per batch consumed* so cost-of-goods is always accurate per unit.
- Expired batches (`expiry_date < CURRENT_DATE`) are **excluded from FEFO
  selection entirely** — they cannot be sold even if a cashier tries, enforced in the
  function itself (not just the UI), and also excluded from "available stock" counts
  shown to the cashier.
- "Expiring soon" threshold is store-configurable (`store_settings.expiry_alert_days`,
  default 90) and used only for dashboard/alerts, not for blocking sales — a batch is
  sellable right up until its actual expiry date.

---

## 11. Sales & Profit Calculation Flow

```
process_sale(items[], customer_id?, discount, payment...)
  1. Lock relevant product_batches rows (SELECT ... FOR UPDATE)
  2. For each requested item: FEFO-select batch(es), verify quantity available
  3. Compute per-line: qty * selling_price - line_discount = line_total
                        qty * batch.purchase_price = line_cost
  4. Sum lines → subtotal; apply total-level discount → grand_total
  5. Insert `sales` header (subtotal, discount, total, amount_paid, change,
     payment_method, customer_id, cashier_id, computed gross_profit)
  6. Insert one `sale_items` row per (product, batch) consumed, storing the
     price AND cost AT THE TIME OF SALE (never recomputed later from current
     batch data — historical accuracy)
  7. Decrement product_batches.quantity accordingly
  8. Insert `stock_movements` row(s), type='sale', reference=sale_id
  9. If customer_id present and amount_paid < total: create/update credit ledger
     via `payments` (amount_paid recorded as a payment row; balance is derived)
  10. Insert `audit_logs` row
  11. COMMIT (all-or-nothing)
```
Profit rollups (`daily/weekly/monthly/yearly`, per-product, per-invoice) are **never**
stored as pre-aggregated numbers that can drift — they're SQL views/queries over
`sale_items` (gross profit = Σ(price − cost)) and `expenses` (net profit = gross
profit − expenses in period), computed on read. This directly satisfies the "no fake
analytics" requirement — there is nothing to hard-code because there's nothing to
cache.

---

## 12. Purchase Flow

```
process_purchase(supplier_id, items[], invoice_ref, payment_status...)
  1. Insert `purchases` header
  2. For each item: insert `purchase_items` row
  3. For each item: INSERT a NEW `product_batches` row (a purchase always creates
     a new batch — even if it's the "same" product/price/expiry as an existing
     batch, per real pharmacy practice of tracking batches distinctly; the UI may
     offer "merge into existing batch" as a convenience that's really just adding
     quantity to an existing batch row when batch_number + expiry match exactly)
  4. Insert `stock_movements` row(s), type='purchase', reference=purchase_id
  5. If payment_status = 'partial'/'unpaid': supplier outstanding balance
     (derived from purchases.total − Σ supplier_payments) increases accordingly
  6. Insert `audit_logs` row
```

---

## 13. Customer / Credit (Udhaar) Flow

- `customers` holds profile + running totals are **derived**, not stored:
  `total_purchases = Σ sales.total for that customer`,
  `outstanding_credit = Σ sales.total − Σ payments.amount for that customer`.
- A sale with `amount_paid < total` doesn't create a separate "credit" record — it's
  just a `sales` row where `amount_paid` is less than `total`; the *first* payment
  row is inserted at sale time, and later partial payments call
  `record_customer_payment(sale_id, amount, method, date)` which inserts additional
  `payments` rows against the same `sale_id`. A sale is "settled" when
  `Σ payments.amount >= sales.total`.
- This means the dashboard's "Total Outstanding Customer Credit" is one SQL
  aggregate, always correct, never a manually-maintained balance field.

---

## 14. Supplier Flow

Mirror of customer/credit: `purchases.total` vs `Σ supplier_payments.amount` per
supplier gives outstanding payable, via `record_supplier_payment(purchase_id, ...)`.
Supplier "purchase history" is just their `purchases` rows.

---

## 15. Expense Flow

Flat `expenses` table (category, amount, date, description, payment_method,
store_id). No special logic beyond RLS + audit log — but it is the **required
subtrahend** in every net-profit calculation (§11), so reports must always join
against it for any period, never report "profit" without it.

---

## 16. Reporting Architecture

- All reports are parameterized SQL views/functions taking `(store_id, date_from,
  date_to)` and returning rows — reused identically by the on-screen report page and
  the CSV export Route Handler (same query, two renderers), so numbers can never
  disagree between what's displayed and what's exported.
- Heavy aggregate reports (monthly profit, best-sellers) use indexed columns
  (`sales.created_at`, `sale_items.product_id`) and are expected to run fine at
  "thousands of products / tens of thousands of sales" scale (§33 of spec) with
  proper indexes (see schema); no separate data-warehouse/materialized-view layer is
  needed at this scale, though `product_stock_summary` and a
  `daily_sales_summary` view are provided as thin conveniences.
- PDF export is scoped to **invoices only** for MVP (the single-page receipt is easy
  to render deterministically); multi-page tabular reports export as **CSV** only
  initially — a "PDF report" renderer can be added later without schema changes.

---

## 17. Audit Log Architecture

- One generic Postgres trigger function (`log_audit_event`) attached to
  INSERT/UPDATE/DELETE on the sensitive tables (`products`, `product_batches`,
  `sales`, `purchases`, `customers`, `suppliers`, `expenses`, `user_roles`,
  `store_settings`). It writes `store_id, user_id (auth.uid()), table_name,
  record_id, action, old_data (jsonb), new_data (jsonb), created_at`.
- This is intentionally table-driven and automatic (not hand-written per feature) so
  no future feature can forget to log a sensitive change.
- The Audit Log page renders a human-readable sentence per row
  (`"{user} {action}d {table} #{record_id}"`) client-side from the structured data,
  with a detail expando showing the actual old/new JSON diff.

---

## 18. Offline / PWA Considerations

- **App shell**: cached by the service worker → app opens instantly even with poor
  signal, and shows a clear "You're offline" banner (via `navigator.onLine` +
  online/offline event listeners) when it can't reach Supabase.
- **In-progress POS cart**: persisted to `localStorage` on every change (already
  client-state per §7), so a dropped connection or accidental tab close never loses
  a half-built bill — it's restored automatically on reload.
- **Explicitly NOT implemented in MVP**: full offline sale completion with later
  sync. Selling requires hitting `process_sale`, which requires connectivity (stock
  correctness and FEFO depend on live, lockable data — a true offline-first sales
  queue with conflict-free stock merging is a significant additional project). The
  UI must disable "Complete Sale" and show a clear message when offline, per the
  spec's explicit instruction not to pretend offline sync exists unless truly built.
  This is flagged in §19 (Decisions Needed) below as an option to revisit later.

---

## 19. Security Considerations

- RLS on every table, no exceptions; default-deny.
- All privileged multi-step writes go through `SECURITY DEFINER` RPC functions that
  *internally* re-check `store_id` and role — `SECURITY DEFINER` is used only to
  allow the function to do its multi-table work under one consistent security check
  rather than relying on the caller's row-by-row grants, not to bypass authorization.
- Supabase `service_role` key is **never** shipped to the client and never used in
  Route Handlers that run in a request context reachable by users — only in trusted
  build-time/seed scripts if ever needed.
- All input validated with `zod` server-side (Route Handlers) *and* re-validated
  inside SQL functions (e.g. quantity > 0, price >= 0) — client validation is UX
  only, never trusted.
- Passwords/auth handled entirely by Supabase Auth — the app never touches raw
  credentials.
- Rate-limiting / brute-force protection on auth is Supabase's built-in behavior.

---

## 20. Data Flow Between Phone and Computer (explicit answer to your question)

There is **no sync engine** and **no two databases**. Both devices are simply two
authenticated clients of the one Supabase Postgres database:

1. Phone completes a sale → `process_sale` RPC commits to Postgres.
2. Postgres's logical replication stream notifies Supabase Realtime.
3. Any other connected client (laptop dashboard) subscribed to the relevant table
   receives a `postgres_changes` event over its open websocket and refetches/patches
   its local view — typically within 1–2 seconds, no manual refresh needed.
4. If the laptop is closed or the websocket drops, the next page load / focus event
   does a normal fresh Server Component fetch — it will simply show current data,
   no reconciliation logic needed because there was never a divergent local copy.

This is why "no fake offline database sync" (§18) is a firm decision rather than a
nice-to-have cut corner — introducing a real local write-capable offline store would
require an entirely different (much more complex) architecture than "two clients,
one live database."

---

## 21. Module Connection Map

```
Purchases ──creates──> product_batches ──consumed by (FEFO)──> Sales
   │                         │                                   │
   ▼                         ▼                                   ▼
supplier_payments      stock_movements <───────────────── returns / adjustments
   │                    (append-only ledger of ALL qty change reasons)
   ▼
Suppliers (outstanding = purchases − supplier_payments)

Sales ──> sale_items (price+cost snapshot) ──> profit views (gross/net)
   │                                                 ▲
   ▼                                                 │
payments (customer)                             expenses (subtracted for net)
   │
   ▼
Customers (outstanding = sales.total − payments)

Every write above ──> audit_logs (generic trigger)
Every table ──> RLS via store_id + user_roles (role-scoped reads/writes)
```

---

## 22. Technical Decisions Needed Before Coding Begins

See `04_DECISIONS_NEEDED.md`.
