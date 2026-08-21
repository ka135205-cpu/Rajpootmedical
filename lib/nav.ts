import type { AppRole } from '@/lib/auth/permissions';

export interface NavItem {
  label: string;
  href: string;
  icon: 'dashboard' | 'pos' | 'inventory' | 'sales' | 'more' | 'settings';
}

/**
 * Matches architecture §25 exactly: "Dashboard | POS | Inventory | Sales |
 * More". Settings, Customers, Suppliers, Categories, Expenses, Reports,
 * Audit Log, and User Management all live inside /more rather than each
 * getting their own slot — there are simply more owner-only screens than
 * 5 nav slots can hold, and the spec already anticipated this by naming
 * the 5th slot "More" rather than any specific screen.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
  { label: 'POS', href: '/pos', icon: 'pos' },
  { label: 'Inventory', href: '/inventory', icon: 'inventory' },
  { label: 'Sales', href: '/sales', icon: 'sales' },
  { label: 'More', href: '/more', icon: 'more' },
];

export function getVisibleNavItems(_role: AppRole): NavItem[] {
  // Same 5 items for both roles — /more itself is role-aware (a cashier
  // sees far fewer links there than an owner does).
  return NAV_ITEMS;
}
