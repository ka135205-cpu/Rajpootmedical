import { getDB, type CachedBatch, type PendingSale, type PendingSaleItem } from './db';

/**
 * Called on every successful online page load of the POS screen to refresh
 * the local "best effort" stock snapshot used only while offline.
 */
export async function refreshProductCache(batches: CachedBatch[]) {
  const db = await getDB();
  const tx = db.transaction('product_cache', 'readwrite');
  await tx.store.clear();
  await Promise.all(batches.map((b) => tx.store.put(b)));
  await tx.done;
}

export async function getCachedBatchesForProduct(productId: string) {
  const db = await getDB();
  return db.getAllFromIndex('product_cache', 'by-product', productId);
}

/**
 * Enqueues a sale made while offline. Returns the clientTransactionId so the
 * POS screen can render an "OFFLINE — pending sync" receipt immediately.
 */
export async function enqueueOfflineSale(sale: {
  items: PendingSaleItem[];
  customerId: string | null;
  totalDiscount: number;
  amountPaid: number;
  paymentMethod: PendingSale['paymentMethod'];
}): Promise<string> {
  const db = await getDB();
  const clientTransactionId = crypto.randomUUID();

  const record: PendingSale = {
    clientTransactionId,
    ...sale,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };

  await db.put('pending_sales', record);
  return clientTransactionId;
}

export async function getPendingSales() {
  const db = await getDB();
  return db.getAllFromIndex('pending_sales', 'by-status', 'pending');
}

export async function getAllQueuedSales() {
  const db = await getDB();
  return db.getAll('pending_sales');
}

export async function updateSaleStatus(
  clientTransactionId: string,
  update: Partial<Pick<PendingSale, 'status' | 'lastError' | 'serverSaleId'>>
) {
  const db = await getDB();
  const existing = await db.get('pending_sales', clientTransactionId);
  if (!existing) return;
  await db.put('pending_sales', { ...existing, ...update });
}

/** Prunes synced records older than the given number of days (default 7). */
export async function pruneSyncedSales(olderThanDays = 7) {
  const db = await getDB();
  const all = await db.getAll('pending_sales');
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

  await Promise.all(
    all
      .filter((s) => s.status === 'synced' && new Date(s.createdAt).getTime() < cutoff)
      .map((s) => db.delete('pending_sales', s.clientTransactionId))
  );
}
