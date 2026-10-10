"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SITE } from "@/config/site";
import { useEvent } from "./EventContext";

export const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/playground", label: "Playground" },
  { href: "/build", label: "Build" },
  { href: "/inspiration", label: "Inspiration" },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppHeader() {
  const pathname = usePathname();
  const { event, events, setEventId } = useEvent();
  const [menuOpen, setMenuOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  const onBuild = pathname.startsWith("/build");

  // Close the mobile menu whenever the route changes (incl. back/forward).
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 bg-ink text-[#EDEDE8]">
      <div className="page-wrap flex h-14 items-center gap-6">
        <Link href="/" className="flex flex-none items-baseline gap-2.5 !text-[#EDEDE8] hover:!no-underline" aria-label="Agent Studio by Superteam: Dashboard">
          <span className="wide text-[14px] tracking-[0.02em]">AGENT STUDIO</span>
          <span className="font-mono text-[10px] font-normal text-dim-2">by Superteam</span>
        </Link>

        {/* Desktop (≥1120px) */}
        <nav aria-label="Main" className="hidden flex-1 gap-0.5 min-[1120px]:flex">
          {NAV.map((n) => {
            const a = isActive(pathname, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={a ? "page" : undefined}
                className={`flex h-8 items-center gap-2 whitespace-nowrap rounded-[3px] px-3 text-[13px] font-semibold hover:!text-white hover:!no-underline ${a ? "bg-[#EDEDE8] !text-ink hover:!text-ink" : "!text-dim"}`}
              >
                <span aria-hidden="true" className="h-1.5 w-1.5" style={{ background: a ? "#5A3CF0" : "#3D3D3A" }} />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden flex-none items-center gap-3.5 font-mono text-[11px] font-medium min-[1120px]:flex">
          <div role="group" aria-label="Hackathon event" className="flex overflow-hidden rounded-[3px] border border-inv-div-2">
            {events.map((e) => {
              const a = e.id === event.id;
              return (
                <button
                  key={e.id}
                  type="button"
                  title={e.shortName}
                  aria-pressed={a}
                  onClick={() => setEventId(e.id)}
                  className="border-0 px-[9px] py-1.5 font-mono text-[11px] font-medium"
                  style={{ background: a ? "#EDEDE8" : "transparent", color: a ? "#161616" : "#8E8E87" }}
                >
                  {e.code}
                </button>
              );
            })}
          </div>
          <a href={SITE.githubUrl} target="_blank" rel="noopener noreferrer" className="!text-[#EDEDE8]">
            GITHUB ↗
          </a>
          {!onBuild && (
            <Link href="/build" className="flex h-8 items-center rounded-[3px] bg-signal px-3 font-mono text-[11px] font-semibold !text-white hover:bg-signal-hover hover:!no-underline">
              START BUILDING ▸
            </Link>
          )}
        </div>

        {/* Mobile (<1120px) */}
        <div className="flex-1 min-[1120px]:hidden" />
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          className="h-10 w-11 rounded-[3px] border border-inv-div-2 bg-transparent font-mono text-[11px] font-semibold text-[#EDEDE8] min-[1120px]:hidden"
        >
          {menuOpen ? "CLOSE" : "MENU"}
        </button>
      </div>

      {menuOpen && (
        <div id="mobile-menu" className="page-wrap flex animate-[sx-in_.16s_ease-out] flex-col gap-1.5 border-t border-inv-div pb-[18px] pt-3 min-[1120px]:hidden">
          <nav aria-label="Main" className="flex flex-col gap-1.5">
            {NAV.map((n) => {
              const a = isActive(pathname, n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={a ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={`flex h-12 items-center gap-2.5 rounded-[3px] border border-inv-div px-3.5 text-[16px] font-bold hover:!no-underline ${a ? "bg-[#EDEDE8] !text-ink" : "!text-dim"}`}
                >
                  <span aria-hidden="true" className="h-2 w-2" style={{ background: a ? "#5A3CF0" : "#3D3D3A" }} />
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div role="group" aria-label="Hackathon event" className="mt-2 grid grid-cols-2 gap-1.5">
            {events.map((e) => {
              const a = e.id === event.id;
              return (
                <button
                  key={e.id}
                  type="button"
                  aria-pressed={a}
                  onClick={() => setEventId(e.id)}
                  className="h-11 rounded-[3px] border border-inv-div-2 font-mono text-[11px] font-medium"
                  style={{ background: a ? "#EDEDE8" : "transparent", color: a ? "#161616" : "#8E8E87" }}
                >
                  {e.shortName}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <a href={SITE.githubUrl} target="_blank" rel="noopener noreferrer" className="grid h-11 place-items-center rounded-[3px] border border-inv-div-2 font-mono text-[11px] font-medium !text-[#EDEDE8]">
              GITHUB ↗
            </a>
            <Link href="/build" onClick={() => setMenuOpen(false)} className="grid h-11 place-items-center rounded-[3px] bg-signal font-mono text-[11px] font-semibold !text-white hover:!no-underline">
              START BUILDING ▸
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
