'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Category {
  id: string;
  name: string;
}

interface ExistingProduct {
  id: string;
  name: string;
  generic_name: string | null;
  brand: string | null;
  category_id: string | null;
  medicine_type: string | null;
  barcode: string | null;
  min_stock_level: number;
  rack_location: string | null;
  description: string | null;
}

export function ProductForm({
  categories,
  existing,
}: {
  categories: Category[];
  existing?: ExistingProduct;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState({
    name: existing?.name ?? '',
    generic_name: existing?.generic_name ?? '',
    brand: existing?.brand ?? '',
    category_id: existing?.category_id ?? '',
    medicine_type: existing?.medicine_type ?? '',
    barcode: existing?.barcode ?? '',
    min_stock_level: existing?.min_stock_level ?? 20,
    rack_location: existing?.rack_location ?? '',
    description: existing?.description ?? '',
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

    const payload = {
      name: form.name.trim(),
      generic_name: form.generic_name.trim() || null,
      brand: form.brand.trim() || null,
      category_id: form.category_id || null,
      medicine_type: form.medicine_type.trim() || null,
      barcode: form.barcode.trim() || null,
      min_stock_level: Number(form.min_stock_level),
      rack_location: form.rack_location.trim() || null,
      description: form.description.trim() || null,
    };

    if (existing) {
      const { error: updateError } = await supabase
        .from('products')
        .update(payload)
        .eq('id', existing.id);

      setLoading(false);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      router.push(`/inventory/${existing.id}`);
      router.refresh();
      return;
    }

    const { data, error: insertError } = await supabase
      .from('products')
      .insert(payload)
      .select('id')
      .single();

    setLoading(false);

    if (insertError || !data) {
      setError(insertError?.message ?? 'Could not create product.');
      return;
    }

    router.push(`/inventory/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Name *</label>
        <input
          required
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Generic name</label>
          <input
            value={form.generic_name}
            onChange={(e) => update('generic_name', e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Brand</label>
          <input
            value={form.brand}
            onChange={(e) => update('brand', e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Category</label>
          <select
            value={form.category_id}
            onChange={(e) => update('category_id', e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">— None —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Medicine type</label>
          <input
            placeholder="Tablet, Syrup, Injection…"
            value={form.medicine_type}
            onChange={(e) => update('medicine_type', e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Barcode</label>
          <input
            value={form.barcode}
            onChange={(e) => update('barcode', e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Rack location</label>
          <input
            value={form.rack_location}
            onChange={(e) => update('rack_location', e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Minimum stock level *
        </label>
        <input
          required
          type="number"
          min={0}
          value={form.min_stock_level}
          onChange={(e) => update('min_stock_level', Number(e.target.value))}
          className="w-full max-w-[160px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <p className="mt-1 text-xs text-slate-400">
          Product is flagged &quot;Low Stock&quot; once quantity falls below this number.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) => update('description', e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
      >
        {loading ? 'Saving…' : existing ? 'Save Changes' : 'Add Product'}
      </button>
    </form>
  );
}
