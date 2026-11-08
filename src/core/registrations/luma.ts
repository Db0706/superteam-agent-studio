/**
 * Parses a Luma guest-list CSV export into approved-attendee rows. Luma has no public API we
 * rely on: organisers export the guest list (Event → Guests → Export) and upload it here.
 *
 * Column names are matched loosely (Luma has renamed columns over time): email, name or
 * first/last name, approval status, ticket name, checked-in time, and an optional university
 * question. Ticket names containing "panel" are panel-only; everything else is a hackathon ticket.
 */

export type Ticket = "hackathon" | "panel";
export type Status = "approved" | "pending" | "declined" | "checked_in";

export interface ImportRow {
  email: string;
  full_name: string;
  ticket: Ticket;
  status: Status;
  university: string;
  external_id: string;
  checked_in_at: string;
}

export interface ParseReport {
  rows: ImportRow[];
  problems: { line: number; message: string }[];
  duplicates: string[];
  columns: { email: string | null; name: string | null; status: string | null; ticket: string | null; checkedIn: string | null; university: string | null };
  counts: { hackathon: number; panel: number; approved: number; pending: number; declined: number; checkedIn: number };
}

/** RFC 4180-ish CSV: quoted fields, escaped quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function findColumn(headers: string[], ...candidates: RegExp[]): number {
  for (const re of candidates) {
    const i = headers.findIndex((h) => re.test(norm(h)));
    if (i >= 0) return i;
  }
  return -1;
}

export function mapStatus(raw: string, checkedIn: boolean): Status {
  if (checkedIn) return "checked_in";
  const s = norm(raw);
  if (/declin|reject|cancel/.test(s)) return "declined";
  if (/pending|waitlist|invited|request/.test(s)) return "pending";
  if (/approv|going|accepted|registered|^$/.test(s)) return "approved";
  return "pending";
}

export function mapTicket(raw: string): Ticket {
  return /panel/i.test(raw) ? "panel" : "hackathon";
}

export function parseLumaCsv(text: string): ParseReport {
  const table = parseCsv(text);
  const report: ParseReport = {
    rows: [],
    problems: [],
    duplicates: [],
    columns: { email: null, name: null, status: null, ticket: null, checkedIn: null, university: null },
    counts: { hackathon: 0, panel: 0, approved: 0, pending: 0, declined: 0, checkedIn: 0 },
  };
  if (table.length < 2) {
    report.problems.push({ line: 1, message: "The file has no guest rows. Export the guest list from Luma as CSV." });
    return report;
  }
  const headers = table[0];
  const col = {
    email: findColumn(headers, /^email$/, /email/),
    name: findColumn(headers, /^name$/, /full name/),
    first: findColumn(headers, /^first name$/),
    last: findColumn(headers, /^last name$/),
    status: findColumn(headers, /approval status/, /^status$/),
    ticket: findColumn(headers, /ticket name/, /ticket type$/, /^ticket$/),
    checkedIn: findColumn(headers, /checked in at/, /check in/),
    university: findColumn(headers, /university/, /college/, /institution/),
    id: findColumn(headers, /^api id$/, /^id$/, /guest id/),
  };
  const name = (i: number) => (i >= 0 ? headers[i] : null);
  report.columns = { email: name(col.email), name: name(col.name >= 0 ? col.name : col.first), status: name(col.status), ticket: name(col.ticket), checkedIn: name(col.checkedIn), university: name(col.university) };
  if (col.email < 0) {
    report.problems.push({ line: 1, message: "No email column found. The CSV needs an Email column." });
    return report;
  }
  const seen = new Map<string, number>();
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const at = (i: number) => (i >= 0 ? (cells[i] ?? "").trim() : "");
    const email = at(col.email).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      report.problems.push({ line: r + 1, message: email ? `"${email}" is not a valid email.` : "Missing email." });
      continue;
    }
    if (seen.has(email)) {
      report.duplicates.push(email);
      continue;
    }
    seen.set(email, r + 1);
    const checkedRaw = at(col.checkedIn);
    const checkedIso = checkedRaw && !Number.isNaN(Date.parse(checkedRaw)) ? new Date(checkedRaw).toISOString() : "";
    const row: ImportRow = {
      email,
      full_name: at(col.name) || [at(col.first), at(col.last)].filter(Boolean).join(" "),
      ticket: mapTicket(at(col.ticket)),
      status: mapStatus(at(col.status), !!checkedIso),
      university: at(col.university),
      external_id: at(col.id),
      checked_in_at: checkedIso,
    };
    report.rows.push(row);
    report.counts[row.ticket]++;
    if (row.status === "checked_in") report.counts.checkedIn++;
    else report.counts[row.status]++;
  }
  return report;
}
