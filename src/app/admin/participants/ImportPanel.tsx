"use client";

import { useActionState, useState, useTransition } from "react";
import { COLORS, Module } from "@/components/system";
import { parseLumaCsv, type ParseReport } from "@/core/registrations/luma";
import { importRegistrations, setCheckIn, setRole } from "./actions";

export function ImportPanel() {
  const [report, setReport] = useState<ParseReport | null>(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Module label="IMPORT FROM LUMA" right="CSV">
      <div className="flex flex-col gap-3 p-4 text-[14px] leading-normal text-ink-2">
        <p className="m-0">
          In Luma open the event, go to <b>Guests</b>, and export the guest list as CSV. Upload it here: you&apos;ll see a preview before anything changes. Re-importing updates people already on the list.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            setResult(null);
            setError(null);
            if (!file) return;
            setFileName(file.name);
            setReport(parseLumaCsv(await file.text()));
          }}
          className="text-[13px]"
        />
        {report && (
          <div className="flex flex-col gap-2.5 rounded-[4px] border border-[#CFCFC8] bg-white p-3.5">
            <span className="mono-label">PREVIEW · {fileName}</span>
            <div className="grid grid-cols-3 gap-2 text-[13px] min-[700px]:grid-cols-6">
              {(
                [
                  ["Hackathon", report.counts.hackathon],
                  ["Panel only", report.counts.panel],
                  ["Approved", report.counts.approved],
                  ["Checked in", report.counts.checkedIn],
                  ["Pending", report.counts.pending],
                  ["Declined", report.counts.declined],
                ] as const
              ).map(([k, v]) => (
                <span key={k} className="flex flex-col">
                  <b className="text-[20px]">{v}</b>
                  <span className="text-[11.5px] text-muted">{k}</span>
                </span>
              ))}
            </div>
            <p className="m-0 text-[12.5px] text-muted">
              Columns used: email “{report.columns.email ?? "none"}”, name “{report.columns.name ?? "none"}”, status “{report.columns.status ?? "none (treated as approved)"}”, ticket “{report.columns.ticket ?? "none (treated as hackathon)"}”, university “{report.columns.university ?? "none"}”.
            </p>
            {report.duplicates.length > 0 && <p className="m-0 text-[13px]" style={{ color: COLORS.warnText }}>{report.duplicates.length} duplicate email(s) skipped: {report.duplicates.slice(0, 5).join(", ")}{report.duplicates.length > 5 ? "…" : ""}</p>}
            {report.problems.length > 0 && (
              <ul className="m-0 pl-5 text-[13px] text-fault">
                {report.problems.slice(0, 8).map((p) => (
                  <li key={p.line}>Line {p.line}: {p.message}</li>
                ))}
                {report.problems.length > 8 && <li>…and {report.problems.length - 8} more</li>}
              </ul>
            )}
            <button
              type="button"
              disabled={pending || report.rows.length === 0}
              onClick={() =>
                start(async () => {
                  const r = await importRegistrations(report.rows);
                  if (r.ok) {
                    setResult(`Imported: ${r.data.inserted} new, ${r.data.updated} updated, ${r.data.unchanged} unchanged. ${r.data.linked} already had accounts and were given access.`);
                    setReport(null);
                  } else setError(r.error);
                })
              }
              className="btn-primary self-start !h-11 !px-5 !text-[14px]"
            >
              {pending ? "Importing…" : `Import ${report.rows.length} people`}
            </button>
          </div>
        )}
        {result && <p role="status" className="m-0 text-[13px] text-ok-text">{result}</p>}
        {error && <p role="alert" className="m-0 text-[13px] text-fault">{error}</p>}
      </div>
    </Module>
  );
}

export function RoleForm() {
  const [state, action, pending] = useActionState(setRole, null);
  return (
    <Module label="ROLES" right="MENTORS · JUDGES · ORGANISERS">
      <form action={action} className="flex flex-col gap-3 p-4 text-[13px]">
        <p className="m-0 text-[13.5px] leading-normal text-ink-2">The person must have signed in once at /login. Participants get their role automatically from the Luma import.</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[220px] flex-1 flex-col gap-1 font-semibold">
            Email
            <input name="email" type="email" required className="h-10 rounded-[3px] border border-[#CFCFC8] bg-white px-3 font-normal" />
          </label>
          <label className="flex flex-col gap-1 font-semibold">
            Role
            <select name="role" className="h-10 rounded-[3px] border border-[#CFCFC8] bg-white px-2 font-normal">
              <option value="mentor">Mentor</option>
              <option value="judge">Judge</option>
              <option value="organiser">Organiser</option>
              <option value="participant">Participant</option>
            </select>
          </label>
          <button name="grant" value="grant" type="submit" disabled={pending} className="btn-primary !h-10 !px-4 !text-[13px]">
            Grant
          </button>
          <button name="grant" value="revoke" type="submit" disabled={pending} className="btn-secondary !h-10 !px-4 !text-[13px]">
            Revoke
          </button>
        </div>
        {state && !state.ok && <p role="alert" className="m-0 text-fault">{state.error}</p>}
        {state?.ok && <p role="status" className="m-0 text-ok-text">Saved.</p>}
      </form>
    </Module>
  );
}

export function CheckInButton({ id, checkedIn }: { id: string; checkedIn: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => void (await setCheckIn(id, !checkedIn)))}
      className="h-8 rounded-[3px] border border-[#CFCFC8] bg-white px-2.5 font-mono text-[10.5px] font-semibold"
      style={checkedIn ? { color: COLORS.okText, borderColor: "#B5E4CF" } : undefined}
    >
      {checkedIn ? "CHECKED IN ✓" : "CHECK IN"}
    </button>
  );
}
