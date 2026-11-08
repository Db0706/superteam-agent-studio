import { Suspense } from "react";
import { Module } from "@/components/system";
import { Gate } from "@/components/platform/Gate";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { EventSummary } from "@/server/dal/viewer";

export const metadata = { title: "Audit log" };

export default function AuditPage() {
  return (
    <Suspense fallback={<p className="text-[14px] text-muted">Loading…</p>}>
      <Gate path="/admin/audit" roles={["organiser"]}>
        {({ event }) => <Audit event={event} />}
      </Gate>
    </Suspense>
  );
}

async function Audit({ event }: { event: EventSummary }) {
  const s = await createSupabaseServer();
  const { data: rows } = await s.from("audit_logs").select("id, actor_id, action, target_type, target_id, details, created_at").eq("event_id", event.id).order("id", { ascending: false }).limit(300);
  const actors = [...new Set((rows ?? []).map((r) => r.actor_id).filter(Boolean))] as string[];
  const { data: people } = actors.length ? await s.from("profiles").select("id, email, display_name").in("id", actors) : { data: [] };
  return (
    <Module label="AUDIT LOG" right={`LATEST ${rows?.length ?? 0}`}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[12.5px]">
          <thead>
            <tr className="font-mono text-[10px] text-muted">
              <th className="px-4 py-2 font-medium">WHEN</th>
              <th className="px-4 py-2 font-medium">WHO</th>
              <th className="px-4 py-2 font-medium">ACTION</th>
              <th className="px-4 py-2 font-medium">TARGET</th>
              <th className="px-4 py-2 font-medium">DETAILS</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => {
              const who = people?.find((p) => p.id === r.actor_id);
              const details = r.details as Record<string, unknown>;
              const summary = details.reason ?? details.note ?? (details.new ? "row changed" : JSON.stringify(details).slice(0, 120));
              return (
                <tr key={r.id} className="border-t border-hairline align-top">
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-[11px]">{new Date(r.created_at).toLocaleString("en-GB", { timeZone: event.timezone })}</td>
                  <td className="px-4 py-2">{who?.display_name || who?.email || (r.actor_id ? "Unknown" : "System")}</td>
                  <td className="px-4 py-2 font-mono text-[11px]">{r.action}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-muted">{r.target_type}</td>
                  <td className="max-w-[420px] px-4 py-2 text-ink-2">{String(summary)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(rows ?? []).length === 0 && <p className="m-0 p-4 text-[13.5px] text-muted">No organiser actions yet.</p>}
      </div>
    </Module>
  );
}
