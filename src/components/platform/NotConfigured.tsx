import { Module } from "@/components/system";

/** Shown where platform features need Supabase and this deployment has none configured. */
export function PlatformNotConfigured({ feature = "Accounts, teams and the AI Race" }: { feature?: string }) {
  return (
    <Module label="NOT CONNECTED" right="SETUP NEEDED">
      <div className="flex flex-col gap-2 p-4 text-[14px] leading-normal text-ink-2">
        <p className="m-0">
          <b>{feature}</b> need the platform database, which this deployment isn&apos;t connected to yet.
        </p>
        <p className="m-0 text-[13px] text-muted">
          Organisers: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see docs/DEPLOYMENT.md). The idea library, Playground and project
          Builder work without it.
        </p>
      </div>
    </Module>
  );
}
