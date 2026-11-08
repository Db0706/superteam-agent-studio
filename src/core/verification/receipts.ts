import { createHmac, timingSafeEqual } from "node:crypto";
import { canonicalJson } from "../tournament/config";

/**
 * Verification receipts: a signed statement that the platform verified an attempt.
 * HMAC-SHA256 over the canonical JSON payload with RECEIPT_SIGNING_KEY. Anyone with the key
 * (the platform) can check one; the payload binds tournament, layer, participant, attempt,
 * config version and result, so a receipt can't be replayed for another attempt.
 */

export interface ReceiptPayload {
  v: 1;
  receiptId: string;
  tournamentId: string;
  configVersion: number;
  layerKey: string;
  participantId: string;
  attemptId: string;
  attemptNo: number;
  submittedAt: string;
  verifiedAt: string;
  score: number;
  status: "passed";
  checks: { id: string; passed: boolean }[];
}

export function signReceipt(payload: ReceiptPayload, key: string): string {
  return createHmac("sha256", key).update(canonicalJson(payload)).digest("hex");
}

export function verifyReceipt(payload: ReceiptPayload, signature: string, key: string): boolean {
  const expected = Buffer.from(signReceipt(payload, key), "hex");
  const got = Buffer.from(signature, "hex");
  return expected.length === got.length && timingSafeEqual(expected, got);
}
