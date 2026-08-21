'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getDB } from '@/lib/offline/db';
import { refreshProductCache } from '@/lib/offline/queue';

export interface CatalogEntry {
  productId: string;
  name: string;
  barcode: string | null;
  batchId: string;
  sellingPrice: number;
  quantity: number;
  expiryDate: string;
}

/**
 * Loads the store's active, non-expired, in-stock batches (earliest expiry
 * first, per product) for POS search. Refreshes the IndexedDB cache on
 * every successful online load so the POS can still search — with clearly
 * "estimated" data — while offline (see 08_OFFLINE_SYNC_ARCHITECTURE.md).
 */
export function useProductCatalog() {
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      if (navigator.onLine) {
        const supabase = createClient();

        const { data: products, error: productsError } = await supabase
          .from('products')
          .select('id, name, barcode')
          .eq('is_active', true);

        if (productsError) {
          if (!cancelled) {
            setError(productsError.message);
            setLoading(false);
          }
          return;
        }

        const { data: batches, error: batchesError } = await supabase
          .from('product_batches_pos_view')
          .select('id, product_id, selling_price, quantity, expiry_date')
          .gt('quantity', 0)
          .gte('expiry_date', new Date().toISOString().slice(0, 10))
          .order('expiry_date', { ascending: true });

        if (batchesError) {
          if (!cancelled) {
            setError(batchesError.message);
            setLoading(false);
          }
          return;
        }

        const productById = new Map<string, { id: string; name: string; barcode: string | null }>(
          (products ?? []).map((p) => [p.id, p])
        );
        const seenProduct = new Set<string>();
        const result: CatalogEntry[] = [];

        for (const b of batches ?? []) {
          if (seenProduct.has(b.product_id)) continue; // keep earliest-expiry batch per product for display
          const product = productById.get(b.product_id);
          if (!product) continue;
          seenProduct.add(b.product_id);
          result.push({
            productId: b.product_id,
            name: product.name,
            barcode: product.barcode,
            batchId: b.id,
            sellingPrice: b.selling_price,
            quantity: b.quantity,
            expiryDate: b.expiry_date,
          });
        }

        if (!cancelled) {
          setEntries(result);
          setIsFromCache(false);
          setLoading(false);
        }

        // Refresh the offline cache with EVERY batch (not just earliest-per-
        // product) so offline mode can still see total quantity accurately.
        await refreshProductCache(
          (batches ?? []).map((b) => ({
            batchId: b.id,
            productId: b.product_id,
            productName: productById.get(b.product_id)?.name ?? 'Unknown product',
            quantity: b.quantity,
            sellingPrice: b.selling_price,
            expiryDate: b.expiry_date,
          }))
        );
      } else {
        const db = await getDB();
        const cached = await db.getAll('product_cache');
        const seenProduct = new Set<string>();
        const result: CatalogEntry[] = [];
        for (const b of cached.sort((a, c) => a.expiryDate.localeCompare(c.expiryDate))) {
          if (seenProduct.has(b.productId)) continue;
          seenProduct.add(b.productId);
          result.push({
            productId: b.productId,
            name: b.productName,
            barcode: null,
            batchId: b.batchId,
            sellingPrice: b.sellingPrice,
            quantity: b.quantity,
            expiryDate: b.expiryDate,
          });
        }
        if (!cancelled) {
          setEntries(result);
          setIsFromCache(true);
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { entries, loading, error, isFromCache };
}
