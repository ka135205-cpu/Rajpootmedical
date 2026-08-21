'use client';

import type { CartItem } from '@/lib/pos/calc';
import { lineTotal } from '@/lib/pos/calc';

export function Cart({
  items,
  onQuantityChange,
  onRemove,
}: {
  items: CartItem[];
  onQuantityChange: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">
        Cart is empty — search for a product above to get started.
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      {items.map((item) => (
        <div key={item.productId} className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{item.name}</p>
            <p className="text-xs text-slate-500">Rs. {item.unitPrice} each</p>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onQuantityChange(item.productId, Math.max(1, item.quantity - 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
            >
              −
            </button>
            <input
              type="number"
              min={1}
              max={item.availableStock}
              value={item.quantity}
              onChange={(e) =>
                onQuantityChange(item.productId, Math.max(1, Number(e.target.value)))
              }
              className="w-14 rounded-lg border border-slate-300 px-1 py-1.5 text-center text-sm"
            />
            <button
              onClick={() =>
                onQuantityChange(item.productId, Math.min(item.availableStock, item.quantity + 1))
              }
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
            >
              +
            </button>
          </div>

          <p className="w-20 text-right text-sm font-medium text-slate-900">
            Rs. {lineTotal(item).toFixed(2)}
          </p>

          <button
            onClick={() => onRemove(item.productId)}
            aria-label="Remove"
            className="text-slate-400 hover:text-red-600"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
