import Link from 'next/link';
import { getSessionContext } from '@/lib/auth/getSessionContext';
import { permissions } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';

function Card({ label, value, href }: { label: string; value: string; href?: string }) {
  const inner = (
    <div className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default async function DashboardPage() {
  const session = await getSessionContext();
  if (!session) return null;

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const canViewProfit = permissions.canViewProfit(session.role);

  const [{ data: todaySummary }, { data: monthSummaries }, { data: stockSummary }, { data: outstandingCustomers }, { data: outstandingSuppliers }] =
    await Promise.all([
      supabase
        .from('daily_sales_summary')
        .select('transaction_count, revenue, gross_profit, items_sold')
        .eq('store_id', session.storeId)
        .eq('sale_date', today)
        .maybeSingle(),
      supabase
        .from('daily_sales_summary')
        .select('revenue, gross_profit')
        .eq('store_id', session.storeId)
        .gte('sale_date', monthStart),
      supabase
        .from('product_stock_summary')
        .select('current_stock, expired_stock, next_expiry_date, min_stock_level, inventory_value')
        .eq('store_id', session.storeId),
      canViewProfit
        ? supabase.from('customer_outstanding').select('outstanding_balance').eq('store_id', session.storeId)
        : Promise.resolve({ data: [] as { outstanding_balance: number }[] }),
      canViewProfit
        ? supabase.from('supplier_outstanding').select('outstanding_balance').eq('store_id', session.storeId)
        : Promise.resolve({ data: [] as { outstanding_balance: number }[] }),
    ]);

  const monthlyRevenue = (monthSummaries ?? []).reduce((s, d) => s + Number(d.revenue), 0);
  const monthlyGrossProfit = (monthSummaries ?? []).reduce((s, d) => s + Number(d.gross_profit), 0);

  const totalProducts = (stockSummary ?? []).length;
  const lowStockCount = (stockSummary ?? []).filter(
    (p) => p.current_stock > 0 && p.current_stock < p.min_stock_level
  ).length;
  const outOfStockCount = (stockSummary ?? []).filter((p) => p.current_stock === 0).length;
  const expiredCount = (stockSummary ?? []).filter((p) => p.expired_stock > 0).length;

  const totalOutstandingCustomer = (outstandingCustomers ?? []).reduce(
    (s, c) => s + Number(c.outstanding_balance),
    0
  );
  const totalOutstandingSupplier = (outstandingSuppliers ?? []).reduce(
    (s, sup) => s + Number(sup.outstanding_balance),
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">
          Welcome back, {session.fullName || session.role}
        </h1>
        <p className="text-sm text-slate-500">
          Here&apos;s what&apos;s happening at {session.storeName} today.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Today&apos;s Overview</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card label="Today's Sales" value={`Rs. ${(todaySummary?.revenue ?? 0).toLocaleString()}`} href="/sales" />
          <Card label="Transactions" value={String(todaySummary?.transaction_count ?? 0)} href="/sales" />
          <Card label="Items Sold" value={String(todaySummary?.items_sold ?? 0)} />
          {canViewProfit && (
            <Card
              label="Today's Gross Profit"
              value={`Rs. ${(todaySummary?.gross_profit ?? 0).toLocaleString()}`}
              href="/reports"
            />
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Inventory Overview</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card label="Total Products" value={String(totalProducts)} href="/inventory" />
          <Card label="Low Stock" value={String(lowStockCount)} href="/inventory?filter=low_stock" />
          <Card label="Out of Stock" value={String(outOfStockCount)} href="/inventory?filter=out_of_stock" />
          <Card label="Expired" value={String(expiredCount)} href="/inventory?filter=expired" />
        </div>
      </section>

      {canViewProfit && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Financial Overview</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card label="Monthly Revenue" value={`Rs. ${monthlyRevenue.toLocaleString()}`} href="/reports" />
            <Card label="Monthly Gross Profit" value={`Rs. ${monthlyGrossProfit.toLocaleString()}`} href="/reports" />
            <Card
              label="Outstanding Customer Credit"
              value={`Rs. ${totalOutstandingCustomer.toLocaleString()}`}
              href="/customers"
            />
            <Card
              label="Outstanding Supplier Payable"
              value={`Rs. ${totalOutstandingSupplier.toLocaleString()}`}
              href="/suppliers"
            />
          </div>
        </section>
      )}
    </div>
  );
}
