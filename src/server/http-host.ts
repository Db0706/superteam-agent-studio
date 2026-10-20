import http from "node:http";
import type { AddressInfo } from "node:net";
import { handleChallengeRequest } from "./challenge/service";
import type { Sql } from "./db";
import { handleFixture, isFixtureVariant } from "./fixtures/reference-app";

/**
 * Serves the reference challenge services (and optionally the fixture apps) from plain Node,
 * for automated tests and local rehearsals. On Vercel the same handlers run as route handlers
 * under src/app/api/race/.
 */
export async function startHost(opts: { sql: Sql; port?: number; fixtures?: boolean; fixtureToken?: (participantHint: string) => string | null }) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://host");
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const request = new Request(url, {
        method: req.method,
        headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : String(v ?? "")])),
        body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks),
      });
      let response: Response;
      const challenge = /^\/api\/race\/challenge\/(.+)$/.exec(url.pathname);
      const fixture = /^\/api\/race\/fixtures\/([a-z-]+)(\/.*)$/.exec(url.pathname);
      if (challenge) response = await handleChallengeRequest(request, opts.sql, challenge[1]);
      else if (fixture && opts.fixtures && isFixtureVariant(fixture[1])) response = await handleFixture(request, fixture[1], fixture[2], null);
      else response = new Response(JSON.stringify({ error: "not found" }), { status: 404 });
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
  });
  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((r) => server.close(() => r())) };
}
