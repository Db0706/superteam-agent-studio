import type { FrameworkId } from "./schema";

/**
 * Compatibility and template catalog.
 *
 * The Next.js, Node.js, Python and Expo entries for gemini, payments, spending
 * and paidapi match the agent-studio-scaffolds repository (scaffold v0.4.0,
 * verified 2026-10-10: install, typecheck, build/compile and offline tests pass,
 * plus HTTP smoke tests of the Node and Python services; Expo apps bundle for
 * Android with no secrets inside, and their companion server is the verified
 * Node template; see its VERIFICATION.md). Those are listed in `verifiedOn`.
 * Wallet is verified on Next.js only (scaffold v0.5.0); Pay.sh has no template. See README → "Integration catalog".
 */

export type CompatStatus = "ok" | "server" | "unverified" | "na";
export type IntegrationId = "gemini" | "payments" | "paysh" | "wallet" | "paidapi" | "spending";
export type Pkg = readonly [name: string, version: string];

export interface EnvVarDef {
  key: string;
  example: string;
  note: string;
}

export interface FrameworkDef {
  id: FrameworkId;
  abbr: string;
  name: string;
  tech: string;
  blurb: string;
  useCase: string;
  envFile: string;
  manager: "npm" | "pip";
  manifest: "package.json" | "requirements.txt";
  baseFiles: string[];
  packages: { base: Pkg[]; dev: Pkg[] };
  scripts: Array<readonly [string, string]>;
}

export interface IntegrationDef {
  id: IntegrationId;
  name: string;
  short: string;
  description: string;
  tech: string;
  /** External service the generated project talks to (shown dashed in the schematic). */
  external: { name: string; description: string } | null;
  compatibility: Record<FrameworkId, CompatStatus>;
  reasons: Partial<Record<FrameworkId, string>>;
  /** Other capabilities this one is designed to work alongside. Advisory only. */
  worksWith: IntegrationId[];
  /** Capabilities this one cannot work without. The scaffold composer adds them automatically. */
  requires: IntegrationId[];
  prerequisites: string[];
  implementationStatus: "provisional" | "verified";
  /** Frameworks where a real scaffold template exists and its build is verified. */
  verifiedOn: FrameworkId[];
  files: Partial<Record<FrameworkId, string[]>>;
  packages: Partial<Record<FrameworkId, Pkg[]>>;
  env: Partial<Record<FrameworkId, EnvVarDef[]>>;
}

export const FW_ORDER: FrameworkId[] = ["next", "expo", "python", "node"];

