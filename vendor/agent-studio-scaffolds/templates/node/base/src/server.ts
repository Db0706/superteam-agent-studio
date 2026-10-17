import { existsSync, readdirSync } from "node:fs";
import express, { type ErrorRequestHandler, type Express } from "express";
import { renderLanding } from "./landing.js";
import { modules } from "./modules.js";

// Secrets come from .env.local (git-ignored) or the real environment. Never hard-code them.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: fine, environment variables are used as they are.
}

const app = express();
app.use(express.json({ limit: "100kb" }));

// Home: lists every feature included in this service. Browsers get a readable page
// (src/landing.ts); code (curl, fetch, other agents) gets JSON.
app.get("/", (req, res) => {
  if (req.accepts(["json", "html"]) === "html") {
    res.type("html").send(renderLanding(modules, `${req.protocol}://${req.get("host")}`));
    return;
  }
  res.json({ service: "superteam-agent-service", modules });
});

// Every file in src/routes adds its own endpoints. Each module drops a new file there,
// so adding a feature never means editing this file.
type RouteFile = { default: (app: Express) => void };
const routesDir = new URL("./routes/", import.meta.url);
if (existsSync(routesDir)) {
  const files = readdirSync(routesDir).filter((f) => /\.(ts|js)$/.test(f) && !f.endsWith(".d.ts")).sort();
  for (const file of files) {
    const route = (await import(new URL(file, routesDir).href)) as RouteFile;
    route.default(app);
  }
}

app.use((_req, res) => {
  res.status(404).json({ error: "Not found. GET / lists the available endpoints." });
});

const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = Number(err?.status ?? err?.statusCode);
  if (status >= 400 && status < 500) {
    // Client mistakes such as malformed JSON bodies.
    res.status(status).json({ error: err.message });
    return;
  }
  console.error("Request failed:", err);
  res.status(500).json({ error: "Internal server error. Check the server logs." });
};
app.use(onError);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
