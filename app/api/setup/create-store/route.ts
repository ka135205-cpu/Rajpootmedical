import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Creates a store + owner user_role + default store_settings for the
 * currently authenticated user, via the create_store_and_owner() RPC
 * function (see 11_phase3_bugfixes.sql).
 *
 * WHY AN RPC AND NOT THREE RAW INSERTS: the original approach (insert into
 * stores, then user_roles, then store_settings, each awaited via the user's
 * own session) hit a real RLS chicken-and-egg problem — the `stores` SELECT
 * policy requires `current_store_id()`, which reads `user_roles`, which
 * doesn't exist yet at the moment the store row is inserted. That made the
 * insert's RETURNING silently come back empty even though the row was
 * created. The RPC sidesteps this entirely by returning a plain uuid
 * scalar, not a table row subject to RLS.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
  }

  const { storeName } = await request.json();

  const { data: storeId, error } = await supabase.rpc('create_store_and_owner', {
    p_store_name: storeName ?? 'Rajput Medical Store',
  });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  return NextResponse.json({ storeId }, { status: 201 });
}
