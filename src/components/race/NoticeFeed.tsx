"use client";

import { useEffect, useState } from "react";
import { Module } from "@/components/system";
import { fetchNotices, type Notice } from "@/app/race/actions";

const AUDIENCE: Record<string, string> = { everyone: "EVERYONE", participants: "PARTICIPANTS", mentors: "MENTORS", judges: "JUDGES" };

/** Organiser announcements, refreshed every 20 seconds. Renders nothing until there is one. */
export function NoticeFeed({ initial, timezone }: { initial: Notice[]; timezone: string }) {
  const [notices, setNotices] = useState(initial);
  useEffect(() => {
    const id = setInterval(() => void fetchNotices().then(setNotices), 20_000);
    return () => clearInterval(id);
  }, []);
  if (!notices.length) return null;
  const [latest, ...older] = notices;
  return (
    <Module label="ANNOUNCEMENTS" right={`${notices.length}`}>
      <div className="flex flex-col gap-1 border-b border-hairline bg-signal-tint px-4 py-3" role="status">
        <span className="flex flex-wrap items-baseline justify-between gap-2">
          <b className="text-[15px]">{latest.title}</b>
          <span className="font-mono text-[10.5px] text-muted">
            {AUDIENCE[latest.audience] ?? latest.audience.toUpperCase()} · {new Date(latest.at).toLocaleTimeString("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit" })}
          </span>
        </span>
        {latest.body && <p className="m-0 whitespace-pre-line text-[13.5px] leading-[1.5] text-ink-2">{latest.body}</p>}
      </div>
      {older.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {older.map((n) => (
            <li key={n.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline px-4 py-2 text-[13px] last:border-b-0">
              <span>{n.title}</span>
              <span className="font-mono text-[10px] text-muted">{new Date(n.at).toLocaleTimeString("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit" })}</span>
            </li>
          ))}
        </ul>
      )}
    </Module>
  );
}
