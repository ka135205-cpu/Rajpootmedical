'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useProductCatalog, type CatalogEntry } from '@/lib/pos/useProductCatalog';
import { ProductSearch } from '@/components/pos/ProductSearch';
import { Cart } from '@/components/pos/Cart';
import { CustomerSelector, type SelectedCustomer } from '@/components/pos/CustomerSelector';
import type { CartItem } from '@/lib/pos/calc';
import { cartSubtotal, grandTotal, changeDue } from '@/lib/pos/calc';
import { enqueueOfflineSale } from '@/lib/offline/queue';
import { useOnlineStatus } from '@/lib/offline/useOnlineStatus';

type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'other';

export default function PosPage() {
  const router = useRouter();
  const supabase = createClient();
  const { isOnline } = useOnlineStatus();
  const { entries, loading, error, isFromCache } = useProductCatalog();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<SelectedCustomer | null>(null);
  const [totalDiscount, setTotalDiscount] = useState(0);
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [offlineConfirmation, setOfflineConfirmation] = useState<string | null>(null);

  function handleSelectProduct(entry: CatalogEntry) {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === entry.productId);
      if (existing) {
        return prev.map((i) =>
          i.productId === entry.productId
            ? { ...i, quantity: Math.min(i.quantity + 1, entry.quantity) }
            : i
        );
      }
      return [
        ...prev,
        {
          productId: entry.productId,
          name: entry.name,
          unitPrice: entry.sellingPrice,
          quantity: 1,
          unitDiscount: 0,
          availableStock: entry.quantity,
        },
      ];
    });
  }

  function handleQuantityChange(productId: string, quantity: number) {
    setCart((prev) => prev.map((i) => (i.productId === productId ? { ...i, quantity } : i)));
  }

  function handleRemove(productId: string) {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  }

  const subtotal = cartSubtotal(cart);
  const total = grandTotal(cart, totalDiscount);
  const paidNum = Number(amountPaid) || 0;
  const change = changeDue(paidNum, total);
  const isCreditSale = paidNum < total;

  function resetForNextSale() {
    setCart([]);
    setCustomer(null);
    setTotalDiscount(0);
    setAmountPaid('');
    setSubmitError(null);
  }

  async function handleCompleteSale() {
    if (cart.length === 0) return;
    if (isCreditSale && !customer) {
      setSubmitError('Credit sales require a customer to be selected.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const items = cart.map((i) => ({
      product_id: i.productId,
      quantity: i.quantity,
      unit_discount: i.unitDiscount,
    }));

    if (!isOnline) {
      const clientTransactionId = await enqueueOfflineSale({
        items: cart.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitDiscount: i.unitDiscount,
        })),
        customerId: customer?.id ?? null,
        totalDiscount,
        amountPaid: paidNum,
        paymentMethod,
      });
      setSubmitting(false);
      setOfflineConfirmation(clientTransactionId);
      resetForNextSale();
      return;
    }

    const { data: saleId, error: rpcError } = await supabase.rpc('process_sale', {
      p_items: items,
      p_customer_id: customer?.id ?? null,
      p_total_discount: totalDiscount,
      p_amount_paid: paidNum,
      p_payment_method: paymentMethod,
    });

    setSubmitting(false);

    if (rpcError) {
      setSubmitError(rpcError.message);
      return;
    }

    router.push(`/pos/receipt/${saleId}`);
  }

  if (offlineConfirmation) {
    return (
      <div className="mx-auto max-w-md space-y-4 rounded-xl border border-amber-300 bg-amber-50 p-6 text-center">
        <h1 className="text-lg font-semibold text-amber-900">Sale Recorded — Offline</h1>
        <p className="text-sm text-amber-800">
          This sale is saved on this device and will sync automatically once you're back
          online. It does not have an invoice number yet.
        </p>
        <p className="font-mono text-xs text-amber-700">Ref: {offlineConfirmation}</p>
        <button
          onClick={() => setOfflineConfirmation(null)}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Start Next Sale
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <h1 className="text-lg font-semibold text-slate-900">Point of Sale</h1>
        <ProductSearch
          entries={entries}
          loading={loading}
          error={error}
          isFromCache={isFromCache}
          onSelect={handleSelectProduct}
        />
        <Cart items={cart} onQuantityChange={handleQuantityChange} onRemove={handleRemove} />
      </div>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 lg:sticky lg:top-6 lg:h-fit">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Customer</label>
          <CustomerSelector selected={customer} onSelect={setCustomer} />
        </div>

        <div className="space-y-1.5 border-t border-slate-100 pt-3 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span>Rs. {subtotal.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-slate-600">
            <span>Discount</span>
            <input
              type="number"
              min={0}
              value={totalDiscount}
              onChange={(e) => setTotalDiscount(Math.max(0, Number(e.target.value)))}
              className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm"
            />
          </div>
          <div className="flex justify-between border-t border-slate-100 pt-1.5 text-base font-semibold text-slate-900">
            <span>Total</span>
            <span>Rs. {total.toFixed(2)}</span>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Payment method</label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Amount paid</label>
          <input
            type="number"
            min={0}
            value={amountPaid}
            onChange={(e) => setAmountPaid(e.target.value)}
            placeholder="0"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          {paidNum > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              {isCreditSale
                ? `Rs. ${(total - paidNum).toFixed(2)} will be recorded as customer credit.`
                : `Change due: Rs. ${change.toFixed(2)}`}
            </p>
          )}
        </div>

        {submitError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>
        )}

        <button
          onClick={handleCompleteSale}
          disabled={submitting || cart.length === 0}
          className="w-full rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {submitting ? 'Processing…' : isOnline ? 'Complete Sale' : 'Complete Sale (Offline)'}
        </button>
      </div>
    </div>
  );
}
