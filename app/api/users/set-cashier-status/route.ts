import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

/**
 * Owner-only: disables or re-enables a cashier's ability to log in, per
 * Decision #1 ("The Owner should be able to create, disable, or remove
 * cashier accounts"). Uses Supabase Auth's ban mechanism rather than just
 * flipping a flag in `profiles` — a banned user's session/login is rejected
 * by Supabase Auth itself, which is a real access control, not just a UI
 * hint. Same service-role justification as create-cashier: privileged
 * action on another user's auth record, gated by an explicit owner check
 * before the privileged client is touched.
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
      { message: 'Only the store owner can manage cashier access.' },
      { status: 403 }
    );
  }

  const { targetUserId, disable } = await request.json();

  if (!targetUserId) {
    return NextResponse.json({ message: 'targetUserId is required.' }, { status: 400 });
  }

  // Prevent an owner from accidentally disabling themselves via this endpoint.
  if (targetUserId === user.id) {
    return NextResponse.json({ message: 'You cannot disable your own account.' }, { status: 400 });
  }

  const { data: targetRole } = await supabase
    .from('user_roles')
    .select('role, store_id')
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (!targetRole || targetRole.store_id !== callerRole.store_id) {
    return NextResponse.json({ message: 'User not found in your store.' }, { status: 404 });
  }
  if (targetRole.role === 'owner') {
    return NextResponse.json({ message: 'Cannot disable another owner account.' }, { status: 400 });
  }

  const admin = createSupabaseJsClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { error } = await admin.auth.admin.updateUserById(targetUserId, {
    ban_duration: disable ? '87600h' : 'none',
  });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
