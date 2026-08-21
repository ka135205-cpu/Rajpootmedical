'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface StoreInfo {
  name: string;
  phone: string | null;
  address: string | null;
}

interface Settings {
  invoice_footer: string;
  currency_symbol: string;
  tax_enabled: boolean;
  tax_percent: number;
  low_stock_default: number;
  expiry_alert_days: number;
  receipt_width_mm: number;
}

export function StoreSettingsForm({
  storeId,
  store,
  settings,
}: {
  storeId: string;
  store: StoreInfo;
  settings: Settings;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState({
    name: store.name,
    phone: store.phone ?? '',
    address: store.address ?? '',
    invoice_footer: settings.invoice_footer,
    tax_enabled: settings.tax_enabled,
    tax_percent: settings.tax_percent,
    low_stock_default: settings.low_stock_default,
    expiry_alert_days: settings.expiry_alert_days,
    receipt_width_mm: settings.receipt_width_mm,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSaved(false);

    const [storeResult, settingsResult] = await Promise.all([
      supabase
        .from('stores')
        .update({ name: form.name.trim(), phone: form.phone.trim() || null, address: form.address.trim() || null })
        .eq('id', storeId),
      supabase
        .from('store_settings')
        .update({
          invoice_footer: form.invoice_footer.trim(),
          tax_enabled: form.tax_enabled,
          tax_percent: form.tax_percent,
          low_stock_default: form.low_stock_default,
          expiry_alert_days: form.expiry_alert_days,
          receipt_width_mm: form.receipt_width_mm,
        })
        .eq('store_id', storeId),
    ]);

    setLoading(false);

    if (storeResult.error || settingsResult.error) {
      setError(storeResult.error?.message ?? settingsResult.error?.message ?? 'Could not save.');
      return;
    }

    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Store name</label>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Phone</label>
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">Address</label>
        <input
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">Receipt footer</label>
        <input
          value={form.invoice_footer}
          onChange={(e) => setForm((f) => ({ ...f, invoice_footer: e.target.value }))}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Low stock threshold</label>
          <input
            type="number"
            min={0}
            value={form.low_stock_default}
            onChange={(e) => setForm((f) => ({ ...f, low_stock_default: Number(e.target.value) }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Expiry alert (days)</label>
          <input
            type="number"
            min={0}
            value={form.expiry_alert_days}
            onChange={(e) => setForm((f) => ({ ...f, expiry_alert_days: Number(e.target.value) }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Receipt width</label>
          <select
            value={form.receipt_width_mm}
            onChange={(e) => setForm((f) => ({ ...f, receipt_width_mm: Number(e.target.value) }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value={58}>58mm</option>
            <option value={80}>80mm</option>
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={form.tax_enabled}
          onChange={(e) => setForm((f) => ({ ...f, tax_enabled: e.target.checked }))}
        />
        Enable tax
      </label>
      {form.tax_enabled && (
        <div className="max-w-[160px]">
          <label className="mb-1 block text-xs font-medium text-slate-700">Tax percent</label>
          <input
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={form.tax_percent}
            onChange={(e) => setForm((f) => ({ ...f, tax_percent: Number(e.target.value) }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-amber-600">
            Note: tax is stored here but not yet applied in POS calculations — see
            Decision #6 in 05_DECISIONS_NEEDED.md.
          </p>
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {saved && <p className="text-sm text-emerald-600">Saved.</p>}

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {loading ? 'Saving…' : 'Save Settings'}
      </button>
    </form>
  );
}