export const FRAMEWORKS: Record<FrameworkId, FrameworkDef> = {
  next: {
    id: "next",
    abbr: "N",
    name: "Web Application",
    tech: "Next.js",
    blurb: "For websites, dashboards and SaaS products.",
    useCase: "Track 01 · web apps where people pay, or where your server pays for services.",
    envFile: ".env.local",
    manager: "npm",
    manifest: "package.json",
    baseFiles: ["app/layout.tsx", "app/page.tsx", "app/globals.css", "lib/modules.ts", "next.config.ts", "tsconfig.json", "package.json", ".gitignore", ".env.example", "README.md", "studio.manifest.json"],
    packages: {
      // next >=16.2.6 is required by @x402/next 2.28.
      base: [["next", "16.3.8"], ["react", "19.3.0"], ["react-dom", "19.3.0"], ["server-only", "0.0.1"]],
      dev: [["typescript", "5.9.3"], ["@types/node", "22.20.5"], ["@types/react", "19.3.0"], ["@types/react-dom", "19.3.0"]],
    },
    scripts: [["dev", "next dev"], ["build", "next build"], ["start", "next start"], ["typecheck", "tsc --noEmit"]],
  },
  expo: {
    id: "expo",
    abbr: "RN",
    name: "Mobile Application",
    tech: "React Native + Expo",
    blurb: "For Android consumer applications.",
    useCase: "Track 02 · consumer Android apps. Secrets stay in a companion server, never in the app.",
    // The app holds no secrets; its only setting is the optional EXPO_PUBLIC_COMPANION_URL.
    envFile: ".env.local",
    manager: "npm",
    manifest: "package.json",
    baseFiles: [
      "app/_layout.tsx", "app/index.tsx", "components/Screen.tsx", "lib/companion.ts", "lib/modules.ts",
      "app.json", "metro.config.js", "tsconfig.json", "package.json", ".gitignore", ".env.example", "README.md", "studio.manifest.json",
    ],
    // Expo SDK 57: every native module pinned to what the SDK's bundledNativeModules.json expects.
    packages: {
      base: [
        ["expo", "57.0.25"], ["expo-constants", "57.0.19"], ["expo-linking", "57.0.11"], ["expo-router", "57.0.23"], ["expo-status-bar", "57.0.1"],
        ["react", "19.2.3"], ["react-dom", "19.2.3"], ["react-native", "0.86.3"], ["react-native-reanimated", "4.5.1"],
        ["react-native-safe-area-context", "5.7.0"], ["react-native-screens", "4.26.2"], ["react-native-worklets", "0.10.1"],
      ],
      dev: [["typescript", "6.0.3"], ["@types/react", "19.2.18"]],
    },
    scripts: [["start", "expo start"], ["android", "expo start --android"], ["build", "expo export --platform android"], ["typecheck", "tsc --noEmit"]],
  },
  python: {
    id: "python",
    abbr: "Py",
    name: "Autonomous Agent",
    tech: "Python",
    blurb: "For intelligent autonomous software.",
    useCase: "Track 03 · agents that discover, evaluate and pay for services inside a budget.",
    envFile: ".env",
    manager: "pip",
    manifest: "requirements.txt",
    // `python -m agent` is the CLI; `python -m agent serve` runs the FastAPI service on :3000.
    baseFiles: [
      "agent/__init__.py", "agent/__main__.py", "agent/config.py", "agent/plugins.py", "agent/modules.py", "agent/server.py",
      "agent/commands/__init__.py", "agent/routes/__init__.py", "tests/test_agent.py", "pyproject.toml",
      "requirements.txt", "requirements-dev.txt", ".gitignore", ".env.example", "README.md", "studio.manifest.json",
    ],
    packages: { base: [["fastapi", "0.143.0"], ["uvicorn", "0.54.0"], ["python-dotenv", "1.2.4"]], dev: [["pyright[nodejs]", "1.1.414"]] },
    scripts: [
      ["agent", "python -m agent"],
      ["dev", "python -m agent serve --reload"],
      ["start", "python -m agent serve"],
      ["test", "python -m unittest discover -s tests -v"],
      ["typecheck", "pyright"],
    ],
  },
  node: {
    id: "node",
    abbr: "TS",
    name: "Backend Service",
    tech: "Node.js + TypeScript",
    blurb: "For paid APIs, marketplaces and backend systems.",
    useCase: "Track 04 · paid APIs, matching engines and services other agents buy from.",
    envFile: ".env.local",
    manager: "npm",
    manifest: "package.json",
    // src/server.ts loads .env.local (process.loadEnvFile, Node >= 20.12) and every file in src/routes.
    baseFiles: ["src/server.ts", "src/modules.ts", "tsconfig.json", "tsconfig.build.json", "package.json", ".gitignore", ".env.example", "README.md", "studio.manifest.json"],
    packages: {
      // express 5.x satisfies @x402/express 2.28's peer range (^4 || ^5).
      base: [["express", "5.2.1"]],
      dev: [["typescript", "5.9.3"], ["tsx", "4.23.15"], ["@types/node", "22.20.5"], ["@types/express", "5.0.6"]],
    },
    scripts: [["dev", "tsx watch src/server.ts"], ["build", "tsc -p tsconfig.build.json"], ["start", "node dist/server.js"], ["typecheck", "tsc --noEmit"]],
  },
};

/** CAIP-2 id for Solana devnet, as used by x402 V2. Verified against @x402/svm 2.28 and the x402.org facilitator. */
export const SOLANA_DEVNET = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";

const FACILITATOR: EnvVarDef = { key: "X402_FACILITATOR_URL", example: "https://x402.org/facilitator", note: "Free test facilitator, verifies + settles, pays fees" };
const NETWORK: EnvVarDef = { key: "X402_NETWORK", example: SOLANA_DEVNET, note: "Solana devnet only" };
const PAY_TO: EnvVarDef = { key: "PAY_TO_ADDRESS", example: "", note: "Where payments arrive" };
const GEMINI_KEY: EnvVarDef = { key: "GEMINI_API_KEY", example: "", note: "From Google AI Studio" };
const GEMINI_MODEL: EnvVarDef = { key: "GEMINI_MODEL", example: "gemini-flash-latest", note: "Optional model override" };
const AGENT_KEY: EnvVarDef = { key: "AGENT_PRIVATE_KEY", example: "", note: "Devnet-only buyer key. Never commit." };
const RPC: EnvVarDef = { key: "SOLANA_RPC_URL", example: "https://api.devnet.solana.com", note: "Optional devnet RPC" };
const PRICE: EnvVarDef = { key: "PAID_API_PRICE_USD", example: "0.01", note: "Price per request" };
const LIMITS: EnvVarDef[] = [
  { key: "AGENT_BUDGET_USD", example: "1.00", note: "Total allowed spend" },
  { key: "MAX_PAYMENT_USD", example: "0.10", note: "Largest single payment" },
];
const PAYSH_KEY: EnvVarDef = { key: "PAYSH_API_KEY", example: "", note: "Placeholder, confirm in docs" };

