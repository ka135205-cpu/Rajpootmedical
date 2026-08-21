import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth/getSessionContext';
import { createClient } from '@/lib/supabase/server';

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect('/login');

  const { customerId } = await params;
  const supabase = await createClient();

  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, phone, address, notes')
    .eq('id', customerId)
    .eq('store_id', session.storeId)
    .maybeSingle();

  if (!customer) notFound();

  const [{ data: sales }, { data: payments }, { data: outstandingRow }] = await Promise.all([
    supabase
      .from('sales')
      .select('id, invoice_number, total, created_at, status')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false }),
    supabase
      .from('payments')
      .select('id, amount, payment_method, payment_date, sale_id')
      .eq('customer_id', customerId)
      .order('payment_date', { ascending: false }),
    supabase
      .from('customer_outstanding')
      .select('outstanding_balance, total_invoiced, total_paid')
      .eq('customer_id', customerId)
      .maybeSingle(),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/customers" className="text-sm text-slate-500 hover:text-slate-700">
          ← Back to Customers
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">{customer.name}</h1>
        <p className="text-sm text-slate-500">
          {[customer.phone, customer.address].filter(Boolean).join(' · ') || 'No contact info'}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-400">Total Purchases</p>
          <p className="text-lg font-semibold text-slate-900">
            Rs. {outstandingRow?.total_invoiced ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-400">Total Paid</p>
          <p className="text-lg font-semibold text-slate-900">
            Rs. {outstandingRow?.total_paid ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs text-amber-700">Outstanding</p>
          <p className="text-lg font-semibold text-amber-800">
            Rs. {outstandingRow?.outstanding_balance ?? 0}
          </p>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Purchase History</h2>
        {!sales || sales.length === 0 ? (
          <p className="text-sm text-slate-400">No purchases yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {sales.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <Link href={`/sales/${s.id}`} className="font-medium text-emerald-700">
                  Invoice {s.invoice_number}
                </Link>
                <span className="text-slate-500">{new Date(s.created_at).toLocaleDateString()}</span>
                <span className="font-medium text-slate-900">Rs. {s.total}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Payment History</h2>
        {!payments || payments.length === 0 ? (
          <p className="text-sm text-slate-400">No payments recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-slate-600">{p.payment_date}</span>
                <span className="capitalize text-slate-500">{p.payment_method}</span>
                <span className="font-medium text-slate-900">Rs. {p.amount}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
