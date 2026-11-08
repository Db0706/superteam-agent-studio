import type { RubricCriterion } from "./results";

/**
 * The judging Google Sheet: one tab per track, one row per final submission. Judges fill in a
 * score per criterion and agree a Place; the platform reads the Place column back to publish
 * winners. Column A holds the submission id (hidden) so rows can be matched even if re-sorted.
 */

export type Track = "build" | "policy";
export const TRACK_TAB: Record<Track, string> = { build: "Build Track", policy: "Policy Track" };

export const PLACES = ["Winner", "Runner-up", "Honourable mention"] as const;
const PLACE_NUMBER: Record<string, number> = { winner: 1, "runner-up": 2, "runner up": 2, "honourable mention": 3, "honorable mention": 3, hm: 3, "1": 1, "2": 2, "3": 3 };

export interface SheetSubmission {
  id: string;
  project: string;
  team: string;
  university: string;
  members: string[];
  links: string[];
}

const FIXED = ["ID", "Project", "Team", "University", "Members", "Links"] as const;

/** Column letter for a 0-based index (0 → A). */
export function col(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export function headerRow(criteria: RubricCriterion[]): string[] {
  return [...FIXED, ...criteria.map((c) => `${c.name} (out of ${c.max})`), "Total /100", "Notes", "Place"];
}

/** Where each column sits, for formulas, validation and reading back. */
export function layout(criteria: RubricCriterion[]) {
  const firstScore = FIXED.length;
  const total = firstScore + criteria.length;
  return { firstScore, total, notes: total + 1, place: total + 2, width: total + 3 };
}

/** Weighted total out of 100, as a formula for row `r` (1-based), matching the platform's calculation. */
export function totalFormula(criteria: RubricCriterion[], r: number): string {
  const { firstScore } = layout(criteria);
  const parts = criteria.map((c, i) => `IF(ISNUMBER(${col(firstScore + i)}${r}),${col(firstScore + i)}${r}/${c.max}*${c.weight},0)`);
  const any = criteria.map((_, i) => `${col(firstScore + i)}${r}`).join(",");
  return parts.length ? `=IF(COUNT(${any})=0,"",ROUND(${parts.join("+")},1))` : "";
}

export function dataRows(criteria: RubricCriterion[], subs: SheetSubmission[]): (string | number)[][] {
  return subs.map((s, i) => [
    s.id,
    s.project,
    s.team,
    s.university,
    s.members.join(", "),
    s.links.join("\n"),
    ...criteria.map(() => ""),
    totalFormula(criteria, i + 2),
    "",
    "",
  ]);
}

export interface SheetResult {
  submissionId: string;
  project: string;
  team: string;
  place: number | null;
  placeText: string;
  total: number | null;
  scores: Record<string, number>;
}

export interface ParsedTab {
  results: SheetResult[];
  problems: string[];
}

/** Reads a tab back. Rows are matched by the hidden id column; unknown ids and duplicate places are reported. */
export function parseTab(criteria: RubricCriterion[], rows: (string | number | undefined)[][], known: Set<string>): ParsedTab {
  const { firstScore, total, place } = layout(criteria);
  const problems: string[] = [];
  const results: SheetResult[] = [];
  const header = (rows[0] ?? []).map((h) => String(h ?? "").trim());
  if (header[0] !== "ID" || header[place] !== "Place") problems.push("The header row has changed. Don't move or rename columns; add notes in the Notes column instead.");
  for (const row of rows.slice(1)) {
    const id = String(row[0] ?? "").trim();
    if (!id) continue;
    if (!known.has(id)) {
      problems.push(`Row for "${row[1] ?? id}" isn't a final submission any more; skipped.`);
      continue;
    }
    const placeText = String(row[place] ?? "").trim();
    const p = placeText ? (PLACE_NUMBER[placeText.toLowerCase()] ?? null) : null;
    if (placeText && p === null) problems.push(`"${row[1]}": Place "${placeText}" isn't one of ${PLACES.join(", ")}.`);
    const scores: Record<string, number> = {};
    criteria.forEach((c, i) => {
      const v = Number(String(row[firstScore + i] ?? "").trim());
      if (String(row[firstScore + i] ?? "").trim() !== "" && Number.isFinite(v)) scores[c.key] = Math.max(0, Math.min(c.max, v));
    });
    const t = Number(row[total]);
    results.push({ submissionId: id, project: String(row[1] ?? ""), team: String(row[2] ?? ""), place: p, placeText, total: String(row[total] ?? "") !== "" && Number.isFinite(t) ? t : null, scores });
  }
  for (const n of [1, 2, 3]) {
    const holders = results.filter((r) => r.place === n);
    if (holders.length > 1) problems.push(`${PLACES[n - 1]} is given to more than one project: ${holders.map((h) => h.project).join(", ")}.`);
  }
  return { results, problems };
}
