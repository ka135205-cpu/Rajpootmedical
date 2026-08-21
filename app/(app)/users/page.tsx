import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth/getSessionContext';
import { permissions } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { CreateCashierForm } from '@/app/(app)/settings/CreateCashierForm';
import { CashierStatusButton } from '@/components/users/CashierStatusButton';

export default async function UsersPage() {
  const session = await getSessionContext();
  if (!session) redirect('/login');
  if (!permissions.canManageUsers(session.role)) redirect('/more');

  const supabase = await createClient();
  const { data: teamMembers } = await supabase
    .from('user_roles')
    .select('user_id, role, profiles(full_name)')
    .eq('store_id', session.storeId);

  // Ban status lives on auth.users, not reachable via the normal RLS-scoped
  // client — this Server Component runs only on the server, so using the
  // service role here (to read status, never to bypass RLS on app data)
  // does not expose it to the browser.
  const cashiers = (teamMembers ?? []).filter((m) => m.role === 'cashier');
  let disabledStatus = new Map<string, boolean>();

  if (cashiers.length > 0 && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createSupabaseJsClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const results = await Promise.all(
      cashiers.map((c) => admin.auth.admin.getUserById(c.user_id))
    );
    disabledStatus = new Map(
      results.map((r, i) => [
        cashiers[i].user_id,
        Boolean(r.data.user?.banned_until && new Date(r.data.user.banned_until) > new Date()),
      ])
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/more" className="text-sm text-slate-500 hover:text-slate-700">
          ← Back to More
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">Users</h1>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Team</h2>
        <ul className="mb-4 divide-y divide-slate-100">
          {(teamMembers ?? []).map((member) => (
            <li key={member.user_id} className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <span className="text-slate-900">
                  {(member.profiles as any)?.full_name ?? 'Unnamed user'}
                </span>
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-600">
                  {member.role}
                </span>
                {disabledStatus.get(member.user_id) && (
                  <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                    Disabled
                  </span>
                )}
              </div>
              {member.role === 'cashier' && (
                <CashierStatusButton
                  userId={member.user_id}
                  currentlyDisabled={disabledStatus.get(member.user_id) ?? false}
                />
              )}
            </li>
          ))}
        </ul>

        <CreateCashierForm />
      </section>
    </div>
  );
}
