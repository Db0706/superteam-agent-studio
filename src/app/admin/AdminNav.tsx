"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Admin sections. Ownership while the platform is built in parallel:
 *   Overview, Participants, Announcements, Audit log  → platform integration
 *   Tournaments (builder, control room, verification) → tournament admin workstream
 *   Mentors, Submissions, Judging                     → event operations workstream
 */
export const ADMIN_SECTIONS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/participants", label: "Participants" },
  { href: "/admin/tournaments", label: "Tournaments" },
  { href: "/admin/mentors", label: "Mentors" },
  { href: "/admin/submissions", label: "Submissions" },
  { href: "/admin/points", label: "Points & finalists" },
  { href: "/admin/judging", label: "Judging" },
  { href: "/admin/announcements", label: "Announcements" },
  { href: "/admin/audit", label: "Audit log" },
] as const;

export function AdminNav() {
  return <AdminNavFrame pathname={usePathname()} />;
}

export function AdminNavFrame({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Admin" className="flex flex-wrap gap-1 border-b border-hairline pb-3">
      {ADMIN_SECTIONS.map((s) => {
        const active = s.href === "/admin" ? pathname === "/admin" : pathname.startsWith(s.href);
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-[3px] px-3 py-1.5 font-mono text-[11px] font-medium hover:!no-underline ${active ? "bg-ink !text-white" : "!text-ink-2 hover:bg-strip"}`}
          >
            {s.label.toUpperCase()}
          </Link>
        );
      })}
    </nav>
  );
}
