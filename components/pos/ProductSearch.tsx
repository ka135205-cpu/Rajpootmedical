'use client';

import { useMemo, useState } from 'react';
import type { CatalogEntry } from '@/lib/pos/useProductCatalog';

export function ProductSearch({
  entries,
  loading,
  error,
  isFromCache,
  onSelect,
}: {
  entries: CatalogEntry[];
  loading: boolean;
  error: string | null;
  isFromCache: boolean;
  onSelect: (entry: CatalogEntry) => void;
}) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return entries
      .filter((e) => e.name.toLowerCase().includes(q) || e.barcode === query.trim())
      .slice(0, 20);
  }, [entries, query]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Barcode scanners behave like fast keyboard input ending in Enter.
    if (e.key === 'Enter') {
      const exact = entries.find((entry) => entry.barcode === query.trim());
      if (exact) {
        onSelect(exact);
        setQuery('');
      } else if (results.length === 1) {
        onSelect(results[0]);
        setQuery('');
      }
    }
  }

  return (
    <div>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search or scan barcode…"
        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
      />

      {isFromCache && (
        <p className="mt-1 text-xs text-amber-600">
          Offline — showing estimated stock from the last sync.
        </p>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {loading && <p className="mt-1 text-xs text-slate-400">Loading products…</p>}

      {results.length > 0 && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white">
          {results.map((r) => (
            <button
              key={r.productId}
              onClick={() => {
                onSelect(r);
                setQuery('');
              }}
              disabled={r.quantity === 0}
              className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2.5 text-left text-sm last:border-0 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="font-medium text-slate-900">{r.name}</span>
              <span className="text-xs text-slate-500">
                Rs. {r.sellingPrice} · {r.quantity} in stock
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
