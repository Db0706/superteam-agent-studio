import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Keeps the Supabase session cookie fresh on page requests (Supabase's SSR pattern). This is
 * not authorization: every protected page and action checks the user again on the server, and
 * the database enforces permissions itself.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });
  if (!url || !key) return response;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  // Pages only: skip static assets, images, the scaffold API and the challenge services.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/scaffold|api/race/challenge|api/race/fixtures|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
