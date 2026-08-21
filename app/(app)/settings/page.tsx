import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth/getSessionContext';
import { permissions } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';
import { StoreSettingsForm } from '@/components/settings/StoreSettingsForm';

export default async function SettingsPage() {
  const session = await getSessionContext();
  if (!session) redirect('/login');
  if (!permissions.canManageSettings(session.role)) redirect('/dashboard');

  const supabase = await createClient();

  const [{ data: store }, { data: settings }] = await Promise.all([
    supabase.from('stores').select('name, phone, address').eq('id', session.storeId).single(),
    supabase
      .from('store_settings')
      .select('invoice_footer, currency_symbol, tax_enabled, tax_percent, low_stock_default, expiry_alert_days, receipt_width_mm')
      .eq('store_id', session.storeId)
      .single(),
  ]);

  if (!store || !settings) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        Could not load store settings.
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/more" className="text-sm text-slate-500 hover:text-slate-700">
            ← Back to More
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">Settings</h1>
        </div>
        <Link
          href="/users"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Manage Users
        </Link>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <StoreSettingsForm storeId={session.storeId} store={store} settings={settings} />
      </section>
    </div>
  );
}
