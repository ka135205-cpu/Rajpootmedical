export interface CartItem {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  unitDiscount: number;
  availableStock: number;
}

export function lineTotal(item: CartItem): number {
  return item.unitPrice * item.quantity - item.unitDiscount;
}

export function cartSubtotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + lineTotal(i), 0);
}

export function grandTotal(items: CartItem[], totalDiscount: number): number {
  return Math.max(cartSubtotal(items) - totalDiscount, 0);
}

export function changeDue(amountPaid: number, total: number): number {
  return Math.max(amountPaid - total, 0);
}

/**
 * IMPORTANT: this is advisory only, for instant UI feedback while the
 * cashier builds the cart. The server-side process_sale() RPC re-validates
 * stock and re-prices from the database and is the actual source of truth
 * — see architecture §7. Never trust this module's totals for what gets
 * charged; only for what's displayed before "Complete Sale" is pressed.
 */
