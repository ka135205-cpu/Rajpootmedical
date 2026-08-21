import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth/getSessionContext';
import { permissions } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';
import { CategoryForm } from '@/components/inventory/CategoryForm';

export default async function CategoriesPage() {
  const session = await getSessionContext();
  if (!session) redirect('/login');
  if (!permissions.canManageProducts(session.role)) redirect('/inventory');

  const supabase = await createClient();
  const { data: categories, error } = await supabase
    .from('categories')
    .select('id, name, description')
    .eq('store_id', session.storeId)
    .order('name');

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <Link href="/inventory" className="text-sm text-slate-500 hover:text-slate-700">
          ← Back to Inventory
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">Categories</h1>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <CategoryForm />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</p>
      )}

      {!error && (!categories || categories.length === 0) ? (
        <p className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
          No categories yet.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {(categories ?? []).map((c) => (
            <li key={c.id} className="px-4 py-3 text-sm">
              <p className="font-medium text-slate-900">{c.name}</p>
              {c.description && <p className="text-slate-500">{c.description}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
