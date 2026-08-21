# Phase 3 Implementation Report

## 1. Repository review — summary (full detail in `10_PHASE3_CODE_REVIEW.md`)

Read all six source-of-truth files plus the prior Phase 3 SQL patches.
Found **2 genuine bugs**, both now fixed in `11_phase3_bugfixes.sql`:

1. **Critical:** `06_phase3_schema_and_rls_updates.sql` combined
   `security_invoker = true` on the cost-masking views with revoking
   `SELECT` on the underlying tables — this would have caused "permission
   denied" for *everyone*, owner included, the moment those views were
   queried. Fixed by removing `security_invoker` (the masking/isolation
   logic doesn't need it — it's driven by `SECURITY DEFINER` helper
   functions that read the real session regardless).
2. **Critical:** the original `stores` RLS `SELECT` policy made the owner
   registration flow's `insert().select()` silently return no row, because
   `RETURNING` is filtered by RLS and `current_store_id()` is still `null`
   at the instant the store is created (no `user_roles` row exists yet).
   Fixed with a new `create_store_and_owner()` `SECURITY DEFINER` function
   that returns a scalar `uuid`, never a RLS-filtered table row — matching
   the pattern already used for every other multi-step write in this
   system. The register page/route were updated to use it.

Plus 2 low-severity consistency fixes (`adjust_stock`/
`record_supplier_payment` now call the shared role-check helper instead of
a literal list). No architecture or schema redesign was needed — see the
review doc for the full reasoning and the "confirmed NOT a bug" list.

---

## 2. What was implemented (Phase 3 scope only)

A real Next.js 14 App Router project at `rajput-medical-store/`, 45 files:

- **Project setup**: `package.json`, `tsconfig.json`, `next.config.js`,
  `tailwind.config.ts`, `postcss.config.js`, `.eslintrc.json`, `.gitignore`
- **Supabase client/server config**: `lib/supabase/client.ts`,
  `lib/supabase/server.ts` — anon key only, RLS-enforced
- **Auth**: `middleware.ts` (session refresh + route protection),
  login page, owner-registration page (fixed to use the new RPC),
  logout route
- **Store setup**: `/api/setup/create-store` (now RLS-safe),
  minimal onboarding landing page
- **RBAC**: `lib/auth/permissions.ts` (owner/cashier capability map),
  `lib/auth/getSessionContext.ts` (server-side role/store resolver),
  owner-only guard on the Settings page (redirects cashiers server-side,
  not just hidden in the UI)
- **Role-based navigation**: `lib/nav.ts` filters nav items by role
  (Settings hidden from cashier)
- **Responsive shell**: `components/nav/Sidebar.tsx` (desktop, hidden
  below `lg`), `components/nav/BottomNav.tsx` (mobile, hidden at `lg`+),
  `app/(app)/layout.tsx` ties them together with an offline banner
- **Dashboard shell**: card-grid layout, role-aware (profit card hidden
  from cashiers), ready for Phase 12 to wire in real numbers
- **Settings shell**: store info (read-only for now), team list, and a
  working **owner-only cashier-creation form** wired to the real API route
- **PWA foundation**: `app/manifest.ts` (Next.js native manifest),
  hand-written `public/sw.js` (app-shell caching, explicitly never
  caches `/api` or Supabase requests), registration component
- **Offline foundation** (carried forward, wired into the shell):
  IndexedDB queue + sync manager + `useOnlineStatus` hook powering the
  banner — POS itself isn't built yet, but the infrastructure the offline
  architecture doc describes is in place and ready for Phase 7 to use.
- **Placeholder pages** for `/pos`, `/inventory`, `/sales` so the nav
  doesn't 404 before those phases exist — each just says which phase
  builds it; no fake data, no "Coming Soon" dead buttons.

## 3. What was explicitly NOT built (per your scope instruction)

POS, inventory CRUD, purchases, suppliers, customers, reports, returns,
expenses — all later phases. The dashboard/settings pages are structural
shells with real auth/role wiring but placeholder (`—`) data values.

---

## 4. Verification actually performed — and its real limits

