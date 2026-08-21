import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth/getSessionContext';
import { permissions } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';
import { ApproveReturnButtons } from '@/components/sales/ApproveReturnButtons';

export default async function ReturnsPage() {
  const session = await getSessionContext();
  if (!session) redirect('/login');
  if (!permissions.canApproveReturns(session.role)) redirect('/more');

  const supabase = await createClient();
  const { data: returns, error } = await supabase
    .from('returns')
    .select('id, reason, refund_amount, status, created_at, sales(invoice_number)')
    .eq('store_id', session.storeId)
    .order('created_at', { ascending: false })
    .limit(100);

  const pending = (returns ?? []).filter((r) => r.status === 'pending');
  const resolved = (returns ?? []).filter((r) => r.status !== 'pending');

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/more" className="text-sm text-slate-500 hover:text-slate-700">
          ← Back to More
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">Returns</h1>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</p>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          Pending Approval ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">
            Nothing waiting for approval.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {pending.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    Invoice {(r.sales as any)?.invoice_number} — Rs. {r.refund_amount}
                  </p>
                  <p className="text-xs text-slate-500">
                    {r.reason || 'No reason given'} · {new Date(r.created_at).toLocaleString()}
                  </p>
                </div>
                <ApproveReturnButtons returnId={r.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">History</h2>
        {resolved.length === 0 ? (
          <p className="text-sm text-slate-400">No resolved returns yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {resolved.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>
                  Invoice {(r.sales as any)?.invoice_number} — Rs. {r.refund_amount}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                    r.status === 'approved'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
