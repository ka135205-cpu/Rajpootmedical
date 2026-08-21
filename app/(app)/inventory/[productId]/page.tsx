import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth/getSessionContext';
import { permissions } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';
import { AddBatchSection } from '@/components/inventory/AddBatchSection';

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect('/login');

  const { productId } = await params;
  const supabase = await createClient();

  const { data: product, error: productError } = await supabase
    .from('products')
    .select(
      'id, name, generic_name, brand, category_id, medicine_type, barcode, min_stock_level, rack_location, description, is_active, categories(name)'
    )
    .eq('id', productId)
    .eq('store_id', session.storeId)
    .maybeSingle();

  if (productError) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        Could not load this product: {productError.message}
      </div>
    );
  }
  if (!product) notFound();

  // Batches: read via the masked view (see 11_phase3_bugfixes.sql) — cost is
  // automatically null for a cashier session, real values for owner.
  const { data: batches } = await supabase
    .from('product_batches_pos_view')
    .select('id, batch_number, quantity, purchase_price, selling_price, expiry_date, received_date')
    .eq('product_id', productId)
    .order('expiry_date', { ascending: true });

  const canManage = permissions.canManageProducts(session.role);

  let suppliers: { id: string; name: string }[] = [];
  let movements: any[] = [];
  if (canManage) {
    const [{ data: supplierData }, { data: movementData }] = await Promise.all([
      supabase.from('suppliers').select('id, name').eq('store_id', session.storeId).eq('is_active', true).order('name'),
      supabase
        .from('stock_movements')
        .select('id, movement_type, quantity_change, quantity_after, notes, created_at')
        .eq('product_id', productId)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);
    suppliers = supplierData ?? [];
    movements = movementData ?? [];
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/inventory" className="text-sm text-slate-500 hover:text-slate-700">
          ← Back to Inventory
        </Link>
        <div className="mt-1 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{product.name}</h1>
            <p className="text-sm text-slate-500">
              {[product.generic_name, product.brand, (product.categories as any)?.name]
                .filter(Boolean)
                .join(' · ') || 'No additional details'}
            </p>
          </div>
          {canManage && (
            <Link
              href={`/inventory/${product.id}/edit`}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Edit
            </Link>
          )}
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-slate-400">Barcode</dt>
            <dd className="font-medium text-slate-900">{product.barcode ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Medicine type</dt>
            <dd className="font-medium text-slate-900">{product.medicine_type ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Rack location</dt>
            <dd className="font-medium text-slate-900">{product.rack_location ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Min stock level</dt>
            <dd className="font-medium text-slate-900">{product.min_stock_level}</dd>
          </div>
        </dl>
        {product.description && (
          <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">
            {product.description}
          </p>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Batches</h2>
          {canManage && <AddBatchSection productId={product.id} suppliers={suppliers} />}
        </div>

        {(!batches || batches.length === 0) && (
          <p className="rounded-xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">
            No stock batches yet.
          </p>
        )}

        {batches && batches.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Batch #</th>
                  <th className="px-4 py-2.5">Qty</th>
                  {canManage && <th className="px-4 py-2.5">Cost</th>}
                  <th className="px-4 py-2.5">Selling Price</th>
                  <th className="px-4 py-2.5">Expiry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batches.map((b) => {
                  const expired = b.expiry_date < today;
                  return (
                    <tr key={b.id} className={expired ? 'bg-red-50' : ''}>
                      <td className="px-4 py-2.5 text-slate-900">{b.batch_number ?? '—'}</td>
                      <td className="px-4 py-2.5 text-slate-600">{b.quantity}</td>
                      {canManage && (
                        <td className="px-4 py-2.5 text-slate-600">
                          {b.purchase_price != null ? `Rs. ${b.purchase_price}` : '—'}
                        </td>
                      )}
                      <td className="px-4 py-2.5 text-slate-600">Rs. {b.selling_price}</td>
                      <td className={`px-4 py-2.5 ${expired ? 'font-medium text-red-700' : 'text-slate-600'}`}>
                        {b.expiry_date}
                        {expired && ' (expired)'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canManage && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Stock Movement History</h2>
          {movements.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">
              No stock movements recorded yet.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">Change</th>
                    <th className="px-4 py-2.5">Balance After</th>
                    <th className="px-4 py-2.5">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-2.5 text-slate-600">
                        {new Date(m.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 capitalize text-slate-600">{m.movement_type}</td>
                      <td
                        className={`px-4 py-2.5 font-medium ${
                          m.quantity_change >= 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {m.quantity_change >= 0 ? '+' : ''}
                        {m.quantity_change}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{m.quantity_after}</td>
                      <td className="px-4 py-2.5 text-slate-500">{m.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
