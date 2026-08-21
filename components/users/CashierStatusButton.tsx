'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function CashierStatusButton({
  userId,
  currentlyDisabled,
}: {
  userId: string;
  currentlyDisabled: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);

    const res = await fetch('/api/users/set-cashier-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: userId, disable: !currentlyDisabled }),
    });

    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.message ?? 'Action failed.');
      return;
    }

    router.refresh();
  }

  return (
    <div className="text-right">
      <button
        onClick={handleClick}
        disabled={loading}
        className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
          currentlyDisabled
            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
            : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
        }`}
      >
        {loading ? 'Working…' : currentlyDisabled ? 'Enable' : 'Disable'}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
