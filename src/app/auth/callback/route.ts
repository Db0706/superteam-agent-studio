import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

/** Magic-link landing: verifies the emailed token and starts the session, then goes on. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const nextRaw = searchParams.get("next") ?? "/race";
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/race";
  const supabase = await createSupabaseServer();
  const tokenHash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  const { error } = tokenHash
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: (searchParams.get("type") as EmailOtpType) ?? "email" })
    : code
      ? await supabase.auth.exchangeCodeForSession(code)
      : { error: new Error("missing token") };
  if (error) return NextResponse.redirect(`${origin}/login?error=link`);
  return NextResponse.redirect(`${origin}${next}`);
}
