import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/**
 * Supabase client acting as the signed-in user, for Server Components, Route Handlers and
 * Server Actions. Every query runs under the user's own session, so RLS and the permission
 * checks inside the database functions apply. Create one per request; never share it.
 *
 * Reading cookies is request-time data: with Cache Components, call this inside a <Suspense>
 * boundary (or a route marked `instant = false`).
 */
export async function createSupabaseServer() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server Components can't set cookies; proxy.ts refreshes the session instead.
        }
      },
    },
  });
}
