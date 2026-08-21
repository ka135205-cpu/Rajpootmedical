import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth/getSessionContext';
import { createClient } from '@/lib/supabase/server';

export default async function SalesHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; from?: string; to?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect('/login');

  const { q = '', from = '', to = '' } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from('sales')
    .select('id, invoice_number, total, payment_method, status, created_at, customers(name)')
    .eq('store_id', session.storeId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (q) query = query.ilike('invoice_number', `%${q}%`);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', `${to}T23:59:59`);

  const { data: sales, error } = await query;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Sales History</h1>
        <p className="text-sm text-slate-500">
          {session.role === 'owner' ? 'All transactions' : 'Your transactions'}
        </p>
      </div>

      <form className="flex flex-wrap gap-2" action="/sales">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Invoice number…"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <input
          type="date"
          name="from"
          defaultValue={from}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="date"
          name="to"
          defaultValue={to}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Filter
        </button>
      </form>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</p>
      )}

      {!error && (!sales || sales.length === 0) ? (
        <p className="rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">
          No sales found.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(sales ?? []).map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/sales/${s.id}`} className="font-medium text-emerald-700">
                      {s.invoice_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {new Date(s.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {(s.customers as any)?.name ?? 'Walk-in'}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">Rs. {s.total}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        s.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {s.status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
