import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { AdminNav, AdminNavFrame } from "./AdminNav";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin · Agent Studio" } };

/**
 * Organiser command centre. Each page gates itself with <Gate roles={["organiser"]}> inside a
 * Suspense boundary; the database refuses organiser actions from anyone else regardless.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="page-wrap flex flex-col gap-4 pb-20 pt-[clamp(20px,3vw,36px)]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="eyebrow">ORGANISER COMMAND CENTRE</span>
      </div>
      <Suspense fallback={<AdminNavFrame pathname="" />}>
        <AdminNav />
      </Suspense>
      {children}
    </div>
  );
}
