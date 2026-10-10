import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { FRAMEWORK_DIRS, isComposableFramework } from "./frameworks";

/**
 * In-memory port of the scaffold repository's `scripts/compose.mjs`.
 *
 * Reads the vendored templates (vendor/agent-studio-scaffolds) and returns the
 * composed project as a list of files, without touching the disk. Output is
 * byte-for-byte identical to `compose.mjs` (see tests/unit/scaffold.test.ts),
 * so anything the scaffold repository's CI verified is what students download.
 * Server only: it reads the file system.
 */

export const VENDOR_DIR = "vendor/agent-studio-scaffolds";


interface EnvDef {
  key: string;
  example: string;
  required: boolean;
  secret: boolean;
  note: string;
}

interface PartManifest {
  id: string;
  name: string;
  summary?: string;
  nav?: { label?: string; href?: string };
  requires: string[];
  files: string[];
  generatedFiles?: string[];
  /** Base only: the generated module list path (compose.mjs default "lib/modules.ts"). */
  modulesFile?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  env: EnvDef[];
  prerequisites: string[];
  readme: string;
}

interface Part extends PartManifest {
  /** Template file contents by output path. */
  content: Map<string, Buffer>;
}

interface Framework {
  version: string;
  base: Part;
  modules: Record<string, Part>;
}

export interface StudioManifest {
  scaffoldVersion: string;
  framework: string;
  modules: string[];
  autoAddedModules: string[];
  files: string[];
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
  env: { key: string; required: boolean; secret: boolean; module: string }[];
  prerequisites: string[];
}

export interface ComposedFile {
  path: string;
  data: Buffer;
}

export interface Composed {
  files: ComposedFile[];
  manifest: StudioManifest;
}

export class ScaffoldCompositionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScaffoldCompositionError";
  }
}

/** Paths a generated project must never contain: real env files, keys, traversal. */
export function isForbiddenPath(path: string): boolean {
  return (
    path.startsWith("/") ||
    path.split("/").some((seg) => seg === ".." || seg === "" || seg === ".") ||
    /(^|\/)\.env(?!\.example$)[^/]*$/.test(path) ||
    /\.pem$|keypair\.json$/.test(path)
  );
}

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((p) => statSync(join(dir, p)).isFile())
    .map((p) => p.split("\\").join("/"));
}

function loadPart(dir: string, filesDir: string): Part {
  const m = readJson<PartManifest>(join(dir, "manifest.json"));
  const content = new Map<string, Buffer>();
  for (const f of listFiles(filesDir)) content.set(f, readFileSync(join(filesDir, f)));
  content.set(`\0readme`, readFileSync(join(dir, m.readme)));
  return { ...m, content };
}

const cache = new Map<string, Framework>();

