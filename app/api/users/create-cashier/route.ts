import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

/**
 * Owner-only: creates a cashier account (Decision #1 — "The Owner should be
 * able to create, disable, or remove cashier accounts").
 *
 * NOTE on service_role usage: creating another person's auth.users row is
 * not something a normal user's session can ever do (rightly so — it's not
 * an RLS-governed table), so this is one of the few legitimate places the
 * service_role key is used server-side. Safety comes from the explicit
 * owner check BEFORE the privileged client is touched, and the fact that
 * SUPABASE_SERVICE_ROLE_KEY only ever lives in server env vars, never in
 * NEXT_PUBLIC_* and never sent to the browser.
 */
export async function POST(request: Request) {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
  }

  const { data: callerRole } = await supabase
    .from('user_roles')
    .select('role, store_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!callerRole || callerRole.role !== 'owner') {
    return NextResponse.json(
      { message: 'Only the store owner can create cashier accounts.' },
      { status: 403 }
    );
  }

  const { fullName, email, password } = await request.json();

  if (!fullName || !email || !password) {
    return NextResponse.json({ message: 'fullName, email, and password are required.' }, { status: 400 });
  }

  const admin = createSupabaseJsClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // server-only env var
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError || !newUser.user) {
    return NextResponse.json(
      { message: createError?.message ?? 'Could not create cashier account.' },
      { status: 400 }
    );
  }

  // handle_new_user trigger already created the `profiles` row. Now link
  // them to this store as a cashier — done via the ADMIN client here since
  // the owner is granting access to a user that isn't `auth.uid()` yet in
  // any session (user_roles_insert_owner policy would also permit this if
  // done via the owner's own session/client instead, but the admin client
  // is already in hand from account creation, so we reuse it).
  const { error: roleError } = await admin
    .from('user_roles')
    .insert({ store_id: callerRole.store_id, user_id: newUser.user.id, role: 'cashier' });

  if (roleError) {
    return NextResponse.json({ message: roleError.message }, { status: 400 });
  }

  return NextResponse.json({ userId: newUser.user.id }, { status: 201 });
}
