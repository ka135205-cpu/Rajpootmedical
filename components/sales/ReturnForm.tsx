'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface ReturnableItem {
  saleItemId: string;
  productName: string;
  quantity: number;
  alreadyReturned: number;
}

export function ReturnForm({ saleId, items }: { saleId: string; items: ReturnableItem[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const returnable = items.filter((i) => i.quantity - i.alreadyReturned > 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const returnItems = returnable
      .filter((i) => (quantities[i.saleItemId] ?? 0) > 0)
      .map((i) => ({ sale_item_id: i.saleItemId, quantity: quantities[i.saleItemId] }));

    if (returnItems.length === 0) {
      setError('Select at least one item and quantity to return.');
      return;
    }

    setLoading(true);
    setError(null);

    const { error: rpcError } = await supabase.rpc('process_return', {
      p_sale_id: saleId,
      p_items: returnItems,
      p_reason: reason || null,
      p_restock: restock,
    });

    setLoading(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setSuccess('Return recorded.');
    setOpen(false);
    router.refresh();
  }

  if (returnable.length === 0) {
    return <p className="text-sm text-slate-400">All items on this sale have been returned.</p>;
  }

  if (!open) {
    return (
      <div>
        {success && <p className="mb-2 text-sm text-emerald-600">{success}</p>}
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Process Return
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs text-slate-500">
        A cashier-initiated return needs owner approval before stock is restocked. An
        owner's return is approved and restocked immediately.
      </p>

      {returnable.map((item) => (
        <div key={item.saleItemId} className="flex items-center justify-between gap-3">
          <span className="text-sm text-slate-900">
            {item.productName}{' '}
            <span className="text-xs text-slate-500">
              (sold {item.quantity}
              {item.alreadyReturned > 0 ? `, ${item.alreadyReturned} already returned` : ''})
            </span>
          </span>
          <input
            type="number"
            min={0}
            max={item.quantity - item.alreadyReturned}
            value={quantities[item.saleItemId] ?? 0}
            onChange={(e) =>
              setQuantities((q) => ({ ...q, [item.saleItemId]: Number(e.target.value) }))
            }
            className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-center text-sm"
          />
        </div>
      ))}

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">Reason</label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
        Return to stock (uncheck for damaged/unsellable items)
      </label>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? 'Submitting…' : 'Submit Return'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
