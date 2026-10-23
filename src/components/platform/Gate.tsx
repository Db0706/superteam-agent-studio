import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Module } from "@/components/system";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getActiveEvent, getViewer, hasRole, type EventRole, type EventSummary, type Viewer } from "@/server/dal/viewer";
import { PlatformNotConfigured } from "./NotConfigured";

/**
 * Server-side gate for pages that need a signed-in user (and optionally a role).
 * Render inside <Suspense>: it reads the session. This only decides what to *show*;
 * the database checks permissions again on every query and action.
 */
export async function Gate({
  path,
  roles,
  children,
}: {
  path: string;
  roles?: EventRole[];
  children: (ctx: { viewer: Viewer; event: EventSummary }) => ReactNode | Promise<ReactNode>;
}) {
  if (!isSupabaseConfigured()) return <PlatformNotConfigured />;
  const event = await getActiveEvent();
  if (!event) return <NoEvent />;
  const viewer = await getViewer(event.id);
  if (!viewer) redirect(`/login?next=${encodeURIComponent(path)}`);
  if (roles && !hasRole(viewer, ...roles)) return <NoAccess roles={roles} />;
  return <>{await children({ viewer, event })}</>;
}

function NoEvent() {
  return (
    <Module label="NO ACTIVE EVENT">
      <p className="m-0 p-4 text-[14px] text-ink-2">The platform has no active event yet. Organisers: run the seed (npm run db:seed) or create the event in the admin area.</p>
    </Module>
  );
}

function NoAccess({ roles }: { roles: EventRole[] }) {
  return (
    <Module label="NO ACCESS">
      <div className="flex flex-col gap-2 p-4 text-[14px] leading-normal text-ink-2">
        <p className="m-0">This page is for {roles.join(" or ")}s of this event.</p>
        <p className="m-0 text-[13px] text-muted">
          If that&apos;s you, ask an organiser to add your role. <Link href="/race">Go to the AI Race</Link>.
        </p>
      </div>
    </Module>
  );
}
