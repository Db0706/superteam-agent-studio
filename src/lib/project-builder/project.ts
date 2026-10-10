import {
  COMPANION_DIR,
  FRAMEWORKS,
  INTEGRATIONS,
  INTEGRATION_MAP,
  statusOf,
  type CompatStatus,
  type IntegrationId,
} from "@/config/integrations";
import type { FrameworkId } from "@/config/schema";

/** Pure derivations for the Project Builder. Ported 1:1 from the design's builder-data.js. */

export const NAME_MAX = 40;

export interface NameValidation {
  id: string;
  error: string | null;
  /** True when the slug differs from what was typed (shown as "Formatted as …"). */
  formatted: boolean;
}

export function slugify(raw: string): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function validateName(raw: string): NameValidation {
  const text = String(raw ?? "");
  const slug = slugify(text);
  let error: string | null = null;
  if (!text.trim()) error = "Give your project a name to continue.";
  else if (slug.length < 3) error = "Use at least 3 letters or numbers.";
  else if (slug.length > NAME_MAX) error = "Keep it under 40 characters.";
  else if (!/^[a-z]/.test(slug)) error = "Start with a letter.";
  return { id: slug, error, formatted: !error && slug !== text.trim() };
}

export type FileTag = IntegrationId | "companion" | null;

export interface ProjectFile {
  path: string;
  tag: FileTag;
}

export interface TreeRow {
  path: string;
  depth: number;
  prefix: string;
  name: string;
  dir: boolean;
  tag: FileTag;
}

export interface Dependency {
  name: string;
  version: string;
  tag: IntegrationId | null;
  dev: boolean;
  /** Package name or version still to be confirmed. */
  tbc: boolean;
}

export interface EnvVar {
  key: string;
  example: string;
  note: string;
  tag: IntegrationId;
  file: string;
}

export interface Companion {
  kind: "included" | "external";
  name: string;
  description: string;
  tag: IntegrationId | "companion";
}

export interface SetupCommand {
  cmd: string;
  note: string;
}

export interface PerIntegration {
  id: IntegrationId;
  files: number;
  packages: number;
  env: number;
  status: CompatStatus;
}

export interface DerivedProject {
  id: string;
  framework: FrameworkId;
  /** Selected integrations that are available for this framework. */
  valid: IntegrationId[];
  needsCompanion: boolean;
  files: ProjectFile[];
  tree: TreeRow[];
  deps: Dependency[];
  env: EnvVar[];
  companions: Companion[];
  setup: SetupCommand[];
  manifest: "package.json" | "requirements.txt";
  stats: { files: number; packages: number; env: number };
  perIntegration: PerIntegration[];
  base: { files: number; packages: number };
}

export function buildTree(files: ProjectFile[]): TreeRow[] {
  interface Node {
    name: string;
    dir: boolean;
    children: Map<string, Node>;
    tag: FileTag;
    tags: Set<string>;
  }
  const root: Node = { name: "", dir: true, children: new Map(), tag: null, tags: new Set() };
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, dir: !isFile, children: new Map(), tag: isFile ? f.tag : null, tags: new Set() });
      }
      const child = node.children.get(part)!;
      if (!isFile) child.tags.add(f.tag ?? "base");
      node = child;
    });
  }
  const rows: TreeRow[] = [];
  const walk = (node: Node, prefix: string, base: string) => {
    const kids = [...node.children.values()].sort((a, b) =>
      a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1,
    );
    kids.forEach((k, i) => {
      const last = i === kids.length - 1;
      const only = k.dir && k.tags.size === 1 ? [...k.tags][0] : null;
      const path = base ? `${base}/${k.name}` : k.name;
      rows.push({
        path,
        depth: prefix.length / 3,
        prefix: prefix + (last ? "└─ " : "├─ "),
        name: k.dir ? `${k.name}/` : k.name,
        dir: k.dir,
        tag: k.dir ? (only && only !== "base" ? (only as FileTag) : null) : k.tag,
      });
      if (k.dir) walk(k, prefix + (last ? "   " : "│  "), path);
    });
  };
  walk(root, "", "");
  return rows;
}

