import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionContext } from '@/lib/auth/getSessionContext';
import { createClient } from '@/lib/supabase/server';
import { PrintButton } from '@/components/pos/PrintButton';

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ saleId: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect('/login');

  const { saleId } = await params;
  const supabase = await createClient();

  const { data: sale } = await supabase
    .from('sales')
    .select(
      'id, invoice_number, subtotal, discount_total, total, amount_paid, change_due, payment_method, created_at, status, cashier_id, customer_id, customers(name, phone), profiles!sales_cashier_id_fkey(full_name)'
    )
    .eq('id', saleId)
    .eq('store_id', session.storeId)
    .maybeSingle();

  if (!sale) notFound();

  const [{ data: items }, { data: store }, { data: settings }] = await Promise.all([
    supabase
      .from('sale_items_detail_view')
      .select('id, product_id, quantity, unit_price, discount, line_total, products(name)')
      .eq('sale_id', saleId),
    supabase.from('stores').select('name, address, phone').eq('id', session.storeId).single(),
    supabase
      .from('store_settings')
      .select('invoice_footer, currency_symbol, receipt_width_mm')
      .eq('store_id', session.storeId)
      .single(),
  ]);

  const widthMm = settings?.receipt_width_mm ?? 80;
  const currency = settings?.currency_symbol ?? 'Rs.';

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/sales" className="text-sm text-slate-500 hover:text-slate-700">
          ← Back to Sales
        </Link>
        <PrintButton />
      </div>

      <div
        id="receipt"
        className="mx-auto border border-slate-200 bg-white p-4 text-sm print:border-0"
        style={{ width: `${widthMm}mm`, maxWidth: '100%' }}
      >
        <div className="mb-3 text-center">
          <p className="font-semibold">{store?.name ?? 'Rajput Medical Store'}</p>
          {store?.address && <p className="text-xs">{store.address}</p>}
          {store?.phone && <p className="text-xs">{store.phone}</p>}
        </div>

        <div className="mb-2 border-y border-dashed border-slate-300 py-2 text-xs">
          <div className="flex justify-between">
            <span>Invoice</span>
            <span className="font-medium">{sale.invoice_number}</span>
          </div>
          <div className="flex justify-between">
            <span>Date</span>
            <span>{new Date(sale.created_at).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>Cashier</span>
            <span>{(sale.profiles as any)?.full_name ?? '—'}</span>
          </div>
          {sale.customers && (
            <div className="flex justify-between">
              <span>Customer</span>
              <span>{(sale.customers as any).name}</span>
            </div>
          )}
          {sale.status !== 'completed' && (
            <p className="mt-1 font-medium capitalize text-red-600">
              {sale.status.replace('_', ' ')}
            </p>
          )}
        </div>

        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-300 text-left">
              <th className="py-1">Item</th>
              <th className="py-1 text-center">Qty</th>
              <th className="py-1 text-right">Price</th>
              <th className="py-1 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="py-1">{(item.products as any)?.name ?? 'Item'}</td>
                <td className="py-1 text-center">{item.quantity}</td>
                <td className="py-1 text-right">{item.unit_price}</td>
                <td className="py-1 text-right">{item.line_total}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-2 space-y-0.5 border-t border-dashed border-slate-300 pt-2 text-xs">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>
              {currency} {sale.subtotal}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Discount</span>
            <span>
              {currency} {sale.discount_total}
            </span>
          </div>
          <div className="flex justify-between text-sm font-semibold">
            <span>Total</span>
            <span>
              {currency} {sale.total}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Paid ({sale.payment_method})</span>
            <span>
              {currency} {sale.amount_paid}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Change</span>
            <span>
              {currency} {sale.change_due}
            </span>
          </div>
          {sale.amount_paid < sale.total && (
            <div className="flex justify-between font-medium text-amber-700">
              <span>Outstanding (credit)</span>
              <span>
                {currency} {(sale.total - sale.amount_paid).toFixed(2)}
              </span>
            </div>
          )}
        </div>

        <p className="mt-3 text-center text-xs text-slate-500">
          {settings?.invoice_footer ?? 'Thank you for visiting Rajput Medical Store'}
        </p>
      </div>

      <style>{`
        @media print {
          @page { size: ${widthMm}mm auto; margin: 0; }
          body { margin: 0; }
        }
      `}</style>
    </div>
  );
}
