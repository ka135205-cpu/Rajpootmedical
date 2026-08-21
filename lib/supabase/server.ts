import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database.types';

/**
 * Server-side Supabase client for use in Server Components and Route
 * Handlers. Reads the session from cookies; RLS is still enforced exactly
 * as it is on the browser client — this is NOT a privileged client.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as CookieOptions)
            );
          } catch {
            // Called from a Server Component with no request context to
            // write to — safe to ignore because middleware.ts refreshes
            // the session on every request anyway.
          }
        },
      },
    }
  );
}
