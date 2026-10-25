"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Admin sections, numbered in the order an organiser uses them on the day. Each has a one-line
 * "what you do here" shown under the menu. The rarely needed pages sit apart on the right.
 */
export const ADMIN_SECTIONS = [
  { href: "/admin/readiness", label: "1 · Checklist", hint: "What's ready and what still needs doing. Start here." },
  { href: "/admin/participants", label: "2 · People", hint: "Event code for students, and roles for judges, mentors and organisers." },
  { href: "/admin/tournaments", label: "3 · Race", hint: "Set up the race, then open its Control room to run it." },
  { href: "/admin/points", label: "4 · Points", hint: "Change step points, give or remove points, pick finalists." },
  { href: "/admin/submissions", label: "5 · Submissions", hint: "Projects teams have submitted to the Build and Policy Tracks." },
  { href: "/admin/judging", label: "6 · Judging", hint: "Rubrics, judge assignments and results." },
  { href: "/admin/announcements", label: "Announce", hint: "Send a message to every participant's screen." },
] as const;

const MORE_SECTIONS = [
  { href: "/admin", label: "Overview", hint: "Event summary." },
  { href: "/admin/mentors", label: "Mentors", hint: "Mentor help requests." },
  { href: "/admin/audit", label: "Audit log", hint: "Every organiser action, for the record." },
] as const;

export function AdminNav() {
  return <AdminNavFrame pathname={usePathname()} />;
}

export function AdminNavFrame({ pathname }: { pathname: string }) {
  const all = [...ADMIN_SECTIONS, ...MORE_SECTIONS];
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));
  const current = all.find((s) => isActive(s.href));
  const link = (s: (typeof all)[number], small = false) => {
    const active = isActive(s.href);
    return (
      <Link
        key={s.href}
        href={s.href}
        aria-current={active ? "page" : undefined}
        className={`rounded-[3px] px-3 py-1.5 font-mono font-medium hover:!no-underline ${small ? "text-[10px]" : "text-[11.5px]"} ${active ? "bg-ink !text-white" : small ? "!text-muted hover:bg-strip" : "!text-ink hover:bg-strip"}`}
      >
        {s.label.toUpperCase()}
      </Link>
    );
  };
  return (
    <nav aria-label="Admin" className="flex flex-col gap-2 border-b border-hairline pb-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">{ADMIN_SECTIONS.map((s) => link(s))}</div>
        <div className="flex flex-wrap gap-1">{MORE_SECTIONS.map((s) => link(s, true))}</div>
      </div>
      {current && <p className="m-0 text-[13.5px] text-ink-2">{current.hint}</p>}
    </nav>
  );
}
