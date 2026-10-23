import { Suspense } from "react";
import { ControlRoom } from "@/components/admin/tournaments/ControlRoom";
import { Gate } from "@/components/platform/Gate";
import { Module } from "@/components/system";
import { loadControlState } from "@/server/dal/control";

export const metadata = { title: "Control room" };

export default function ControlPage({ params }: PageProps<"/admin/tournaments/[id]/control">) {
  return (
    <Suspense fallback={<p className="text-[14px] text-muted">Loading…</p>}>
      <Gate path="/admin/tournaments" roles={["organiser"]}>
        {async ({ event }) => {
          const state = await loadControlState((await params).id);
          if (!state) return <Module label="NOT FOUND"><p className="m-0 p-4 text-[14px]">No such tournament.</p></Module>;
          return <ControlRoom initial={state} timezone={event.timezone} />;
        }}
      </Gate>
    </Suspense>
  );
}