/** Loads (once per process) a framework's base and modules from a scaffold checkout. */
export function loadFramework(root: string, framework: string): Framework {
  const key = `${root}\0${framework}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (!isComposableFramework(framework)) throw new ScaffoldCompositionError(`Unknown framework "${framework}". Known: ${Object.keys(FRAMEWORK_DIRS).join(", ")}`);
  const dir = FRAMEWORK_DIRS[framework];
  const baseDir = join(root, dir, "base");
  const modulesDir = join(root, dir, "modules");
  const modules: Record<string, Part> = {};
  for (const id of readdirSync(modulesDir)) {
    const part = loadPart(join(modulesDir, id), join(modulesDir, id, "files"));
    if (part.id !== id) throw new ScaffoldCompositionError(`modules/${id}/manifest.json has id "${part.id}"`);
    modules[id] = part;
  }
  const fw: Framework = {
    version: readJson<{ version: string }>(join(root, "package.json")).version,
    base: loadPart(baseDir, baseDir),
    modules,
  };
  cache.set(key, fw);
  return fw;
}

/** Adds required modules and returns them in dependency order (same algorithm as compose.mjs). */
export function resolveModules(modules: Record<string, Pick<Part, "requires">>, requested: string[]) {
  const order: string[] = [];
  const autoAdded: string[] = [];
  const visit = (id: string, chain: string[]) => {
    const m = modules[id];
    if (!m) throw new ScaffoldCompositionError(`Unknown module "${id}". Known: ${Object.keys(modules).join(", ")}`);
    if (chain.includes(id)) throw new ScaffoldCompositionError(`Module dependency cycle: ${[...chain, id].join(" -> ")}`);
    if (order.includes(id)) return;
    for (const dep of m.requires) visit(dep, [...chain, id]);
    if (!requested.includes(id)) autoAdded.push(id);
    order.push(id);
  };
  for (const id of requested) visit(id, []);
  return { order, autoAdded };
}

function mergeRecord(target: Record<string, string>, source: Record<string, string> | undefined, what: string, owner: string) {
  for (const [k, v] of Object.entries(source ?? {})) {
    if (k in target && target[k] !== v) throw new ScaffoldCompositionError(`${owner} wants ${what} ${k}@${v} but ${k}@${target[k]} is already selected`);
    target[k] = v;
  }
}

const sortRecord = (r: Record<string, string>) => Object.fromEntries(Object.entries(r).sort(([a], [b]) => a.localeCompare(b)));

function get(part: Part, file: string): Buffer {
  const data = part.content.get(file);
  if (!data) throw new ScaffoldCompositionError(`${part.id} lists ${file} but the file does not exist`);
  return data;
}

export function composeScaffold(
  root: string,
  { framework, modules: requested, name = "superteam-agent-app" }: { framework: string; modules: string[]; name?: string },
): Composed {
  const { version, base, modules } = loadFramework(root, framework);
  const { order, autoAdded } = resolveModules(modules, requested);
  const parts = [base, ...order.map((id) => modules[id])];
  const out = new Map<string, Buffer>();
  const generated = base.generatedFiles ?? [];
  // The generated module list (drives the home page / GET /). Its path differs per framework.
  const modulesFile = base.modulesFile ?? "lib/modules.ts";

  // 1. Files. Base files first; modules may only add new files.
  const owners = new Map<string, string>();
  for (const file of base.files) {
    if (generated.includes(file) && file !== modulesFile) continue;
    out.set(file, get(base, file));
    owners.set(file, "base");
  }
  for (const id of order) {
    for (const file of modules[id].files) {
      if (owners.has(file)) throw new ScaffoldCompositionError(`File conflict: ${file} is provided by both ${owners.get(file)} and ${id}`);
      out.set(file, get(modules[id], file));
      owners.set(file, id);
    }
  }

  // 2. package.json
  const pkg = JSON.parse(get(base, "package.json").toString("utf8"));
  pkg.name = name;
  const deps: Record<string, string> = {};
  const devDeps: Record<string, string> = {};
  const scripts: Record<string, string> = {};
  for (const p of parts) {
    mergeRecord(deps, p.dependencies, "dependency", p.id);
    mergeRecord(devDeps, p.devDependencies, "devDependency", p.id);
    mergeRecord(scripts, p.scripts, "script", p.id);
  }
  pkg.scripts = scripts;
  pkg.dependencies = sortRecord(deps);
  pkg.devDependencies = sortRecord(devDeps);
  out.set("package.json", Buffer.from(JSON.stringify(pkg, null, 2) + "\n"));

  // 3. .env.example (examples only; real values go in .env.local, which is never generated)
  const env = order.flatMap((id) => modules[id].env.map((e) => ({ ...e, module: id })));
  let envText = get(base, ".env.example").toString("utf8");
  for (const id of order) {
    if (!modules[id].env.length) continue;
    envText += `\n# --- ${modules[id].name} ---\n`;
    for (const e of modules[id].env) {
      const tags = [e.required ? "required" : "optional", e.secret ? "SECRET, never commit or expose to the browser" : null].filter(Boolean).join(", ");
      envText += `# ${e.note} (${tags})\n${e.key}=${e.example}\n`;
    }
  }
  out.set(".env.example", Buffer.from(envText));

  // 4. lib/modules.ts or src/modules.ts (drives the home page)
  const navModules = order.map((id) => ({
    id,
    name: modules[id].nav?.label ?? modules[id].name,
    ...(modules[id].nav?.href ? { href: modules[id].nav.href } : {}),
    summary: modules[id].summary,
  }));
  const modulesTs = get(base, modulesFile)
    .toString("utf8")
    .replace(/export const modules: StudioModule\[\] = \[\];/, () => `export const modules: StudioModule[] = ${JSON.stringify(navModules, null, 2)};`);
  out.set(modulesFile, Buffer.from(modulesTs));

  // 5. README.md
  const readme = parts.map((p) => p.content.get("\0readme")!.toString("utf8").trim()).join("\n\n---\n\n");
  out.set("README.md", Buffer.from(readme + "\n"));

  // 6. studio.manifest.json
  const manifest: StudioManifest = {
    scaffoldVersion: version,
    framework,
    modules: order,
    autoAddedModules: autoAdded,
    files: [...owners.keys(), "package.json", ".env.example", "README.md", "studio.manifest.json"].sort(),
    dependencies: pkg.dependencies,
    devDependencies: pkg.devDependencies,
    scripts,
    env: env.map(({ key, required, secret, module }) => ({ key, required, secret, module })),
    prerequisites: parts.flatMap((p) => p.prerequisites),
  };
  out.set("studio.manifest.json", Buffer.from(JSON.stringify(manifest, null, 2) + "\n"));

  const files = [...out].map(([path, data]) => ({ path, data })).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const f of files) {
    if (isForbiddenPath(f.path)) throw new ScaffoldCompositionError(`Refusing to ship ${f.path}`);
  }
  return { files, manifest };
}
