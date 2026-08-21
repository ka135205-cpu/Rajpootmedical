import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth/getSessionContext';
import { createClient } from '@/lib/supabase/server';
import { ReturnForm } from '@/components/sales/ReturnForm';
import { RecordPaymentForm } from '@/components/sales/RecordPaymentForm';

export default async function SaleDetailPage({
  params,
}: {
  params: Promise<{ saleId: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect('/login');

  const { saleId } = await params;
  const supabase = await createClient();

  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .select(
      'id, invoice_number, subtotal, discount_total, total, amount_paid, payment_method, status, created_at, customer_id, customers(name, phone)'
    )
    .eq('id', saleId)
    .eq('store_id', session.storeId)
    .maybeSingle();

  if (saleError) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        Could not load this sale: {saleError.message}
      </div>
    );
  }
  if (!sale) notFound();

  const [{ data: items }, { data: payments }, { data: returnedRows }] = await Promise.all([
    supabase
      .from('sale_items_detail_view')
      .select('id, quantity, unit_price, line_total, products(name)')
      .eq('sale_id', saleId),
    supabase
      .from('payments')
      .select('id, amount, payment_method, payment_date, created_at')
      .eq('sale_id', saleId)
      .order('created_at'),
    supabase
      .from('return_items')
      .select('sale_item_id, quantity, returns!inner(sale_id, status)')
      .eq('returns.sale_id', saleId),
  ]);

  const totalPaid = (payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  const remaining = Math.max(sale.total - totalPaid, 0);

  const returnedByItem = new Map<string, number>();
  for (const r of returnedRows ?? []) {
    if ((r.returns as any)?.status === 'approved') {
      returnedByItem.set(r.sale_item_id, (returnedByItem.get(r.sale_item_id) ?? 0) + r.quantity);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/sales" className="text-sm text-slate-500 hover:text-slate-700">
            ← Back to Sales
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">
            Invoice {sale.invoice_number}
          </h1>
          <p className="text-sm text-slate-500">{new Date(sale.created_at).toLocaleString()}</p>
        </div>
        <Link
          href={`/pos/receipt/${sale.id}`}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          View / Print Receipt
        </Link>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex justify-between text-sm">
          <span className="text-slate-500">Customer</span>
          <span className="font-medium text-slate-900">
            {(sale.customers as any)?.name ?? 'Walk-in'}
          </span>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs font-medium text-slate-500">
            <tr>
              <th className="py-2">Item</th>
              <th className="py-2 text-center">Qty</th>
              <th className="py-2 text-right">Price</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(items ?? []).map((item) => (
              <tr key={item.id}>
                <td className="py-2">{(item.products as any)?.name ?? 'Item'}</td>
                <td className="py-2 text-center">{item.quantity}</td>
                <td className="py-2 text-right">Rs. {item.unit_price}</td>
                <td className="py-2 text-right">Rs. {item.line_total}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span>Rs. {sale.subtotal}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Discount</span>
            <span>Rs. {sale.discount_total}</span>
          </div>
          <div className="flex justify-between text-base font-semibold text-slate-900">
            <span>Total</span>
            <span>Rs. {sale.total}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Paid</span>
            <span>Rs. {totalPaid.toFixed(2)}</span>
          </div>
          {remaining > 0 && (
            <div className="flex justify-between font-medium text-amber-700">
              <span>Outstanding</span>
              <span>Rs. {remaining.toFixed(2)}</span>
            </div>
          )}
        </div>
      </section>

      {remaining > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Record Payment</h2>
          <RecordPaymentForm saleId={sale.id} remaining={remaining} />
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Returns</h2>
        <ReturnForm
          saleId={sale.id}
          items={(items ?? []).map((item) => ({
            saleItemId: item.id,
            productName: (item.products as any)?.name ?? 'Item',
            quantity: item.quantity,
            alreadyReturned: returnedByItem.get(item.id) ?? 0,
          }))}
        />
      </section>
    </div>
  );
}
