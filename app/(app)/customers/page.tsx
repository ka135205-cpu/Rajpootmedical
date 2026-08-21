import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth/getSessionContext';
import { createClient } from '@/lib/supabase/server';
import { CustomerForm } from '@/components/customers/CustomerForm';

export default async function CustomersPage() {
  const session = await getSessionContext();
  if (!session) redirect('/login');

  const supabase = await createClient();

  const [{ data: customers, error }, { data: outstanding }] = await Promise.all([
    supabase
      .from('customers')
      .select('id, name, phone')
      .eq('store_id', session.storeId)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('customer_outstanding')
      .select('customer_id, outstanding_balance')
      .eq('store_id', session.storeId),
  ]);

  const balanceByCustomer = new Map<string, number>(
    (outstanding ?? []).map((o) => [o.customer_id as string, Number(o.outstanding_balance)])
  );

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/more" className="text-sm text-slate-500 hover:text-slate-700">
            ← Back to More
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">Customers</h1>
        </div>
        <CustomerForm />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</p>
      )}

      {!error && (!customers || customers.length === 0) ? (
        <p className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
          No customers yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(customers ?? []).map((c) => {
                const balance = balanceByCustomer.get(c.id) ?? 0;
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/customers/${c.id}`} className="font-medium text-emerald-700">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.phone ?? '—'}</td>
                    <td
                      className={`px-4 py-3 font-medium ${
                        balance > 0 ? 'text-amber-700' : 'text-slate-500'
                      }`}
                    >
                      Rs. {balance.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
