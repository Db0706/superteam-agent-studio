import type { ReactNode } from "react";

/** Plain policy page in the site's style: eyebrow, title, then numbered sections. */
export function LegalPage({ eyebrow, title, updated, intro, sections }: { eyebrow: string; title: string; updated: string; intro: ReactNode; sections: { heading: string; body: ReactNode }[] }) {
  return (
    <div className="page-wrap flex flex-col gap-6 pb-24 pt-[clamp(28px,4vw,48px)]">
      <header className="flex max-w-[760px] flex-col gap-2.5">
        <span className="eyebrow">{eyebrow} · LAST UPDATED {updated.toUpperCase()}</span>
        <h1 className="display-l">{title}</h1>
        <div className="m-0 text-[16px] leading-normal text-ink-2">{intro}</div>
      </header>
      <div className="module max-w-[860px]">
        {sections.map((s, i) => (
          <section key={s.heading} className="flex flex-col gap-2 border-b border-hairline px-5 py-4 last:border-b-0">
            <h2 className="m-0 font-mono text-[11px] font-semibold tracking-[0.06em]">
              {String(i + 1).padStart(2, "0")} · {s.heading.toUpperCase()}
            </h2>
            <div className="flex flex-col gap-2 text-[14.5px] leading-relaxed text-ink-2 [&_a]:underline">{s.body}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
