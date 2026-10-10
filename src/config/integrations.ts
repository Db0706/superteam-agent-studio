import type { FrameworkId } from "./schema";

/**
 * PROVISIONAL compatibility and template catalog.
 *
 * Ported from the design's `builder-data.js`. Nothing here has been validated
 * against the real scaffold repository yet. Package names and versions, the
 * Pay.sh client, and x402 header and network ids are all illustrative. Every
 * combination stays labelled UNV (or provisional) until the scaffold
 * repository's CI proves it works. See README → "Integration catalog".
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
  prerequisites: string[];
  implementationStatus: "provisional" | "verified";
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
    baseFiles: ["app/layout.tsx", "app/page.tsx", "app/globals.css", "components/ui/Button.tsx", "next.config.ts", "tsconfig.json", "package.json", ".env.example", "README.md"],
    packages: {
      base: [["next", "^15.1.0"], ["react", "^19.0.0"], ["react-dom", "^19.0.0"]],
      dev: [["typescript", "^5.6.0"], ["@types/react", "^19.0.0"]],
    },
    scripts: [["dev", "next dev"], ["build", "next build"]],
  },
  expo: {
    id: "expo",
    abbr: "RN",
    name: "Mobile Application",
    tech: "React Native + Expo",
    blurb: "For Android consumer applications.",
    useCase: "Track 02 · consumer Android apps. Secrets stay in a companion server, never in the app.",
    envFile: ".env",
    manager: "npm",
    manifest: "package.json",
    baseFiles: ["app/_layout.tsx", "app/index.tsx", "components/Screen.tsx", "app.json", "tsconfig.json", "package.json", ".env.example", "README.md"],
    packages: {
      base: [["expo", "~52.0.0"], ["expo-router", "~4.0.0"], ["react", "18.3.1"], ["react-native", "0.76.0"]],
      dev: [["typescript", "^5.6.0"]],
    },
    scripts: [["start", "expo start"], ["android", "expo run:android"]],
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
    baseFiles: ["agent/__init__.py", "agent/__main__.py", "agent/config.py", "tests/test_agent.py", "pyproject.toml", "requirements.txt", ".env.example", "README.md"],
    packages: { base: [["httpx", "0.27"], ["pydantic", "2.9"], ["python-dotenv", "1.0"]], dev: [] },
    scripts: [],
  },
  node: {
    id: "node",
    abbr: "TS",
    name: "Backend Service",
    tech: "Node.js + TypeScript",
    blurb: "For paid APIs, marketplaces and backend systems.",
    useCase: "Track 04 · paid APIs, matching engines and services other agents buy from.",
    envFile: ".env",
    manager: "npm",
    manifest: "package.json",
    baseFiles: ["src/server.ts", "src/config.ts", "src/routes/health.ts", "tsconfig.json", "package.json", ".env.example", "README.md"],
    packages: {
      base: [["express", "^4.21.0"], ["dotenv", "^16.4.0"], ["zod", "^3.23.0"]],
      dev: [["tsx", "^4.19.0"], ["typescript", "^5.6.0"]],
    },
    scripts: [["dev", "tsx watch src/server.ts"], ["build", "tsc"]],
  },
};

/** CAIP-2 id for Solana devnet. Illustrative; confirm against the x402 V2 spec before launch. */
export const SOLANA_DEVNET = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";

