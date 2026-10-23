"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SITE } from "@/config/site";

/**
 * Navigation in the order people use it on the day: get briefed, understand what's possible,
 * build, then compete. Each heading opens a menu of the pages under it.
 */
export const NAV_GROUPS = [
  {
    label: "Brief",
    items: [
      { href: "/", label: "Event overview", hint: "Dates, venue, programme, tracks and prizes" },
      { href: "/start", label: "First 10 minutes", hint: "From nothing to a running app, step by step" },
    ],
  },
  {
    label: "Understand",
    items: [
      { href: "/playground", label: "AI Capability Lab", hint: "What each AI capability takes and how it's checked" },
      { href: "/inspiration", label: "Inspiration", hint: "Ideas for what to build" },
    ],
  },
  {
    label: "Build",
    items: [
      { href: "/build", label: "Get a starter", hint: "Download a working project for your framework" },
      { href: "/team", label: "Your team", hint: "Create or join a team and connect your app" },
      { href: "/mentor", label: "Ask a mentor", hint: "Get help at your table" },
    ],
  },
  {
    label: "Compete",
    items: [
      { href: "/race", label: "AI Race", hint: "Verify your app and score points" },
      { href: "/leaderboard", label: "Leaderboard", hint: "Live points, Cambridge vs Oxford" },
      { href: "/submit", label: "Submit your project", hint: "Your entry for the Build or Policy track" },
    ],
  },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** `account` is a server-rendered slot (sign-in link or account menu), streamed behind Suspense. */
export function AppHeader({ account }: { account?: ReactNode }) {
  return <HeaderFrame account={account} pathname={usePathname()} />;
}

/**
 * Same header before the URL is known (dynamic routes prerender without it, so the layout wraps
 * AppHeader in <Suspense> with this as the fallback): identical, just no active item.
 */
export function AppHeaderFallback({ account }: { account?: ReactNode }) {
  return <HeaderFrame account={account} pathname="" />;
}

function HeaderFrame({ account, pathname }: { account?: ReactNode; pathname: string }) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  const navRef = useRef<HTMLElement>(null);

  // Close menus whenever the route changes (incl. back/forward).
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenuOpen(false);
    setOpenGroup(null);
  }

  useEffect(() => {
    if (!openGroup && !menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenGroup(null);
        setMenuOpen(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (openGroup && navRef.current && !navRef.current.contains(e.target as Node)) setOpenGroup(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [openGroup, menuOpen]);

  return (
    <header className="sticky top-0 z-40 bg-ink text-[#EDEDE8]">
      <div className="page-wrap flex h-14 items-center gap-6">
        <Link href="/" className="flex flex-none items-baseline gap-2.5 !text-[#EDEDE8] hover:!no-underline" aria-label="Agent Studio by Superteam: Home">
          <span className="wide text-[14px] tracking-[0.02em]">AGENT STUDIO</span>
          <span className="font-mono text-[10px] font-normal text-dim-2">by Superteam</span>
        </Link>

        {/* Desktop (≥1120px): four headings, each with a menu */}
        <nav ref={navRef} aria-label="Main" className="hidden flex-1 items-center gap-1 min-[1120px]:flex">
          {NAV_GROUPS.map((g, gi) => {
            const groupActive = g.items.some((i) => isActive(pathname, i.href));
            const open = openGroup === g.label;
            return (
              <div key={g.label} className="relative">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={`nav-${g.label}`}
                  onClick={() => setOpenGroup(open ? null : g.label)}
                  className={`flex h-9 items-center gap-2 rounded-[3px] border-0 px-3 text-[13.5px] font-semibold ${groupActive || open ? "bg-[#EDEDE8] text-ink" : "bg-transparent text-dim hover:text-white"}`}
                >
                  <span className="font-mono text-[10px] opacity-60">{gi + 1}</span>
                  {g.label}
                  <span aria-hidden="true" className="text-[9px] opacity-70">
                    {open ? "▲" : "▼"}
                  </span>
                </button>
                {open && (
                  <div id={`nav-${g.label}`} className="absolute left-0 top-[calc(100%+6px)] w-[320px] animate-[sx-in_.12s_ease-out] overflow-hidden rounded-[4px] border border-ink bg-white text-ink shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
                    <ul className="m-0 flex list-none flex-col p-1.5">
                      {g.items.map((i) => {
                        const a = isActive(pathname, i.href);
                        return (
                          <li key={i.href}>
                            <Link
                              href={i.href}
                              aria-current={a ? "page" : undefined}
                              onClick={() => setOpenGroup(null)}
                              className={`flex flex-col gap-0.5 rounded-[3px] px-3 py-2.5 !text-ink hover:bg-strip hover:!no-underline ${a ? "bg-signal-tint" : ""}`}
                            >
                              <span className="text-[14px] font-semibold">{i.label}</span>
                              <span className="text-[12.5px] text-muted">{i.hint}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="hidden flex-none items-center gap-3.5 font-mono text-[11px] font-medium min-[1120px]:flex">{account}</div>

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
        <div id="mobile-menu" className="page-wrap flex max-h-[calc(100dvh-56px)] animate-[sx-in_.16s_ease-out] flex-col gap-3 overflow-y-auto border-t border-inv-div pb-[18px] pt-3 min-[1120px]:hidden">
          <nav aria-label="Main" className="flex flex-col gap-3">
            {NAV_GROUPS.map((g, gi) => (
              <section key={g.label} aria-label={g.label} className="flex flex-col gap-1.5">
                <span className="font-mono text-[10.5px] tracking-[0.06em] text-dim-2">
                  {gi + 1} · {g.label.toUpperCase()}
                </span>
                {g.items.map((i) => {
                  const a = isActive(pathname, i.href);
                  return (
                    <Link
                      key={i.href}
                      href={i.href}
                      aria-current={a ? "page" : undefined}
                      onClick={() => setMenuOpen(false)}
                      className={`flex min-h-12 flex-col justify-center rounded-[3px] border border-inv-div px-3.5 py-2 hover:!no-underline ${a ? "bg-[#EDEDE8] !text-ink" : "!text-[#EDEDE8]"}`}
                    >
                      <span className="text-[16px] font-bold">{i.label}</span>
                      <span className={`text-[12.5px] ${a ? "text-ink-2" : "text-dim-2"}`}>{i.hint}</span>
                    </Link>
                  );
                })}
              </section>
            ))}
          </nav>
          {account && <div className="flex flex-wrap items-center gap-3 border-t border-inv-div pt-3 font-mono text-[11px]">{account}</div>}
          <a href={SITE.githubUrl} target="_blank" rel="noopener noreferrer" className="grid h-11 place-items-center rounded-[3px] border border-inv-div-2 font-mono text-[11px] font-medium !text-[#EDEDE8]">
            GITHUB ↗
          </a>
        </div>
      )}
    </header>
  );
}
