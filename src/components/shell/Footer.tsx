import { SITE } from "@/config/site";

export function Footer() {
  return (
    <footer className="bg-ink text-dim-2">
      <div className="page-wrap flex flex-wrap justify-between gap-3 py-4 font-mono text-[10.5px]">
        <span>AGENT STUDIO · DESIGN APPROVAL BUILD · ALL PAYMENTS AND AI ACTIVITY SIMULATED</span>
        <span className="flex flex-wrap gap-4">
          <a href={SITE.githubUrl} target="_blank" rel="noopener noreferrer" className="!text-[#EDEDE8]">
            GITHUB ↗
          </a>
          <span>PAYMENTS ON SOLANA</span>
        </span>
      </div>
    </footer>
  );
}
