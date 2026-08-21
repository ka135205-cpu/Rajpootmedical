import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth/getSessionContext';
import { permissions } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect('/login');
  if (!permissions.canViewProfit(session.role)) redirect('/more');

  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const { from = thirtyDaysAgo, to = today } = await searchParams;

  const supabase = await createClient();

  const [{ data: dailySales }, { data: expensesInRange }, { data: soldItems }, { data: stockSummary }] =
    await Promise.all([
      supabase
        .from('daily_sales_summary')
        .select('sale_date, transaction_count, revenue, gross_profit, items_sold')
        .eq('store_id', session.storeId)
        .gte('sale_date', from)
        .lte('sale_date', to)
        .order('sale_date', { ascending: false }),
      supabase
        .from('expenses')
        .select('amount')
        .eq('store_id', session.storeId)
        .gte('expense_date', from)
        .lte('expense_date', to),
      supabase
        .from('sale_items_detail_view')
        .select('quantity, line_total, line_profit, products(name), sales!inner(store_id, created_at, status)')
        .eq('sales.store_id', session.storeId)
        .gte('sales.created_at', from)
        .lte('sales.created_at', `${to}T23:59:59`)
        .neq('sales.status', 'returned'),
      supabase
        .from('product_stock_summary')
        .select('product_id, name, current_stock, expired_stock, inventory_value, next_expiry_date, min_stock_level')
        .eq('store_id', session.storeId),
    ]);

  const totalRevenue = (dailySales ?? []).reduce((s, d) => s + Number(d.revenue), 0);
  const totalGrossProfit = (dailySales ?? []).reduce((s, d) => s + Number(d.gross_profit), 0);
  const totalExpenses = (expensesInRange ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const netProfit = totalGrossProfit - totalExpenses;
  const totalTransactions = (dailySales ?? []).reduce((s, d) => s + Number(d.transaction_count), 0);

  const lowStock = (stockSummary ?? []).filter(
    (p) => p.current_stock > 0 && p.current_stock < p.min_stock_level
  );
  const outOfStock = (stockSummary ?? []).filter((p) => p.current_stock === 0);
  const expired = (stockSummary ?? []).filter((p) => p.expired_stock > 0);
  const totalInventoryValue = (stockSummary ?? []).reduce((s, p) => s + Number(p.inventory_value), 0);

  const bestSellersMap = new Map<string, { quantity: number; revenue: number; profit: number }>();
  for (const item of soldItems ?? []) {
    const name = (item.products as any)?.name ?? 'Unknown';
    const entry = bestSellersMap.get(name) ?? { quantity: 0, revenue: 0, profit: 0 };
    entry.quantity += item.quantity;
    entry.revenue += Number(item.line_total);
    entry.profit += Number(item.line_profit ?? 0);
    bestSellersMap.set(name, entry);
  }
  const bestSellers = Array.from(bestSellersMap.entries())
    .sort((a, b) => b[1].quantity - a[1].quantity)
    .slice(0, 10);

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <Link href="/more" className="text-sm text-slate-500 hover:text-slate-700">
          ← Back to More
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">Reports</h1>
      </div>

      <form className="flex gap-2" action="/reports">
        <input type="date" name="from" defaultValue={from} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input type="date" name="to" defaultValue={to} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Apply
        </button>
      </form>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Business Overview ({from} to {to})</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ReportCard label="Revenue" value={`Rs. ${totalRevenue.toLocaleString()}`} />
          <ReportCard label="Gross Profit" value={`Rs. ${totalGrossProfit.toLocaleString()}`} />
          <ReportCard label="Expenses" value={`Rs. ${totalExpenses.toLocaleString()}`} />
          <ReportCard label="Net Profit" value={`Rs. ${netProfit.toLocaleString()}`} highlight />
          <ReportCard label="Transactions" value={String(totalTransactions)} />
          <ReportCard label="Inventory Value" value={`Rs. ${totalInventoryValue.toLocaleString()}`} />
          <ReportCard label="Low Stock Items" value={String(lowStock.length)} />
          <ReportCard label="Out of Stock" value={String(outOfStock.length)} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Daily Sales</h2>
        {!dailySales || dailySales.length === 0 ? (
          <p className="text-sm text-slate-400">No sales in this date range.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Transactions</th>
                  <th className="px-4 py-2.5">Revenue</th>
                  <th className="px-4 py-2.5">Gross Profit</th>
                  <th className="px-4 py-2.5">Items Sold</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dailySales.map((d) => (
                  <tr key={d.sale_date}>
                    <td className="px-4 py-2.5">{d.sale_date}</td>
                    <td className="px-4 py-2.5">{d.transaction_count}</td>
                    <td className="px-4 py-2.5">Rs. {d.revenue}</td>
                    <td className="px-4 py-2.5">Rs. {d.gross_profit}</td>
                    <td className="px-4 py-2.5">{d.items_sold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Best Selling Products</h2>
        {bestSellers.length === 0 ? (
          <p className="text-sm text-slate-400">No sales in this date range.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Product</th>
                  <th className="px-4 py-2.5">Units Sold</th>
                  <th className="px-4 py-2.5">Revenue</th>
                  <th className="px-4 py-2.5">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bestSellers.map(([name, stats]) => (
                  <tr key={name}>
                    <td className="px-4 py-2.5">{name}</td>
                    <td className="px-4 py-2.5">{stats.quantity}</td>
                    <td className="px-4 py-2.5">Rs. {stats.revenue.toFixed(2)}</td>
                    <td className="px-4 py-2.5">Rs. {stats.profit.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Stock Alerts</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <AlertList title="Low Stock" items={lowStock.map((p) => `${p.name} (${p.current_stock})`)} tone="amber" />
          <AlertList title="Out of Stock" items={outOfStock.map((p) => p.name)} tone="red" />
          <AlertList title="Expired" items={expired.map((p) => p.name)} tone="red" />
        </div>
      </section>
    </div>
  );
}

function ReportCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'
      }`}
    >
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${highlight ? 'text-emerald-800' : 'text-slate-900'}`}>
        {value}
      </p>
    </div>
  );
}

function AlertList({ title, items, tone }: { title: string; items: string[]; tone: 'amber' | 'red' }) {
  const styles = tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-800';
  return (
    <div className={`rounded-xl border p-4 ${styles}`}>
      <p className="mb-2 text-xs font-semibold">{title} ({items.length})</p>
      {items.length === 0 ? (
        <p className="text-xs opacity-60">None</p>
      ) : (
        <ul className="space-y-0.5 text-xs">
          {items.slice(0, 8).map((i, idx) => (
            <li key={idx}>{i}</li>
          ))}
          {items.length > 8 && <li className="opacity-60">+{items.length - 8} more</li>}
        </ul>
      )}
    </div>
  );
}
