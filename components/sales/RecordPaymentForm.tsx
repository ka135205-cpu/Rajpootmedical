'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function RecordPaymentForm({ saleId, remaining }: { saleId: string; remaining: number }) {
  const router = useRouter();
  const supabase = createClient();
  const [amount, setAmount] = useState(String(remaining));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: rpcError } = await supabase.rpc('record_customer_payment', {
      p_sale_id: saleId,
      p_amount: Number(amount),
      p_payment_method: 'cash',
      p_notes: null,
    });

    setLoading(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">
          Payment amount (Rs. {remaining} outstanding)
        </label>
        <input
          type="number"
          min={0}
          max={remaining}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {loading ? 'Recording…' : 'Record Payment'}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
