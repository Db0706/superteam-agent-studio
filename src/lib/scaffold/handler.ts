import { join } from "node:path";
import { z } from "zod";
import { FW_ORDER } from "@/config/integrations";
import type { FrameworkId } from "@/config/schema";
import { validateConfiguration } from "@/lib/project-builder/generator";
import { validateName } from "@/lib/project-builder/project";
import { zipAvailability } from "./catalog";
import { composeScaffold } from "./compose";
import { clientKey, createRateLimiter } from "./rate-limit";
import { createZip } from "./zip";
import vendorJson from "../../../vendor/agent-studio-scaffolds/VENDOR.json";

/** Request body cap. A valid selection is well under 300 bytes. */
export const MAX_BODY_BYTES = 2048;
/** Uncompressed project cap. The full Next.js scaffold is ~60 KB. */
export const MAX_PROJECT_BYTES = 2 * 1024 * 1024;

const Body = z
  .object({
    name: z.string().max(80),
    framework: z.enum(FW_ORDER as [FrameworkId, ...FrameworkId[]]),
    integrations: z.array(z.string().max(32)).max(12),
  })
  .strict();

export interface ScaffoldErrorBody {
  error: string;
  retryable: boolean;
}

const json = (status: number, error: string, retryable = false, headers: Record<string, string> = {}) =>
  Response.json({ error, retryable } satisfies ScaffoldErrorBody, { status, headers: { "Cache-Control": "no-store", ...headers } });

async function readCapped(req: Request, cap: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > cap) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export interface HandlerOptions {
  root?: string;
  limiter?: ReturnType<typeof createRateLimiter>;
}

export function createScaffoldHandler({
  // Statically scoped so file tracing only includes the vendored templates.
  root = join(process.cwd(), "vendor", "agent-studio-scaffolds"),
  limiter = createRateLimiter({ perClient: 10, global: 120, windowMs: 60_000 }),
}: HandlerOptions = {}) {
  return async function POST(req: Request): Promise<Response> {
    const rate = limiter.take(clientKey(req));
    if (!rate.ok) return json(429, `Too many downloads. Try again in ${rate.retryAfterSec}s.`, true, { "Retry-After": String(rate.retryAfterSec) });

    if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json(415, "Send the selection as JSON.");
    const text = await readCapped(req, MAX_BODY_BYTES);
    if (text === null) return json(413, "Request too large.");

    let body: z.infer<typeof Body>;
    try {
      const parsed = Body.safeParse(JSON.parse(text));
      if (!parsed.success) return json(400, "Invalid selection.");
      body = parsed.data;
    } catch {
      return json(400, "Invalid JSON.");
    }

    const validation = validateConfiguration({ name: body.name, framework: body.framework, integrations: body.integrations as never });
    const errors = validation.issues.filter((i) => i.severity === "error");
    if (errors.length) return json(400, errors.map((e) => e.message).join(" "));

    const zip = zipAvailability(body.framework, body.integrations);
    if (!zip.ok) return json(422, zip.reason);

    const slug = validateName(body.name).id;
    let archive: Buffer;
    try {
      const { files } = composeScaffold(root, { framework: body.framework, modules: zip.modules, name: slug });
      const total = files.reduce((n, f) => n + f.data.length, 0);
      if (total > MAX_PROJECT_BYTES) throw new Error(`Composed project is ${total} bytes, over the ${MAX_PROJECT_BYTES} cap`);
      archive = createZip(
        files.map((f) => ({ path: `${slug}/${f.path}`, data: f.data })),
        new Date(vendorJson.committedAt),
      );
    } catch (err) {
      console.error("scaffold: composition failed", err);
      return json(500, "Couldn't build the project. Please try again.", true);
    }

    return new Response(new Uint8Array(archive), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${slug}.zip"`,
        "Content-Length": String(archive.length),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Scaffold-Version": vendorJson.version,
        "X-Scaffold-Commit": vendorJson.commit,
      },
    });
  };
}
