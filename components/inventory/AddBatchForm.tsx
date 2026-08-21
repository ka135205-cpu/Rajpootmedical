'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Supplier {
  id: string;
  name: string;
}

export function AddBatchForm({
  productId,
  suppliers,
  onDone,
}: {
  productId: string;
  suppliers: Supplier[];
  onDone: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState({
    batch_number: '',
    quantity: '',
    purchase_price: '',
    selling_price: '',
    expiry_date: '',
    received_date: new Date().toISOString().slice(0, 10),
    supplier_id: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: rpcError } = await supabase.rpc('add_product_batch', {
      p_product_id: productId,
      p_batch_number: form.batch_number || null,
      p_quantity: Number(form.quantity),
      p_purchase_price: Number(form.purchase_price),
      p_selling_price: Number(form.selling_price),
      p_expiry_date: form.expiry_date,
      p_supplier_id: form.supplier_id || null,
      p_received_date: form.received_date,
    });

    setLoading(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    router.refresh();
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Batch number</label>
          <input
            value={form.batch_number}
            onChange={(e) => update('batch_number', e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Supplier</label>
          <select
            value={form.supplier_id}
            onChange={(e) => update('supplier_id', e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">— None —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Quantity *</label>
          <input
            required
            type="number"
            min={1}
            value={form.quantity}
            onChange={(e) => update('quantity', e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Purchase price *</label>
          <input
            required
            type="number"
            min={0}
            step="0.01"
            value={form.purchase_price}
            onChange={(e) => update('purchase_price', e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Selling price *</label>
          <input
            required
            type="number"
            min={0}
            step="0.01"
            value={form.selling_price}
            onChange={(e) => update('selling_price', e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Expiry date *</label>
          <input
            required
            type="date"
            value={form.expiry_date}
            onChange={(e) => update('expiry_date', e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Received date</label>
          <input
            type="date"
            value={form.received_date}
            onChange={(e) => update('received_date', e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? 'Adding…' : 'Add Batch'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