export const INTEGRATIONS: IntegrationDef[] = [
  {
    id: "gemini",
    name: "Gemini AI",
    short: "Gemini",
    description: "Add intelligence, reasoning and tool calling to your application.",
    tech: "Google Gemini API · official SDK · function calling",
    external: { name: "Gemini API", description: "Free API key from Google AI Studio." },
    compatibility: { next: "ok", expo: "server", python: "ok", node: "ok" },
    reasons: { expo: "Adds a companion server (the Node.js template) so your Gemini key never ships inside the app." },
    worksWith: [],
    requires: [],
    prerequisites: ["Google account", "Gemini API key (free tier), added to .env yourself, never typed into this site"],
    implementationStatus: "provisional",
    verifiedOn: ["next", "node", "python", "expo"],
    files: {
      next: ["lib/ai/gemini.ts", "app/api/chat/route.ts", "app/chat/page.tsx"],
      expo: ["lib/ai/client.ts", "app/chat.tsx"],
      python: ["agent/ai/__init__.py", "agent/ai/gemini.py", "agent/routes/chat.py", "agent/commands/ask.py"],
      node: ["src/lib/ai/gemini.ts", "src/routes/chat.ts"],
    },
    packages: { next: [["@google/genai", "2.28.0"]], node: [["@google/genai", "2.28.0"]], python: [["google-genai", "2.29.0"]] },
    env: { next: [GEMINI_KEY, GEMINI_MODEL], expo: [GEMINI_KEY, GEMINI_MODEL], python: [GEMINI_KEY, GEMINI_MODEL], node: [GEMINI_KEY, GEMINI_MODEL] },
  },
  {
    id: "payments",
    name: "Internet-Native Payments",
    short: "Payments",
    description: "Charge for, or pay for, digital services in a single web request.",
    tech: "x402 V2 · HTTP 402 + PAYMENT-* headers · USDC on Solana devnet",
    external: { name: "x402 facilitator", description: "Hosted service that verifies and settles payments. Uses Solana devnet while you build." },
    compatibility: { next: "ok", expo: "server", python: "ok", node: "ok" },
    reasons: { expo: "Adds a companion server (the Node.js template) that charges and pays; the app only reads prices." },
    worksWith: ["spending"],
    requires: [],
    prerequisites: [
      "Solana devnet address for receiving test payments. It needs a devnet USDC account: send it faucet USDC once",
      "Devnet test USDC from faucet.circle.com, no real money. No SOL needed: the facilitator pays fees",
    ],
    implementationStatus: "provisional",
    verifiedOn: ["next", "node", "python", "expo"],
    files: {
      next: ["lib/payments/config.ts", "lib/payments/server.ts", "lib/payments/client.ts", "scripts/keygen.ts", "scripts/wallets.ts"],
      expo: ["lib/payments/client.ts"],
      python: [
        "agent/payments/__init__.py", "agent/payments/config.py", "agent/payments/server.py", "agent/payments/client.py",
        "agent/commands/keygen.py", "agent/commands/wallets.py",
      ],
      node: ["src/lib/payments/config.ts", "src/lib/payments/server.ts", "src/lib/payments/client.ts", "scripts/keygen.ts", "scripts/wallets.ts"],
    },
    packages: {
      // @solana/kit must stay on 5.x: @x402/svm's @solana-program/* deps peer-require kit ^5.
      next: [["@x402/core", "2.28.0"], ["@x402/next", "2.28.0"], ["@x402/fetch", "2.28.0"], ["@x402/svm", "2.28.0"], ["@solana/kit", "5.5.1"]],
      node: [["@x402/core", "2.28.0"], ["@x402/express", "2.28.0"], ["@x402/fetch", "2.28.0"], ["@x402/svm", "2.28.0"], ["@solana/kit", "5.5.1"]],
      // solana 0.39 needs Python >= 3.11 and solders 0.28+ conflicts with solana 0.38, so both stay pinned.
      python: [["x402[httpx,svm]", "2.25.0"], ["solana", "0.38.0"], ["solders", "0.27.1"], ["httpx", "0.28.1"]],
    },
    env: {
      next: [FACILITATOR, NETWORK, PAY_TO, AGENT_KEY, RPC],
      expo: [FACILITATOR, NETWORK, PAY_TO, AGENT_KEY, RPC],
      node: [FACILITATOR, NETWORK, PAY_TO, AGENT_KEY, RPC],
      python: [FACILITATOR, NETWORK, PAY_TO, AGENT_KEY, RPC],
    },
  },
  {
    id: "paysh",
    name: "Pay.sh",
    short: "Pay.sh",
    description: "Connect supported payment tooling and services.",
    tech: "Pay.sh client · package name to be confirmed (no \"pay.sh\" package on npm)",
    external: { name: "Pay.sh", description: "Account and key. Setup to be confirmed." },
    compatibility: { next: "unverified", expo: "unverified", python: "unverified", node: "ok" },
    reasons: {
      next: "Not yet tested with Next.js.",
      expo: "Not yet tested on Android.",
      python: "No verified Python client yet.",
    },
    worksWith: ["payments"],
    requires: [],
    prerequisites: ["Pay.sh account (setup to be confirmed)"],
    implementationStatus: "provisional",
    verifiedOn: [],
    files: {
      next: ["lib/payments/paysh.ts"],
      expo: ["lib/payments/paysh.ts"],
      python: ["agent/integrations/paysh.py"],
      node: ["src/integrations/paysh.ts"],
    },
    packages: { next: [["pay.sh", "TBC"]], expo: [["pay.sh", "TBC"]], node: [["pay.sh", "TBC"]], python: [["pay.sh", "TBC"]] },
    env: { next: [PAYSH_KEY], expo: [PAYSH_KEY], python: [PAYSH_KEY], node: [PAYSH_KEY] },
  },
  {
    id: "wallet",
    name: "Wallet Connection",
    short: "Wallet",
    description: "Let people pay your paid API from their own Solana wallet, approving each payment.",
    // Official packages do the wallet work: @solana/react (released with @solana/kit 5.5.1, which
    // x402 needs) + Wallet Standard. Its Kit signer plugs straight into x402's ExactSvmScheme.
    tech: "@solana/react + Wallet Standard (Phantom, Solflare, Backpack, …) · x402 from the browser",
    external: { name: "User’s wallet app", description: "Visitors approve each payment in a Solana wallet they already have." },
    compatibility: { next: "ok", expo: "unverified", python: "na", node: "na" },
    reasons: {
      expo: "No template yet: Mobile Wallet Adapter needs a native development build, not Expo Go.",
      python: "Agents pay with their own key, guarded by Spending Controls.",
      node: "Services receive payments. Set a payout address instead.",
    },
    worksWith: ["payments", "paidapi"],
    requires: ["paidapi"],
    prerequisites: ["A Solana browser wallet (Phantom, Solflare, Backpack, …) on devnet, with devnet USDC from faucet.circle.com"],
    implementationStatus: "provisional",
    verifiedOn: ["next"],
    files: {
      next: ["components/wallet/WalletProvider.tsx", "components/wallet/ConnectWallet.tsx", "components/wallet/PayWithWallet.tsx", "app/wallet/page.tsx"],
    },
    packages: {
      next: [["@solana/react", "5.5.1"], ["@wallet-standard/react", "1.0.3"]],
    },
    env: {
      next: [{ key: "NEXT_PUBLIC_SOLANA_RPC_URL", example: "https://api.devnet.solana.com", note: "Devnet RPC for the browser. Public, never a key" }],
    },
  },
  {
    id: "paidapi",
    name: "Paid API Example",
    short: "Paid API",
    description: "Start from a working example of selling or buying paid information.",
    tech: "Endpoint priced per request + a client that pays for it",
    external: null,
    compatibility: { next: "ok", expo: "server", python: "ok", node: "ok" },
    reasons: { expo: "The example paid API runs in the companion server." },
    worksWith: ["payments", "spending"],
    requires: ["payments", "spending"],
    prerequisites: [],
    implementationStatus: "provisional",
    verifiedOn: ["next", "node", "python", "expo"],
    files: {
      next: ["app/api/premium/route.ts", "app/api/buy/route.ts", "app/premium/page.tsx", "lib/paidapi/buyer.ts", "scripts/pay.ts"],
      expo: ["lib/paidapi/client.ts", "app/premium.tsx"],
      python: ["agent/paidapi/__init__.py", "agent/paidapi/buyer.py", "agent/routes/premium_data.py", "agent/routes/buy.py", "agent/commands/buy.py"],
      node: ["src/routes/premium-data.ts", "src/routes/buy.ts", "src/lib/paidapi/buyer.ts", "examples/client.ts"],
    },
    packages: {},
    env: { next: [PRICE], expo: [PRICE], python: [PRICE], node: [PRICE] },
  },
  {
    id: "spending",
    name: "Spending Controls",
    short: "Limits",
    description: "Set budgets and per-payment limits for autonomous payments.",
    tech: "Total budget · per-payment cap · devnet-USDC-only asset allow-list, checked before paying",
    external: null,
    compatibility: { next: "ok", expo: "server", python: "ok", node: "ok" },
    reasons: { expo: "Limits run in the companion server, next to the key they protect." },
    worksWith: ["payments"],
    requires: ["payments"],
    prerequisites: [],
    implementationStatus: "provisional",
    verifiedOn: ["next", "node", "python", "expo"],
    files: {
      next: ["lib/spending/policy.ts", "lib/spending/tracker.ts", "lib/spending/attach.ts", "scripts/test-spending.ts", "scripts/test-spending-x402.ts"],
      expo: [],
      python: [
        "agent/spending/__init__.py", "agent/spending/policy.py", "agent/spending/tracker.py", "agent/spending/attach.py",
        "tests/test_spending.py", "tests/test_spending_x402.py",
      ],
      node: ["src/lib/spending/policy.ts", "src/lib/spending/tracker.ts", "src/lib/spending/attach.ts", "scripts/test-spending.ts", "scripts/test-spending-x402.ts"],
    },
    packages: {},
    env: { next: LIMITS, expo: LIMITS, python: LIMITS, node: LIMITS },
  },
];

