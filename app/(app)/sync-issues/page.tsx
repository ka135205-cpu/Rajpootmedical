'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAllQueuedSales } from '@/lib/offline/queue';
import { syncPendingSales } from '@/lib/offline/sync';
import type { PendingSale } from '@/lib/offline/db';

export default function SyncIssuesPage() {
  const [sales, setSales] = useState<PendingSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  async function load() {
    setLoading(true);
    const all = await getAllQueuedSales();
    setSales(all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRetry() {
    setRetrying(true);
    await syncPendingSales();
    await load();
    setRetrying(false);
  }

  const failed = sales.filter((s) => s.status === 'failed');
  const pending = sales.filter((s) => s.status === 'pending' || s.status === 'syncing');
  const synced = sales.filter((s) => s.status === 'synced');

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/more" className="text-sm text-slate-500 hover:text-slate-700">
          ← Back to More
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">Offline Sync Issues</h1>
        <p className="text-sm text-slate-500">
          Sales made on this device while offline. This list is local to this device only.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <>
          {failed.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-red-700">
                  Needs Attention ({failed.length})
                </h2>
                <button
                  onClick={handleRetry}
                  disabled={retrying}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {retrying ? 'Retrying…' : 'Retry Now'}
                </button>
              </div>
              <ul className="divide-y divide-red-100 rounded-xl border border-red-200 bg-red-50">
                {failed.map((s) => (
                  <li key={s.clientTransactionId} className="px-4 py-3 text-sm">
                    <p className="font-medium text-red-800">
                      {new Date(s.createdAt).toLocaleString()} — {s.items.length} item(s), Rs.{' '}
                      {s.amountPaid}
                    </p>
                    <p className="text-xs text-red-600">{s.lastError}</p>
                    <p className="mt-1 text-xs text-red-500">
                      This sale was never completed in the system — review it and either fix the
                      cart and re-sell it, or contact the customer if goods were already handed
                      over.
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {pending.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-amber-700">
                Waiting to Sync ({pending.length})
              </h2>
              <ul className="divide-y divide-amber-100 rounded-xl border border-amber-200 bg-amber-50">
                {pending.map((s) => (
                  <li key={s.clientTransactionId} className="px-4 py-3 text-sm text-amber-800">
                    {new Date(s.createdAt).toLocaleString()} — {s.items.length} item(s), Rs.{' '}
                    {s.amountPaid} ({s.status})
                  </li>
                ))}
              </ul>
            </section>
          )}

          {synced.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-emerald-700">
                Synced ({synced.length})
              </h2>
              <ul className="divide-y divide-emerald-100 rounded-xl border border-emerald-200 bg-emerald-50">
                {synced.slice(0, 20).map((s) => (
                  <li key={s.clientTransactionId} className="px-4 py-3 text-sm text-emerald-800">
                    {new Date(s.createdAt).toLocaleString()} — Rs. {s.amountPaid} — synced
                  </li>
                ))}
              </ul>
            </section>
          )}

          {sales.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">
              No offline sales recorded on this device.
            </p>
          )}
        </>
      )}
    </div>
  );
}
