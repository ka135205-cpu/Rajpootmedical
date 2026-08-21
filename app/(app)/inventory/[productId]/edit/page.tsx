import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionContext } from '@/lib/auth/getSessionContext';
import { permissions } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';
import { ProductForm } from '@/components/inventory/ProductForm';

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect('/login');
  if (!permissions.canManageProducts(session.role)) redirect('/inventory');

  const { productId } = await params;
  const supabase = await createClient();

  const [{ data: product }, { data: categories }] = await Promise.all([
    supabase
      .from('products')
      .select(
        'id, name, generic_name, brand, category_id, medicine_type, barcode, min_stock_level, rack_location, description'
      )
      .eq('id', productId)
      .eq('store_id', session.storeId)
      .maybeSingle(),
    supabase.from('categories').select('id, name').eq('store_id', session.storeId).order('name'),
  ]);

  if (!product) notFound();

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <Link href={`/inventory/${productId}`} className="text-sm text-slate-500 hover:text-slate-700">
          ← Back
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">Edit Product</h1>
      </div>

      <ProductForm categories={categories ?? []} existing={product} />
    </div>
  );
}