const FACILITATOR: EnvVarDef = { key: "X402_FACILITATOR_URL", example: "https://facilitator.example", note: "Verifies + settles payments" };
const NETWORK: EnvVarDef = { key: "SOLANA_NETWORK", example: SOLANA_DEVNET, note: "Solana devnet" };
const PAY_TO: EnvVarDef = { key: "PAY_TO_ADDRESS", example: "", note: "Where payments arrive" };
const GEMINI_KEY: EnvVarDef = { key: "GEMINI_API_KEY", example: "", note: "From Google AI Studio" };
const PRICE: EnvVarDef = { key: "PAID_API_PRICE_USD", example: "0.01", note: "Price per request" };
const LIMITS: EnvVarDef[] = [
  { key: "AGENT_BUDGET_USD", example: "1.00", note: "Total allowed spend" },
  { key: "MAX_PAYMENT_USD", example: "0.25", note: "Largest single payment" },
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
    reasons: { expo: "Adds a small server so your Gemini key never ships inside the app." },
    worksWith: [],
    prerequisites: ["Google account", "Gemini API key (free tier), added to .env yourself, never typed into this site"],
    implementationStatus: "provisional",
    files: {
      next: ["lib/ai/gemini.ts", "app/api/chat/route.ts"],
      expo: ["lib/ai/client.ts", "companion-server/src/routes/ai.ts"],
      python: ["agent/integrations/gemini.py"],
      node: ["src/integrations/gemini.ts", "src/routes/ai.ts"],
    },
    packages: { next: [["@google/genai", "^1.0.0"]], node: [["@google/genai", "^1.0.0"]], python: [["google-genai", "1.0"]] },
    env: { next: [GEMINI_KEY], expo: [GEMINI_KEY], python: [GEMINI_KEY], node: [GEMINI_KEY] },
  },
  {
    id: "payments",
    name: "Internet-Native Payments",
    short: "Payments",
    description: "Charge for, or pay for, digital services in a single web request.",
    tech: "x402 V2 · HTTP 402 + PAYMENT-* headers · USDC on Solana devnet",
    external: { name: "x402 facilitator", description: "Hosted service that verifies and settles payments. Uses Solana devnet while you build." },
    compatibility: { next: "ok", expo: "server", python: "ok", node: "ok" },
    reasons: { expo: "Adds a companion server that confirms payments for the app." },
    worksWith: ["spending"],
    prerequisites: ["Solana devnet address for receiving test payments", "Devnet test USDC, no real money"],
    implementationStatus: "provisional",
    files: {
      next: ["lib/payments/x402.ts", "middleware.ts"],
      expo: ["lib/payments/client.ts", "companion-server/src/routes/pay.ts"],
      python: ["agent/integrations/payments.py"],
      node: ["src/integrations/payments.ts", "src/middleware/paywall.ts"],
    },
    packages: {
      next: [["@x402/next", "^2.0.0"], ["@x402/fetch", "^2.0.0"], ["@x402/svm", "^2.0.0"]],
      expo: [["@x402/fetch", "^2.0.0"]],
      node: [["@x402/express", "^2.0.0"], ["@x402/svm", "^2.0.0"]],
      python: [["x402", "2.0"]],
    },
    env: {
      next: [FACILITATOR, NETWORK, PAY_TO],
      expo: [FACILITATOR, NETWORK, PAY_TO],
      node: [FACILITATOR, NETWORK, PAY_TO],
      python: [FACILITATOR, NETWORK, { key: "AGENT_SIGNER_KEY", example: "", note: "Devnet only. Never commit." }],
    },
  },
  {
    id: "paysh",
    name: "Pay.sh",
    short: "Pay.sh",
    description: "Connect supported payment tooling and services.",
    tech: "Pay.sh client · package name to be confirmed",
    external: { name: "Pay.sh", description: "Account and key. Setup to be confirmed." },
    compatibility: { next: "unverified", expo: "unverified", python: "unverified", node: "ok" },
    reasons: {
      next: "Not yet tested with Next.js.",
      expo: "Not yet tested on Android.",
      python: "No verified Python client yet.",
    },
    worksWith: ["payments"],
    prerequisites: ["Pay.sh account (setup to be confirmed)"],
    implementationStatus: "provisional",
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
    description: "Let people approve payments from a supported Solana wallet.",
    tech: "Wallet Standard (web) · Mobile Wallet Adapter (Android)",
    external: { name: "User’s wallet app", description: "Users approve payments in a wallet app they already have." },
    compatibility: { next: "ok", expo: "ok", python: "na", node: "na" },
    reasons: {
      python: "Agents pay with their own key, guarded by Spending Controls.",
      node: "Services receive payments. Set a payout address instead.",
    },
    worksWith: ["payments"],
    prerequisites: ["A Solana wallet app set to devnet, for testing"],
    implementationStatus: "provisional",
    files: {
      next: ["components/wallet/WalletProvider.tsx", "components/wallet/ConnectButton.tsx"],
      expo: ["lib/wallet/mobileWallet.ts", "components/ConnectWallet.tsx"],
    },
    packages: {
      next: [["@solana/wallet-adapter-react", "^0.15.0"], ["@solana/web3.js", "^1.95.0"]],
      expo: [["@solana-mobile/mobile-wallet-adapter-protocol-web3js", "^2.1.0"], ["@solana/web3.js", "^1.95.0"]],
    },
    env: {
      next: [{ key: "NEXT_PUBLIC_SOLANA_RPC_URL", example: "https://api.devnet.solana.com", note: "" }],
      expo: [{ key: "EXPO_PUBLIC_SOLANA_RPC_URL", example: "https://api.devnet.solana.com", note: "" }],
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
    worksWith: ["payments"],
    prerequisites: [],
    implementationStatus: "provisional",
    files: {
      next: ["app/api/premium-data/route.ts", "app/premium/page.tsx"],
      expo: ["app/premium.tsx", "companion-server/src/routes/premium-data.ts"],
      python: ["examples/paid_service.py", "agent/tasks/buy_data.py"],
      node: ["src/routes/premium-data.ts", "examples/client.ts"],
    },
    packages: { node: [["@x402/fetch", "^2.0.0"]], python: [["fastapi", "0.115"], ["uvicorn", "0.32"]] },
    env: { next: [PRICE], expo: [PRICE], python: [PRICE], node: [PRICE] },
  },
  {
    id: "spending",
    name: "Spending Controls",
    short: "Limits",
    description: "Set budgets and per-payment limits for autonomous payments.",
    tech: "Total budget · per-payment cap · allow-list, checked before paying",
    external: null,
    compatibility: { next: "ok", expo: "unverified", python: "ok", node: "ok" },
    reasons: { expo: "Limits run on-device only and are not yet reviewed." },
    worksWith: ["payments"],
    prerequisites: [],
    implementationStatus: "provisional",
    files: {
      next: ["lib/payments/limits.ts"],
      expo: ["lib/payments/limits.ts"],
      python: ["agent/spending.py", "agent/policy.yaml"],
      node: ["src/integrations/limits.ts"],
    },
    packages: { python: [["pyyaml", "6.0"]] },
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

/** Files added once when an Expo project needs a companion server. */
export const COMPANION_FILES = ["companion-server/package.json", "companion-server/src/index.ts", "companion-server/.env.example"];

export function statusOf(id: IntegrationId, fw: FrameworkId): CompatStatus {
  return INTEGRATION_MAP[id]?.compatibility[fw] ?? "na";
}

export function isIntegrationId(x: string): x is IntegrationId {
  return (INTEGRATION_IDS as string[]).includes(x);
}
