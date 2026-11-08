import type { AppCall, TaskOk } from "../plugin";

/** Helpers shared by the built-in plugins. */

export const FIRST_NAMES = ["Amara", "Tomás", "Priya", "Jonas", "Mei", "Kwame", "Sofia", "Idris", "Hana", "Lukas", "Zara", "Ravi"] as const;
export const LAST_NAMES = ["Okafor", "Lindqvist", "Raman", "Hartley", "Chen", "Mensah", "Ferreira", "Haddad", "Sato", "Becker", "Ahmed", "Iyer"] as const;
export const ORGS = ["Cavendish Laboratory", "Bodleian Libraries", "Wellcome Sanger Institute", "Oxford Robotics Institute", "Cambridge Zero", "Alan Turing Institute"] as const;
export const ROLES = ["research engineer", "data scientist", "policy fellow", "lab manager", "postdoctoral researcher", "product lead"] as const;
export const WORDS = ["heron", "quartz", "lantern", "meridian", "saffron", "cobalt", "juniper", "aurora", "falcon", "tundra"] as const;

export function okResponse(call: AppCall): TaskOk | null {
  return call.response && call.response.status === "ok" && call.nonceEchoed ? call.response : null;
}

/** Text of an answer, whether the app put it in output.text or output.data. */
export function answerText(res: TaskOk | null): string {
  if (!res) return "";
  const parts = [res.output.text ?? ""];
  if (res.output.data !== undefined) parts.push(typeof res.output.data === "string" ? res.output.data : JSON.stringify(res.output.data));
  return parts.join(" ");
}

export const normalise = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** Does the text contain this number (allowing thousands separators and a tolerance)? */
export function containsNumber(text: string, expected: number, tolerance = 0.011): boolean {
  const nums = (text.replace(/,(?=\d{3})/g, "").match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  return nums.some((n) => Math.abs(n - expected) <= tolerance);
}

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Say what went wrong with a call in one participant-safe sentence. */
export function describeCall(call: AppCall, expectOk = true): string {
  if (call.failure) return call.failure;
  if (!call.response) return `HTTP ${call.httpStatus}, but the body was not a valid ASRP/1 envelope (needs protocol, nonce, status).`;
  if (!call.nonceEchoed) return "The envelope did not echo the request nonce.";
  if (expectOk && call.response.status === "error") return `The app returned an error: ${call.response.error.code} (${call.response.error.message.slice(0, 120)}).`;
  return "OK";
}
