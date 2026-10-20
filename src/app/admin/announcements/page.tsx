import { Suspense } from "react";
import { Module } from "@/components/system";
import { Gate } from "@/components/platform/Gate";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { EventSummary } from "@/server/dal/viewer";
import { AnnouncementForm } from "./AnnouncementForm";

export const metadata = { title: "Announcements" };

export default function AnnouncementsPage() {
  return (
    <Suspense fallback={<p className="text-[14px] text-muted">Loading…</p>}>
      <Gate path="/admin/announcements" roles={["organiser"]}>
        {({ event }) => <Announcements event={event} />}
      </Gate>
    </Suspense>
  );
}

async function Announcements({ event }: { event: EventSummary }) {
  const s = await createSupabaseServer();
  const { data } = await s.from("announcements").select("id, title, body, audience, published_at").eq("event_id", event.id).order("published_at", { ascending: false, nullsFirst: true }).limit(50);
  return (
    <div className="grid items-start gap-4 min-[1000px]:grid-cols-[420px_minmax(0,1fr)]">
      <AnnouncementForm />
      <Module label="PUBLISHED" right={`${data?.length ?? 0}`}>
        {data?.length ? (
          <ul className="m-0 flex list-none flex-col p-0">
            {data.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 border-b border-hairline px-4 py-3 last:border-b-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <b className="text-[14.5px]">{a.title}</b>
                  <span className="font-mono text-[10.5px] text-muted">
                    {a.audience.toUpperCase()} · {a.published_at ? new Date(a.published_at).toLocaleString("en-GB", { timeZone: event.timezone, hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) : "DRAFT"}
                  </span>
                </div>
                {a.body && <p className="m-0 whitespace-pre-line text-[13.5px] leading-[1.5] text-ink-2">{a.body}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 p-4 text-[13.5px] text-muted">No announcements yet.</p>
        )}
      </Module>
    </div>
  );
}
