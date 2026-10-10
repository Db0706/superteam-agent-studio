import { INTEGRATION_MAP, FRAMEWORKS } from "@/config/integrations";
import type { FrameworkId } from "@/config/schema";
import type { DerivedProject, FileTag } from "./project";

/** Tokenised code lines for the preview panel. Ported from builder-data.js `codeFor`. */

export type TokenKind = "key" | "str" | "pun" | "num" | "com" | "txt" | "dir" | "guide";
export type CodeTab = "tree" | "deps" | "env" | "setup";

export interface CodeSegment {
  t: string;
  k: TokenKind;
}
export interface CodeLine {
  segs: CodeSegment[];
  tag: FileTag;
  note: string;
}

const L = (segs: CodeSegment[], tag: FileTag = null, note = ""): CodeLine => ({ segs, tag, note });
const S = (t: string, k: TokenKind = "txt"): CodeSegment => ({ t, k });

const tagNote = (tag: FileTag) => (!tag ? "" : tag === "companion" ? "companion" : INTEGRATION_MAP[tag].short);

export function codeFor(tab: CodeTab, proj: DerivedProject, id: string, fw: FrameworkId): CodeLine[] {
  if (tab === "tree") {
    return [L([S(`${id}/`, "dir")]), ...proj.tree.map((r) => L([S(r.prefix, "guide"), S(r.name, r.dir ? "dir" : "txt")], r.tag, tagNote(r.tag)))];
  }

  if (tab === "deps") {
    if (fw === "python") {
      return [
        L([S("# requirements.txt", "com")]),
        ...proj.deps.map((d) =>
          d.tbc ? L([S("# pay.sh client", "com")], d.tag, "to confirm") : L([S(d.name, "key"), S(">=", "pun"), S(d.version, "num")], d.tag),
        ),
      ];
    }
    const out: CodeLine[] = [
      L([S("{", "pun")]),
      L([S("  "), S('"name"', "key"), S(": ", "pun"), S(`"${id}"`, "str"), S(",", "pun")]),
      L([S("  "), S('"private"', "key"), S(": ", "pun"), S("true", "num"), S(",", "pun")]),
      L([S("  "), S('"scripts"', "key"), S(": {", "pun")]),
    ];
    const sc = FRAMEWORKS[fw].scripts;
    sc.forEach(([k, v], i) => out.push(L([S("    "), S(`"${k}"`, "key"), S(": ", "pun"), S(`"${v}"`, "str"), S(i < sc.length - 1 ? "," : "", "pun")])));
    out.push(L([S("  },", "pun")]));
    const block = (label: string, list: DerivedProject["deps"], last: boolean) => {
      out.push(L([S("  "), S(`"${label}"`, "key"), S(": {", "pun")]));
      list.forEach((d, i) =>
        out.push(
          L(
            [S("    "), S(`"${d.name}"`, "key"), S(": ", "pun"), S(`"${d.version}"`, d.tbc ? "com" : "str"), S(i < list.length - 1 ? "," : "", "pun")],
            d.tag,
            d.tbc ? "to confirm" : "",
          ),
        ),
      );
      out.push(L([S(last ? "  }" : "  },", "pun")]));
    };
    const dev = proj.deps.filter((d) => d.dev);
    block("dependencies", proj.deps.filter((d) => !d.dev), !dev.length);
    if (dev.length) block("devDependencies", dev, true);
    out.push(L([S("}", "pun")]));
    return out;
  }

  if (tab === "env") {
    if (!proj.env.length) return [L([S("# No keys needed yet.", "com")]), L([S("# Add a capability and its settings appear here.", "com")])];
    const out: CodeLine[] = [];
    let cur: string | null = null;
    proj.env.forEach((e) => {
      if (e.file !== cur) {
        if (cur) out.push(L([S("")]));
        cur = e.file;
        out.push(L([S(`# ${e.file}`, "com")]));
      }
      if (e.note) out.push(L([S(`# ${e.note}`, "com")], e.tag));
      out.push(L([S(e.key, "key"), S("=", "pun"), S(e.example, "str")], e.tag));
    });
    return out;
  }

  const out: CodeLine[] = [];
  proj.setup.forEach((s, i) => {
    out.push(L([S(`# ${i + 1}${s.note ? ` · ${s.note}` : ""}`, "com")]));
    out.push(L([S("$ ", "guide"), S(s.cmd)]));
  });
  return out;
}
