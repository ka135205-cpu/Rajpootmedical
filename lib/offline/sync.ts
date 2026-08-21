import { createClient } from '@/lib/supabase/client';
import { getPendingSales, updateSaleStatus } from './queue';

let syncing = false;

/**
 * Flushes every 'pending' offline sale to Supabase via process_sale, using
 * each sale's clientTransactionId as the idempotency key. Safe to call
 * repeatedly (e.g. from both an 'online' event and a polling interval) —
 * a `syncing` guard prevents overlapping runs, and the server-side
 * idempotency check prevents double-processing even if two sync calls
 * somehow race across tabs/devices.
 */
export async function syncPendingSales(): Promise<{ succeeded: number; failed: number }> {
  if (syncing) return { succeeded: 0, failed: 0 };
  syncing = true;

  const supabase = createClient();
  let succeeded = 0;
  let failed = 0;

  try {
    const pending = await getPendingSales();

    for (const sale of pending) {
      await updateSaleStatus(sale.clientTransactionId, { status: 'syncing' });

      const { data, error } = await supabase.rpc('process_sale', {
        p_items: sale.items.map((i) => ({
          product_id: i.productId,
          quantity: i.quantity,
          unit_discount: i.unitDiscount,
        })),
        p_customer_id: sale.customerId,
        p_total_discount: sale.totalDiscount,
        p_amount_paid: sale.amountPaid,
        p_payment_method: sale.paymentMethod,
        p_client_transaction_id: sale.clientTransactionId,
      });

      if (error) {
        // Business-rule failure (e.g. stock ran out for real while offline)
        // vs. network failure both land here from the client's perspective
        // once fetch actually completes; a true network drop throws before
        // reaching this line and the sale simply stays 'pending' for retry.
        await updateSaleStatus(sale.clientTransactionId, {
          status: 'failed',
          lastError: error.message,
        });
        failed++;
        continue;
      }

      await updateSaleStatus(sale.clientTransactionId, {
        status: 'synced',
        serverSaleId: data as unknown as string,
      });
      succeeded++;
    }
  } finally {
    syncing = false;
  }

  return { succeeded, failed };
}

/**
 * Call once from a top-level client component (e.g. the (app) layout) to
 * wire up automatic sync on reconnect + a polling fallback.
 */
export function startOfflineSyncListener() {
  if (typeof window === 'undefined') return () => {};

  const onOnline = () => void syncPendingSales();
  window.addEventListener('online', onOnline);

  // Fallback poll: `online` events are not fully reliable on Android Chrome
  const interval = setInterval(() => {
    if (navigator.onLine) void syncPendingSales();
  }, 30_000);

  return () => {
    window.removeEventListener('online', onOnline);
    clearInterval(interval);
  };
}
