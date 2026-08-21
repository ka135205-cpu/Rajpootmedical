import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth/getSessionContext';

/**
 * Phase 3 stub: confirms the store/owner were created successfully and
 * hands off to the dashboard. The full multi-step wizard (categories,
 * first products, receipt settings — spec §37) belongs to a later phase
 * once Inventory (Phase 5) exists to build step 3 against.
 */
export default async function OnboardingPage() {
  const session = await getSessionContext();

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-slate-900">
          Welcome, {session.fullName || 'Owner'}
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          {session.storeName} is set up. The full setup wizard (categories, first
          products, receipt settings) will appear here once Inventory is built.
        </p>
        <a
          href="/dashboard"
          className="inline-block rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700"
        >
          Go to Dashboard
        </a>
      </div>
    </div>
  );
}