export function deriveProject({ id, framework, integrations }: { id: string; framework: FrameworkId; integrations: IntegrationId[] }): DerivedProject {
  const fw = FRAMEWORKS[framework];
  // Keep catalog order so output is stable regardless of click order.
  const valid = INTEGRATIONS.map((i) => i.id).filter((i) => integrations.includes(i) && statusOf(i, framework) !== "na");
  const needsCompanion = framework === "expo" && valid.some((i) => statusOf(i, framework) === "server");

  const files: ProjectFile[] = fw.baseFiles.map((path) => ({ path, tag: null }));
  if (needsCompanion) {
    // The companion is the Node.js template with the same capabilities, nested in companion-server/.
    const serverSide = valid.filter((i) => statusOf(i, framework) === "server");
    const companionFiles = [...FRAMEWORKS.node.baseFiles, ...serverSide.flatMap((i) => INTEGRATION_MAP[i].files.node ?? [])];
    companionFiles.forEach((path) => files.push({ path: `${COMPANION_DIR}/${path}`, tag: "companion" }));
  }
  valid.forEach((i) =>
    (INTEGRATION_MAP[i].files[framework] ?? []).forEach((path) => {
      if (!files.some((f) => f.path === path)) files.push({ path, tag: i });
    }),
  );

  const seen = new Set<string>();
  const deps: Dependency[] = [];
  const add = (list: readonly (readonly [string, string])[] | undefined, tag: IntegrationId | null, dev: boolean) =>
    (list ?? []).forEach(([name, version]) => {
      if (seen.has(name)) return;
      seen.add(name);
      deps.push({ name, version, tag, dev, tbc: version === "TBC" });
    });
  add(fw.packages.base, null, false);
  valid.forEach((i) => add(INTEGRATION_MAP[i].packages[framework], i, false));
  add(fw.packages.dev, null, true);

  const env: EnvVar[] = [];
  const seenEnv = new Set<string>();
  valid.forEach((i) =>
    (INTEGRATION_MAP[i].env[framework] ?? []).forEach(({ key, example, note }) => {
      if (seenEnv.has(key)) return;
      seenEnv.add(key);
      // Secrets for +SRV capabilities live in the companion server, never the Android bundle.
      const onServer = framework === "expo" && statusOf(i, framework) === "server" && !key.startsWith("EXPO_PUBLIC");
      env.push({ key, example, note, tag: i, file: onServer ? `${COMPANION_DIR}/.env.example` : ".env.example" });
    }),
  );

  const companions: Companion[] = [];
  if (needsCompanion) {
    companions.push({
      kind: "included",
      name: "companion-server/",
      description: "Small Node.js + TypeScript server for keys and payment checks. Included in the download.",
      tag: "companion",
    });
  }
  const extSeen = new Set<string>();
  valid.forEach((i) => {
    const ext = INTEGRATION_MAP[i].external;
    if (ext && !extSeen.has(ext.name)) {
      extSeen.add(ext.name);
      companions.push({ kind: "external", name: ext.name, description: ext.description, tag: i });
    }
  });

  const setup: SetupCommand[] =
    framework === "python"
      ? [
          { cmd: `cd ${id}`, note: "" },
          { cmd: "python3 -m venv .venv && source .venv/bin/activate", note: "" },
          { cmd: "pip install -r requirements.txt", note: "" },
          { cmd: "cp .env.example .env", note: "add your keys" },
          { cmd: "python -m agent", note: "lists commands" },
          { cmd: "python -m agent serve --reload", note: "localhost:3000" },
        ]
      : framework === "expo"
        ? [
            { cmd: `cd ${id}`, note: "" },
            { cmd: "npm install", note: "" },
            ...(needsCompanion
              ? [
                  { cmd: "npm run companion:install", note: "once" },
                  { cmd: `cp ${COMPANION_DIR}/.env.example ${COMPANION_DIR}/.env.local`, note: "add your keys" },
                  { cmd: "npm run companion", note: "second terminal" },
                ]
              : []),
            { cmd: "npm start", note: "scan the QR code in Expo Go" },
          ]
        : [
            { cmd: `cd ${id}`, note: "" },
            { cmd: `cp .env.example ${fw.envFile}`, note: "add your keys" },
            { cmd: "npm install", note: "" },
            { cmd: "npm run dev", note: "localhost:3000" },
          ];

  return {
    id,
    framework,
    valid,
    needsCompanion,
    files,
    tree: buildTree(files),
    deps,
    env,
    companions,
    setup,
    manifest: fw.manifest,
    stats: { files: files.length, packages: deps.length, env: env.length },
    perIntegration: valid.map((i) => ({
      id: i,
      files: files.filter((f) => f.tag === i).length,
      packages: deps.filter((d) => d.tag === i).length,
      env: env.filter((e) => e.tag === i).length,
      status: statusOf(i, framework),
    })),
    base: { files: files.filter((f) => !f.tag).length, packages: deps.filter((d) => !d.tag).length },
  };
}