export const INTEGRATION_MAP: Record<IntegrationId, IntegrationDef> = Object.fromEntries(
  INTEGRATIONS.map((i) => [i.id, i]),
) as Record<IntegrationId, IntegrationDef>;

export const INTEGRATION_IDS = INTEGRATIONS.map((i) => i.id);

export const STATUS_META: Record<CompatStatus, { label: string; code: string }> = {
  ok: { label: "Ready", code: "RDY" },
  server: { label: "Adds companion server", code: "+SRV" },
  unverified: { label: "Unverified", code: "UNV" },
  na: { label: "Not available", code: "N/A" },
};

/** Folder an Expo app's companion server (composed from the Node.js template) is generated into. */
export const COMPANION_DIR = "companion-server";

export function statusOf(id: IntegrationId, fw: FrameworkId): CompatStatus {
  return INTEGRATION_MAP[id]?.compatibility[fw] ?? "na";
}

export function isIntegrationId(x: string): x is IntegrationId {
  return (INTEGRATION_IDS as string[]).includes(x);
}

/** `id` plus everything it requires, transitively, in dependency order. */
function withRequirements(id: IntegrationId, seen: IntegrationId[] = []): IntegrationId[] {
  if (seen.includes(id)) return seen;
  for (const r of INTEGRATION_MAP[id].requires) withRequirements(r, seen);
  seen.push(id);
  return seen;
}

/**
 * Makes a selection consistent for a framework: drops N/A capabilities and any
 * capability whose requirements are N/A, then switches on missing requirements.
 * Keeps the order of the input, with added requirements appended.
 */
export function normalizeIntegrations(ids: IntegrationId[], fw: FrameworkId): IntegrationId[] {
  const usable = ids.filter((id) => withRequirements(id).every((r) => statusOf(r, fw) !== "na"));
  const out = [...usable];
  for (const id of usable) for (const r of withRequirements(id)) if (!out.includes(r)) out.push(r);
  return out;
}

/** Selected capabilities that (transitively) require `id`, so must go when it is switched off. */
export function dependentsOf(id: IntegrationId, selected: IntegrationId[]): IntegrationId[] {
  return selected.filter((s) => s !== id && withRequirements(s).includes(id));
}
