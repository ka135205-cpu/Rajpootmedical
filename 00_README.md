# Rajput Medical Store — Phase 1–2 Foundation Package

This package is meant to be handed directly to Claude Code to continue building
from Phase 3 onward, per the phased plan in the original spec.

## Files

1. **01_ARCHITECTURE.md** — full system architecture: Next.js structure, RBAC,
   PWA, POS, printing, FEFO/batch logic, sales/profit flow, purchase flow,
   customer/credit flow, supplier flow, expense flow, reporting, audit log,
   offline considerations, security, phone↔computer data flow, module
   connection map.
2. **02_schema.sql** — complete table definitions: enums, all 19 tables (the 18
   requested + `supplier_payments`, which the spec's flows required but didn't
   list explicitly — see architecture §11/§14), indexes, constraints, views,
   `updated_at` triggers, and the `handle_new_user` signup trigger.
3. **03_rls_policies.sql** — Row Level Security: store-isolation helper
   functions and a policy per table per role, matching the RBAC table in
   the architecture doc.
4. **04_functions_triggers.sql** — the atomic business-logic functions:
   `process_sale` (FEFO, row-locked, stock-safe), `process_purchase`,
   `process_return`, `adjust_stock`, `record_customer_payment`,
   `record_supplier_payment`, and the generic audit-log trigger.
5. **05_DECISIONS_NEEDED.md** — 12 specific judgment calls I made with a
   reasonable default; skim before Phase 3 so Claude Code isn't building on
   an assumption you'd actually want changed.

## How to use this with Claude Code

1. Create a new Supabase project (or point at an existing empty one).
2. Copy `02_schema.sql`, `03_rls_policies.sql`, `04_functions_triggers.sql` into
   `supabase/migrations/` as three separate numbered migration files (or run
   them in that order via `supabase db push` / the SQL editor).
3. Run `supabase gen types typescript --project-id <id> > types/database.types.ts`
   once the schema is applied, so Claude Code has real generated types from the
   start instead of guessing shapes.
4. Give Claude Code `01_ARCHITECTURE.md` and `05_DECISIONS_NEEDED.md` as context
   (drop them in the repo root or paste them into the first message) and tell it
   to begin **Phase 3 — Authentication + store setup**, following the phase
   order and "test after every phase" discipline from your original spec.

## What's intentionally NOT in this package

- No UI/components yet (you asked for architecture + database only).
- No `next.config.js` / `package.json` / actual Next.js project files — Claude
  Code should scaffold the real project (item 41 of your spec: inspect first,
  don't blindly generate) since you may already have a starter project or
  specific preferences (App Router config, ESLint rules, etc.) it should detect.
- Tax math is schema-ready but not wired into `process_sale` — see Decision #6.
- No seed/demo data script yet — recommended as part of Phase 2 wrap-up in
  Claude Code once the schema is confirmed, kept clearly separate from
  production data per your spec's §38.
