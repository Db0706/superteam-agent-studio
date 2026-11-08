/**
 * Submission forms for the official tracks. One definition drives the form, autosave and the
 * check before final submission. Drafts can be incomplete; final submission needs every
 * required field.
 */
export type Track = "build" | "policy";

export interface FieldSpec {
  key: string;
  label: string;
  help?: string;
  kind: "text" | "longtext" | "url";
  required: boolean;
  max: number;
}

export const TRACK_FIELDS: Record<Track, FieldSpec[]> = {
  build: [
    { key: "problem", label: "Problem solved", help: "Who has this problem and why it matters.", kind: "longtext", required: true, max: 1500 },
    { key: "description", label: "Project description", help: "What you built and how someone uses it.", kind: "longtext", required: true, max: 3000 },
    { key: "repo", label: "Code repository", help: "Public GitHub link, or a private repo shared with the organisers.", kind: "url", required: true, max: 400 },
    { key: "demo", label: "Demo link", help: "A deployed app or a short video.", kind: "url", required: false, max: 400 },
    { key: "architecture", label: "Technical architecture", help: "Main components, models, data and services.", kind: "longtext", required: true, max: 3000 },
    { key: "aiCapabilities", label: "AI capabilities", help: "What the AI does, which models, and how you checked it works.", kind: "longtext", required: true, max: 2000 },
  ],
  policy: [
    { key: "problem", label: "Problem definition", help: "The governance problem and who it affects.", kind: "longtext", required: true, max: 2000 },
    { key: "proposal", label: "Proposed policy or governance framework", kind: "longtext", required: true, max: 5000 },
    { key: "evidence", label: "Research evidence", help: "Sources, data and prior work your proposal rests on.", kind: "longtext", required: true, max: 4000 },
    { key: "implementation", label: "Implementation considerations", help: "Who acts, costs, timelines, legal or institutional routes.", kind: "longtext", required: true, max: 3000 },
    { key: "risks", label: "Risks and limitations", kind: "longtext", required: true, max: 3000 },
    { key: "document", label: "Supporting document or presentation", help: "Link to a PDF, slides or a doc.", kind: "url", required: false, max: 400 },
  ],
};

export const TRACK_LABEL: Record<Track, string> = { build: "Build Track", policy: "Policy Track" };

export function missingForFinal(track: Track, title: string, fields: Record<string, unknown>): string[] {
  const missing = title.trim() ? [] : ["Title"];
  for (const f of TRACK_FIELDS[track]) {
    const v = typeof fields[f.key] === "string" ? (fields[f.key] as string).trim() : "";
    if (f.required && !v) missing.push(f.label);
    if (v && f.kind === "url" && !/^https:\/\/\S+$/.test(v)) missing.push(`${f.label} (must be an https:// link)`);
  }
  return missing;
}

/** Keeps only known fields, as trimmed strings within their limits. */
export function cleanFields(track: Track, fields: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of TRACK_FIELDS[track]) {
    const v = fields[f.key];
    if (typeof v === "string") out[f.key] = v.slice(0, f.max);
  }
  return out;
}
