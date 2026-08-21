/**
 * UI-layer permission helpers. These exist to hide/disable buttons the
 * current role can't use — they are NOT the security boundary. The real
 * boundary is Postgres RLS + the SECURITY DEFINER RPC functions (see
 * 03_rls_policies.sql / 04_functions_triggers.sql / 07_phase3_functions_updates.sql).
 * Never trust this file for anything sensitive; a disabled button here
 * being re-enabled via devtools must still fail safely on the server.
 */

export type AppRole = 'owner' | 'cashier';

export const permissions = {
  canManageProducts: (role: AppRole) => role === 'owner',
  canManageBatches: (role: AppRole) => role === 'owner',
  canSetPricing: (role: AppRole) => role === 'owner',
  canManagePurchases: (role: AppRole) => role === 'owner',
  canManageSuppliers: (role: AppRole) => role === 'owner',
  canManageExpenses: (role: AppRole) => role === 'owner',
  canViewProfit: (role: AppRole) => role === 'owner',
  canManageUsers: (role: AppRole) => role === 'owner',
  canAccessAuditLog: (role: AppRole) => role === 'owner',
  canManageSettings: (role: AppRole) => role === 'owner',
  canApproveReturns: (role: AppRole) => role === 'owner',
  canRecordSupplierPayments: (role: AppRole) => role === 'owner',

  // Both roles
  canCreateSale: (role: AppRole) => role === 'owner' || role === 'cashier',
  canSearchProducts: (role: AppRole) => role === 'owner' || role === 'cashier',
  canInitiateReturn: (role: AppRole) => role === 'owner' || role === 'cashier',
  canRecordCustomerPayment: (role: AppRole) => role === 'owner' || role === 'cashier',
} as const;