**Important:** this sandbox has no network access. I confirmed this
directly rather than assuming it:

```
npm install
→ npm error code E403 403 Forbidden - GET https://registry.npmjs.org/@supabase%2fssr
```

This means `next`, `@supabase/ssr`, `@supabase/supabase-js`, `tailwindcss`,
and every other dependency in `package.json` **cannot be installed here**,
which means `next build`, `npm run lint`, and a real `tsc` typecheck
against actual Next.js/Supabase/React types **cannot be executed in this
environment**. I will not claim they passed.

**What I could and did do instead:**
1. A syntax-only TypeScript pass using a different, globally-available
   `tsc`, ignoring the expected "cannot find module 'next'" /
   "cannot find module 'react'" / missing `@types/node` noise (all
   expected, since those packages aren't installed) and specifically
   checking for anything *else* — real syntax errors, typos, mismatched
   braces, malformed JSX. **Result: zero unexpected errors** across all 31
   `.ts`/`.tsx` files, both before and after adding the placeholder pages.
2. Verified every internal `@/...` import in every file actually resolves
   to a real file on disk — **zero missing imports**.
3. Manually re-read every new file for logic correctness (the same way I
   caught the two SQL bugs above) — no issues found, but this is a human-
   style read, not a compiler guarantee.

**What genuinely still needs to happen, against a real environment:**
- `npm install && npm run build && npm run typecheck && npm run lint`
- Running the two Supabase migrations (`06`→`07`→`11`) against a real
  project and confirming they apply cleanly
- Actually logging in, registering a store, creating a cashier, and
  clicking through both roles on a phone and a laptop
- Lighthouse/PWA installability check

None of that happened here — it can't, in this sandbox. Claude Code,
pointed at your real Supabase project with real network access, is the
right place to run all of it. I'd rather tell you exactly where the line
is than round it up to "done."

---

## 5. Environment variables needed (exact names, no invented values)

Create `rajput-medical-store/.env.local` (already gitignored) from
`.env.local.example`:

```
NEXT_PUBLIC_SUPABASE_URL=          # Project Settings → API → Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # Project Settings → API → anon/public key
SUPABASE_SERVICE_ROLE_KEY=         # Project Settings → API → service_role key
                                    # (server-only — only used by
                                    # /api/users/create-cashier; never
                                    # exposed to the browser)
```

I have not invented, guessed, or hard-coded any of these anywhere in the
code — both Supabase clients and the cashier-creation route read them from
`process.env` only.

---

## 6. Testing checklist for Claude Code to actually run

1. `cd rajput-medical-store && npm install`
2. Apply SQL migrations in order: `02 → 03 → 04 → 06 → 07 → 11`
3. `supabase gen types typescript --project-id <id> > types/database.types.ts`
   (replaces the hand-written placeholder — see the warning comment at the
   top of that file)
4. `npm run typecheck` — should be clean once real types replace the
   placeholder; re-check the `settings/page.tsx` embedded-join `as any`
   casts once real generated types are in and tighten them if possible
5. `npm run lint`
6. `npm run build`
7. `npm run dev` — manually test:
   - Register a new owner → confirm redirected to `/onboarding` → confirm
     a `stores` row, one `user_roles` row (`owner`), and one
     `store_settings` row now exist (this is the exact flow Bug 2 broke —
     verify it end-to-end)
   - Log out, log back in as owner → dashboard loads, sidebar shows all 5
     items including Settings
   - From Settings, create a cashier account → log in as that cashier in
     a different browser/incognito → confirm Settings is not in the nav
     AND that navigating to `/settings` directly redirects to `/dashboard`
   - Resize to a phone width (or use an actual Android phone) → confirm
     sidebar disappears, bottom nav appears with ≤5 items, no horizontal
     scroll
   - Chrome DevTools → Application → Manifest → confirm it's valid and
     "Add to Home Screen" is available (icons will show broken/default
     until real PNGs are added — see `public/icons/README.md`)
   - DevTools → Network → offline → confirm the amber offline banner
     appears

Do not proceed to Phase 4 until step 7's items all pass for real.
