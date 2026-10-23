import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";

/**
 * Outbound HTTP for the verifier: the only way it talks to participant apps.
 *
 * Participant URLs are untrusted. This client:
 *  - accepts only http(s) URLs on default or explicitly allowed ports,
 *  - resolves the hostname once, rejects private, loopback, link-local, CGNAT, multicast,
 *    metadata and other non-public addresses, then pins the socket to the checked address
 *    (so DNS rebinding between check and connect can't redirect it),
 *  - never follows redirects (a 3xx is returned as-is and treated as a failure by verifiers),
 *  - caps response size and total time, and sends no ambient credentials.
 *
 * Private hosts are allowed only when the caller passes `allowPrivate` (local development and
 * tests with fixture apps on localhost). Production workers never set it.
 */

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [["::", 128], ["::1", 128], ["::ffff:0:0", 96], ["64:ff9b::", 96], ["100::", 64], ["2001:db8::", 32], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  if (family === 6) {
    // IPv4-mapped IPv6 (::ffff:10.0.0.1): judge the embedded IPv4 address.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return isPublicAddress(mapped[1]);
    return !blocked.check(address, "ipv6");
  }
  return !blocked.check(address, "ipv4");
}

export interface SafeFetchOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
  /** Development and tests only: allow loopback/private targets (fixture apps on localhost). */
  allowPrivate?: boolean;
  /** Extra ports beyond 80/443 that may be called. */
  allowedPorts?: number[];
}

export interface SafeResponse {
  status: number;
  headers: Record<string, string>;
  bodyText: string;
  truncated: boolean;
  /** Address actually connected to. */
  address: string;
  elapsedMs: number;
}

export type SafeFetchFailure = { kind: "unsafe" | "dns" | "timeout" | "network" | "too_large"; message: string; elapsedMs: number };

export async function resolveSafely(url: URL, allowPrivate: boolean): Promise<{ address: string; family: 4 | 6 }> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^(metadata|metadata\.google\.internal|instance-data)$/i.test(host)) throw new UnsafeUrlError("That host is not allowed.");
  const results = isIP(host) ? [{ address: host, family: isIP(host) as 4 | 6 }] : await dnsLookup(host, { all: true, verbatim: true });
  if (!results.length) throw new UnsafeUrlError("The host name does not resolve.");
  if (!allowPrivate) {
    const bad = results.find((r) => !isPublicAddress(r.address));
    if (bad) throw new UnsafeUrlError(`The app URL points at a private or reserved address (${bad.address}). Use a public https URL, for example a deployed app or a tunnel.`);
  }
  return { address: results[0].address, family: results[0].family as 4 | 6 };
}

export function checkUrlShape(raw: string, opts: Pick<SafeFetchOptions, "allowPrivate" | "allowedPorts"> = {}): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("That is not a valid URL.");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && opts.allowPrivate)) throw new UnsafeUrlError("The app URL must use https://.");
  if (url.username || url.password) throw new UnsafeUrlError("URLs with credentials are not allowed.");
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (![80, 443, ...(opts.allowedPorts ?? [])].includes(port) && !opts.allowPrivate) throw new UnsafeUrlError(`Port ${port} is not allowed. Use the standard https port.`);
  return url;
}

export async function safeFetch(raw: string, opts: SafeFetchOptions = {}): Promise<SafeResponse | SafeFetchFailure> {
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxBytes = opts.maxBytes ?? 256 * 1024;
  let url: URL;
  let pinned: { address: string; family: 4 | 6 };
  try {
    url = checkUrlShape(raw, opts);
    pinned = await resolveSafely(url, !!opts.allowPrivate);
  } catch (err) {
    if (err instanceof UnsafeUrlError) return { kind: "unsafe", message: err.message, elapsedMs: elapsed() };
    return { kind: "dns", message: "The app's host name could not be resolved.", elapsedMs: elapsed() };
  }

  // Pin the connection to the address we checked.
  const lookup: LookupFunction = (_hostname, options, callback) => {
    if (typeof options === "object" && options && "all" in options && options.all) {
      (callback as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [{ address: pinned.address, family: pinned.family }]);
    } else callback(null, pinned.address, pinned.family);
  };

  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: SafeResponse | SafeFetchFailure) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(r);
      }
    };
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      {
        method: opts.method ?? "GET",
        headers: { "user-agent": "AgentStudioVerifier/1", accept: "application/json", ...(opts.body ? { "content-type": "application/json" } : {}), ...opts.headers },
        lookup,
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            truncated = true;
            chunks.push(chunk.subarray(0, Math.max(0, chunk.length - (size - maxBytes))));
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });
        const done = () =>
          finish({
            status: res.statusCode ?? 0,
            headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : String(v ?? "")])),
            bodyText: Buffer.concat(chunks).toString("utf8"),
            truncated,
            address: pinned.address,
            elapsedMs: elapsed(),
          });
        res.on("end", done);
        res.on("close", done);
        res.on("error", () => (truncated ? done() : finish({ kind: "network", message: "The connection to the app broke mid-response.", elapsedMs: elapsed() })));
      },
    );
    const timer = setTimeout(() => {
      req.destroy();
      finish({ kind: "timeout", message: `The app did not answer within ${Math.round(timeoutMs / 1000)}s.`, elapsedMs: elapsed() });
    }, timeoutMs);
    req.on("error", (err: NodeJS.ErrnoException) => {
      const message =
        err.code === "ECONNREFUSED" ? "The app refused the connection. Is it running and reachable?" :
        err.code === "CERT_HAS_EXPIRED" || err.code?.startsWith("ERR_TLS") || err.code?.includes("CERT") ? "The app's TLS certificate is not valid." :
        "Could not reach the app.";
      finish({ kind: "network", message, elapsedMs: elapsed() });
    });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

export const isFailure = (r: SafeResponse | SafeFetchFailure): r is SafeFetchFailure => "kind" in r;
