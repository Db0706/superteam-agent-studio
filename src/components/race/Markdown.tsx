import type { ReactNode } from "react";

/**
 * A small Markdown subset for organiser-written layer instructions: paragraphs, "- " lists,
 * fenced code blocks, `inline code`, **bold** and [links](https://…). Renders React elements
 * only (no HTML injection), and only http(s) links.
 */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={key++} className="m-0 overflow-x-auto rounded-[4px] bg-ink px-3.5 py-3 font-mono text-[12px] leading-[1.7] text-[#D4D4CE]">
          {code.join("\n")}
        </pre>,
      );
      continue;
    }
    if (/^\s*[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*] /.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*] /, ""));
      blocks.push(
        <ul key={key++} className="m-0 flex flex-col gap-1 pl-5">
          {items.map((it, j) => (
            <li key={j}>{inline(it)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith("```") && !/^\s*[-*] /.test(lines[i])) para.push(lines[i++]);
    blocks.push(
      <p key={key++} className="m-0">
        {inline(para.join(" "))}
      </p>,
    );
  }
  return <div className={`flex flex-col gap-2.5 text-[14px] leading-[1.55] text-ink-2 ${className ?? ""}`}>{blocks}</div>;
}

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<code key={k++}>{m[1].slice(1, -1)}</code>);
    else if (m[2]) out.push(<b key={k++}>{m[2].slice(2, -2)}</b>);
    else if (m[3]) {
      const label = m[3].slice(1, m[3].indexOf("]"));
      out.push(
        <a key={k++} href={m[4]} target="_blank" rel="noopener noreferrer">
          {label} ↗
        </a>,
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
