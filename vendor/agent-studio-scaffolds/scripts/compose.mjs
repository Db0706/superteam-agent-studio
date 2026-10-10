#!/usr/bin/env node
// Composes a runnable project from a base template plus modules.
//
//   node scripts/compose.mjs --framework next --modules gemini,payments,spending,paidapi --out out/my-app
//   node scripts/compose.mjs --framework node --modules paidapi --out out/my-service
//   node scripts/compose.mjs --list            # print the catalog (all templates + modules) as JSON
//
// No dependencies: this is the piece the Agent Studio generator will call (or port).

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FRAMEWORK_DIRS = { next: "templates/nextjs", node: "templates/node" };
const SCAFFOLD_VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

export function loadFramework(framework) {
  const dir = FRAMEWORK_DIRS[framework];
  if (!dir) throw new Error(`Unknown framework "${framework}". Known: ${Object.keys(FRAMEWORK_DIRS).join(", ")}`);
  const base = { ...readJson(join(ROOT, dir, "base/manifest.json")), dir: join(ROOT, dir, "base") };
  const modulesDir = join(ROOT, dir, "modules");
  const modules = Object.fromEntries(
    readdirSync(modulesDir).map((id) => {
      const m = readJson(join(modulesDir, id, "manifest.json"));
      if (m.id !== id) throw new Error(`modules/${id}/manifest.json has id "${m.id}"`);
      return [id, { ...m, dir: join(modulesDir, id) }];
    }),
  );
  return { base, modules };
}

/** Adds required modules and returns them in dependency order. */
export function resolveModules(modules, requested) {
  const order = [];
  const autoAdded = [];
  const visit = (id, chain) => {
    const m = modules[id];
    if (!m) throw new Error(`Unknown module "${id}". Known: ${Object.keys(modules).join(", ")}`);
    if (chain.includes(id)) throw new Error(`Module dependency cycle: ${[...chain, id].join(" -> ")}`);
    if (order.includes(id)) return;
    for (const dep of m.requires) visit(dep, [...chain, id]);
    if (!requested.includes(id)) autoAdded.push(id);
    order.push(id);
  };
  for (const id of requested) visit(id, []);
  return { order, autoAdded };
}

function mergeRecord(target, source, what, owner) {
  for (const [k, v] of Object.entries(source ?? {})) {
    if (k in target && target[k] !== v) {
      throw new Error(`${owner} wants ${what} ${k}@${v} but ${k}@${target[k]} is already selected`);
    }
    target[k] = v;
  }
}

const sortRecord = (r) => Object.fromEntries(Object.entries(r).sort(([a], [b]) => a.localeCompare(b)));

export function compose({ framework, modules: requested, out, name = "superteam-agent-app" }) {
  const { base, modules } = loadFramework(framework);
  const { order, autoAdded } = resolveModules(modules, requested);
  const parts = [base, ...order.map((id) => modules[id])];
  const outDir = resolve(out);
  // The generated module list (drives the home page / GET /). Its path differs per framework.
  const modulesFile = base.modulesFile ?? "lib/modules.ts";

  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  // 1. Files. Base files are copied first; modules may only add new files.
  const owners = new Map();
  for (const file of base.files) {
    if (base.generatedFiles.includes(file) && file !== modulesFile) continue;
    mkdirSync(dirname(join(outDir, file)), { recursive: true });
    cpSync(join(base.dir, file), join(outDir, file));
    owners.set(file, "base");
  }
  for (const id of order) {
    for (const file of modules[id].files) {
      if (owners.has(file)) throw new Error(`File conflict: ${file} is provided by both ${owners.get(file)} and ${id}`);
      const src = join(modules[id].dir, "files", file);
      if (!existsSync(src)) throw new Error(`modules/${id} lists ${file} but files/${file} does not exist`);
      mkdirSync(dirname(join(outDir, file)), { recursive: true });
      cpSync(src, join(outDir, file));
      owners.set(file, id);
    }
  }

  // 2. package.json
  const pkg = readJson(join(base.dir, "package.json"));
  pkg.name = name;
  const deps = {}, devDeps = {}, scripts = {};
  for (const p of parts) {
    const owner = p.id;
    mergeRecord(deps, p.dependencies, "dependency", owner);
    mergeRecord(devDeps, p.devDependencies, "devDependency", owner);
    mergeRecord(scripts, p.scripts, "script", owner);
  }
  pkg.scripts = scripts;
  pkg.dependencies = sortRecord(deps);
  pkg.devDependencies = sortRecord(devDeps);
  writeFileSync(join(outDir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

  // 3. .env.example
  const env = order.flatMap((id) => modules[id].env.map((e) => ({ ...e, module: id })));
  let envText = readFileSync(join(base.dir, ".env.example"), "utf8");
  for (const id of order) {
    if (!modules[id].env.length) continue;
    envText += `\n# --- ${modules[id].name} ---\n`;
    for (const e of modules[id].env) {
      const tags = [e.required ? "required" : "optional", e.secret ? "SECRET, never commit or expose to the browser" : null]
        .filter(Boolean)
        .join(", ");
      envText += `# ${e.note} (${tags})\n${e.key}=${e.example}\n`;
    }
  }
  writeFileSync(join(outDir, ".env.example"), envText);

  // 4. lib/modules.ts or src/modules.ts (drives the home page)
  const navModules = order.map((id) => ({
    id,
    name: modules[id].nav?.label ?? modules[id].name,
    ...(modules[id].nav?.href ? { href: modules[id].nav.href } : {}),
    summary: modules[id].summary,
  }));
  const modulesTs = readFileSync(join(base.dir, modulesFile), "utf8").replace(
    /export const modules: StudioModule\[\] = \[\];/,
    `export const modules: StudioModule[] = ${JSON.stringify(navModules, null, 2)};`,
  );
  writeFileSync(join(outDir, modulesFile), modulesTs);

  // 5. README.md
  const readme = parts
    .map((p) => readFileSync(join(p.dir, p.readme), "utf8").trim())
    .join("\n\n---\n\n");
  writeFileSync(join(outDir, "README.md"), readme + "\n");

  // 6. studio.manifest.json: what was generated, for the Agent Studio UI.
  const manifest = {
    scaffoldVersion: SCAFFOLD_VERSION,
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
  writeFileSync(join(outDir, "studio.manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

export function catalog() {
  return Object.keys(FRAMEWORK_DIRS).map((framework) => {
    const { base, modules } = loadFramework(framework);
    const strip = ({ dir, ...rest }) => rest;
    return { framework, base: strip(base), modules: Object.values(modules).map(strip) };
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      framework: { type: "string", default: "next" },
      modules: { type: "string", default: "" },
      out: { type: "string" },
      name: { type: "string" },
      list: { type: "boolean", default: false },
    },
  });
  try {
    if (values.list) {
      console.log(JSON.stringify(catalog(), null, 2));
    } else {
      if (!values.out) throw new Error("--out <dir> is required");
      const requested = values.modules.split(",").map((s) => s.trim()).filter(Boolean);
      const m = compose({ framework: values.framework, modules: requested, out: values.out, name: values.name });
      if (m.autoAddedModules.length) console.log(`Also added required modules: ${m.autoAddedModules.join(", ")}`);
      console.log(`Composed ${values.framework} + [${m.modules.join(", ")}] into ${relative(process.cwd(), resolve(values.out)) || "."}`);
    }
  } catch (err) {
    console.error(`compose: ${err.message}`);
    process.exit(1);
  }
}
