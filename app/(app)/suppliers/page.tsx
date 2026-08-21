import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth/getSessionContext';
import { permissions } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';
import { SupplierForm } from '@/components/suppliers/SupplierForm';

export default async function SuppliersPage() {
  const session = await getSessionContext();
  if (!session) redirect('/login');
  if (!permissions.canManageSuppliers(session.role)) redirect('/inventory');

  const supabase = await createClient();

  const [{ data: suppliers, error }, { data: outstanding }] = await Promise.all([
    supabase
      .from('suppliers')
      .select('id, name, company, phone, email, is_active')
      .eq('store_id', session.storeId)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('supplier_outstanding')
      .select('supplier_id, outstanding_balance')
      .eq('store_id', session.storeId),
  ]);

  const balanceBySupplier = new Map<string, number>(
    (outstanding ?? []).map((o) => [o.supplier_id as string, Number(o.outstanding_balance)])
  );

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/inventory" className="text-sm text-slate-500 hover:text-slate-700">
            ← Back to Inventory
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">Suppliers</h1>
        </div>
        <SupplierForm />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</p>
      )}

      {!error && (!suppliers || suppliers.length === 0) ? (
        <p className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
          No suppliers yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(suppliers ?? []).map((s) => {
                const balance = balanceBySupplier.get(s.id) ?? 0;
                return (
                  <tr key={s.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{s.name}</p>
                      {s.company && <p className="text-xs text-slate-500">{s.company}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {[s.phone, s.email].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td
                      className={`px-4 py-3 font-medium ${
                        balance > 0 ? 'text-amber-700' : 'text-slate-500'
                      }`}
                    >
                      Rs. {balance.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-400">
        Purchase history and recording payments arrive with the Purchases module
        (Phase 6) — supplier profiles and outstanding balances are live now.
      </p>
    </div>
  );
}
