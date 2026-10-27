import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** AES-256-GCM with a key that lives only in the web server's environment (GOOGLE_TOKEN_KEY). */
function key(): Buffer {
  const secret = process.env.GOOGLE_TOKEN_KEY;
  if (!secret || secret.length < 16) throw new Error("GOOGLE_TOKEN_KEY is not set (at least 16 characters).");
  return createHash("sha256").update(secret).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64");
}

export function decrypt(enc: string): string {
  const raw = Buffer.from(enc, "base64");
  const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
}
