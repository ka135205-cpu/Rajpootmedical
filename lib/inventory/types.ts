export interface ProductRow {
  id: string;
  name: string;
  generic_name: string | null;
  brand: string | null;
  category_id: string | null;
  medicine_type: string | null;
  barcode: string | null;
  min_stock_level: number;
  rack_location: string | null;
  description: string | null;
  is_active: boolean;
  categories: { name: string } | null;
}

export interface StockSummaryRow {
  product_id: string;
  current_stock: number;
  expired_stock: number;
  inventory_value: number;
  next_expiry_date: string | null;
}

export type StockStatus = 'out_of_stock' | 'low_stock' | 'expiring_soon' | 'expired' | 'ok';

export function getStockStatus(
  product: Pick<ProductRow, 'min_stock_level'>,
  summary: StockSummaryRow | undefined,
  expiryAlertDays: number
): StockStatus {
  const stock = summary?.current_stock ?? 0;
  const expired = summary?.expired_stock ?? 0;

  if (expired > 0) return 'expired';
  if (stock === 0) return 'out_of_stock';
  if (stock < product.min_stock_level) return 'low_stock';

  if (summary?.next_expiry_date) {
    const daysUntil = Math.ceil(
      (new Date(summary.next_expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (daysUntil <= expiryAlertDays) return 'expiring_soon';
  }

  return 'ok';
}

export const STATUS_LABEL: Record<StockStatus, string> = {
  out_of_stock: 'Out of Stock',
  low_stock: 'Low Stock',
  expiring_soon: 'Expiring Soon',
  expired: 'Expired',
  ok: 'In Stock',
};

export const STATUS_STYLE: Record<StockStatus, string> = {
  out_of_stock: 'bg-red-100 text-red-700',
  low_stock: 'bg-amber-100 text-amber-700',
  expiring_soon: 'bg-orange-100 text-orange-700',
  expired: 'bg-red-100 text-red-700',
  ok: 'bg-emerald-100 text-emerald-700',
};
