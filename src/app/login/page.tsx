import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./LoginForm";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { PlatformNotConfigured } from "@/components/platform/NotConfigured";

export const metadata: Metadata = { title: "Sign in" };

/** Only same-site paths are allowed as the post-login destination. */
function safeNext(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/";
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="page-wrap flex justify-center pb-20 pt-[clamp(28px,4vw,56px)]">
      <div className="flex w-full max-w-[460px] flex-col gap-4">
        <h1 className="display-l">Sign in.</h1>
        <p className="m-0 text-[15px] leading-normal text-ink-2">Join your team, enter the AI Race, ask a mentor and submit your project.</p>
        {isSupabaseConfigured() ? (
          <Suspense fallback={null}>
            <LoginWithNext searchParams={searchParams} />
          </Suspense>
        ) : (
          <PlatformNotConfigured />
        )}
      </div>
    </div>
  );
}

async function LoginWithNext({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  return <LoginForm next={safeNext((await searchParams).next)} />;
}
