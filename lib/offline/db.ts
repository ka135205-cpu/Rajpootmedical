import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface CachedBatch {
  batchId: string;
  productId: string;
  productName: string;
  quantity: number;
  sellingPrice: number;
  expiryDate: string;
}

export interface PendingSaleItem {
  productId: string;
  quantity: number;
  unitDiscount: number;
}

export interface PendingSale {
  clientTransactionId: string; // primary key — also the server idempotency key
  items: PendingSaleItem[];
  customerId: string | null;
  totalDiscount: number;
  amountPaid: number;
  paymentMethod: 'cash' | 'card' | 'bank_transfer' | 'other';
  createdAt: string;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  lastError?: string;
  serverSaleId?: string;
}

interface RajputDB extends DBSchema {
  product_cache: {
    key: string; // batchId
    value: CachedBatch;
    indexes: { 'by-product': string };
  };
  pending_sales: {
    key: string; // clientTransactionId
    value: PendingSale;
    indexes: { 'by-status': string };
  };
}

let dbPromise: Promise<IDBPDatabase<RajputDB>> | null = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<RajputDB>('rajput-medical-store', 1, {
      upgrade(db) {
        const productStore = db.createObjectStore('product_cache', { keyPath: 'batchId' });
        productStore.createIndex('by-product', 'productId');

        const salesStore = db.createObjectStore('pending_sales', {
          keyPath: 'clientTransactionId',
        });
        salesStore.createIndex('by-status', 'status');
      },
    });
  }
  return dbPromise;
}
