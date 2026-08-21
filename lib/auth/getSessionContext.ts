import { createClient } from '@/lib/supabase/server';
import type { AppRole } from './permissions';

export interface SessionContext {
  userId: string;
  fullName: string;
  storeId: string;
  storeName: string;
  role: AppRole;
}

/**
 * Fetches the authenticated user's store + role in one round trip.
 * Returns null if unauthenticated or not yet assigned to a store (i.e. the
 * user is mid-onboarding). Use this at the top of every (app) Server
 * Component page — redirect to /login or /onboarding accordingly.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from('user_roles')
    .select('role, store_id, stores(name), profiles(full_name)')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) return null;

  return {
    userId: user.id,
    fullName: (data.profiles as any)?.full_name ?? '',
    storeId: data.store_id,
    storeName: (data.stores as any)?.name ?? 'Rajput Medical Store',
    role: data.role as AppRole,
  };
}
