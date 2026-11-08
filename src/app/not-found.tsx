import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page-wrap py-20">
      <div className="flex flex-col items-center gap-3 rounded-[4px] border-[1.5px] border-dashed border-ext bg-diagram px-5 py-16 text-center">
        <span className="font-mono text-[10.5px] font-semibold text-muted">404 · NO SIGNAL</span>
        <h1 className="wide m-0 text-[24px] tracking-[-0.02em]">This wire doesn&apos;t connect to anything.</h1>
        <Link href="/" className="btn-tool mt-1.5 flex h-[42px] items-center px-3.5 !text-ink shadow-[0_2px_0_#161616] hover:!no-underline">
          BACK TO DASHBOARD ▸
        </Link>
      </div>
    </div>
  );
}
