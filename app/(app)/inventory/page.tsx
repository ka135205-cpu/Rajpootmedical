import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth/getSessionContext';
import { permissions } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';
import {
  getStockStatus,
  type ProductRow,
  type StockSummaryRow,
  type StockStatus,
} from '@/lib/inventory/types';
import { StockStatusBadge } from '@/components/inventory/StockStatusBadge';

const FILTERS: { key: StockStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'low_stock', label: 'Low Stock' },
  { key: 'out_of_stock', label: 'Out of Stock' },
  { key: 'expiring_soon', label: 'Expiring Soon' },
  { key: 'expired', label: 'Expired' },
];

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect('/login');

  const { q = '', filter = 'all' } = await searchParams;
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from('store_settings')
    .select('expiry_alert_days')
    .eq('store_id', session.storeId)
    .single();
  const expiryAlertDays = settings?.expiry_alert_days ?? 90;

  let query = supabase
    .from('products')
    .select(
      'id, name, generic_name, brand, category_id, medicine_type, barcode, min_stock_level, rack_location, description, is_active, categories(name)'
    )
    .eq('store_id', session.storeId)
    .eq('is_active', true)
    .order('name');

  if (q) {
    query = query.or(`name.ilike.%${q}%,generic_name.ilike.%${q}%,barcode.eq.${q}`);
  }

  const { data: productsData, error: productsError } = await query;
  const products = (productsData ?? []) as unknown as ProductRow[];

  const { data: summaryData, error: summaryError } = await supabase
    .from('product_stock_summary')
    .select('product_id, current_stock, expired_stock, inventory_value, next_expiry_date')
    .eq('store_id', session.storeId);
  const summaries = (summaryData ?? []) as StockSummaryRow[];
  const summaryByProduct = new Map(summaries.map((s) => [s.product_id, s]));

  const rows = products
    .map((p) => ({
      product: p,
      summary: summaryByProduct.get(p.id),
      status: getStockStatus(p, summaryByProduct.get(p.id), expiryAlertDays),
    }))
    .filter((row) => filter === 'all' || row.status === filter);

  const canManage = permissions.canManageProducts(session.role);
  const loadError = productsError || summaryError;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Inventory</h1>
          <p className="text-sm text-slate-500">
            {rows.length} product{rows.length === 1 ? '' : 's'}
            {filter !== 'all' ? ' matching this filter' : ''}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Link
              href="/inventory/categories"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Categories
            </Link>
            <Link
              href="/suppliers"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Suppliers
            </Link>
            <Link
              href="/inventory/new"
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              + Add Product
            </Link>
          </div>
        )}
      </div>

      <form className="flex gap-2" action="/inventory">
        <input type="hidden" name="filter" value={filter} />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by name, generic name, or barcode…"
          className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Search
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/inventory?filter=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              filter === f.key
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {loadError && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load inventory: {loadError.message}
        </div>
      )}

      {!loadError && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <p className="text-sm text-slate-500">
            {q || filter !== 'all'
              ? 'No products match your search or filter.'
              : 'No products yet.'}
          </p>
          {canManage && !q && filter === 'all' && (
            <Link
              href="/inventory/new"
              className="mt-3 inline-block text-sm font-medium text-emerald-600 hover:text-emerald-700"
            >
              Add your first product →
            </Link>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Category</th>
                <th className="hidden px-4 py-3 sm:table-cell">Stock</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ product, summary, status }) => (
                <tr key={product.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/inventory/${product.id}`} className="block">
                      <p className="font-medium text-slate-900">{product.name}</p>
                      <p className="text-xs text-slate-500">
                        {[product.generic_name, product.brand].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{product.categories?.name ?? '—'}</td>
                  <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">
                    {summary?.current_stock ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    <StockStatusBadge status={status} />
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
