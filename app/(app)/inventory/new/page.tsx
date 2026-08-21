import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionContext } from '@/lib/auth/getSessionContext';
import { permissions } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';
import { ProductForm } from '@/components/inventory/ProductForm';

export default async function NewProductPage() {
  const session = await getSessionContext();
  if (!session) redirect('/login');
  if (!permissions.canManageProducts(session.role)) redirect('/inventory');

  const supabase = await createClient();
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name')
    .eq('store_id', session.storeId)
    .order('name');

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <Link href="/inventory" className="text-sm text-slate-500 hover:text-slate-700">
          ← Back to Inventory
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">Add Product</h1>
      </div>

      <ProductForm categories={categories ?? []} />
    </div>
  );
}
