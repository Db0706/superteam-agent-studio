import { SOLANA_DEVNET } from "@/config/integrations";
import { fmt, type HttpCall, type StepKind } from "./engine";

/**
 * Conceptual HTTP exchange for the Technical Inspector.
 *
 * Shapes follow the x402 V2 flow (PAYMENT-REQUIRED → PAYMENT-SIGNATURE →
 * PAYMENT-RESPONSE) but are ILLUSTRATIVE, not the exact SDK structures.
 * We never fabricate a signature or settlement receipt; those slots are shown
 * as labelled placeholders. Verify field names against the current x402 V2
 * spec before reusing any of this.
 */

/** Devnet USDC mint (illustrative, confirm before use). */
export const DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

export interface HttpBlock {
  title: string;
  caption: string;
  code: string;
}

function base64(text: string): string {
  if (typeof btoa === "function") return btoa(unescape(encodeURIComponent(text)));
  return Buffer.from(text, "utf8").toString("base64");
}

export function paymentRequired(call: HttpCall) {
  return {
    x402Version: 2,
    resource: { url: `https://${call.host}${call.path.split("?")[0]}` },
    accepts: [
      {
        scheme: "exact",
        network: SOLANA_DEVNET,
        amount: String(call.priceCents * 10_000), // USDC has 6 decimals
        asset: DEVNET_USDC_MINT,
        payTo: "<service devnet address>",
        maxTimeoutSeconds: 60,
      },
    ],
  };
}

export function httpBlocks(call: HttpCall): HttpBlock[] {
  const required = paymentRequired(call);
  const json = JSON.stringify(required, null, 2);
  const encoded = base64(JSON.stringify(required));
  return [
    {
      title: "1 · AGENT REQUESTS THE RESOURCE",
      caption: "GET",
      code: `GET ${call.path} HTTP/1.1\nHost: ${call.host}\nAccept: application/json`,
    },
    {
      title: "2 · SERVICE REPLIES 402 WITH A PRICE",
      caption: "PAYMENT-REQUIRED",
      code: `HTTP/1.1 402 Payment Required\nPAYMENT-REQUIRED: ${encoded.slice(0, 28)}…\n\n// decoded (illustrative)\n${json}`,
    },
    {
      title: "3 · AGENT RETRIES WITH A SIGNED PAYMENT",
      caption: "PAYMENT-SIGNATURE",
      code: `GET ${call.path} HTTP/1.1\nHost: ${call.host}\nPAYMENT-SIGNATURE: <base64 payment payload, not generated here>\n\n// ${fmt(call.priceCents)} USDC, checked against the budget first`,
    },
    {
      title: "4 · SERVICE SETTLES AND RESPONDS",
      caption: "PAYMENT-RESPONSE",
      code: `HTTP/1.1 200 OK\nContent-Type: application/json\nPAYMENT-RESPONSE: <base64 settlement result, simulated>\n\n// in production a facilitator verifies + settles on Solana devnet`,
    },
  ];
}

/** Which inspector block matches the current step (-1 = none). */
export function activeBlockFor(kind: StepKind | undefined): number {
  switch (kind) {
    case "service":
    case "offer":
      return 0;
    case "payreq":
      return 1;
    case "check":
    case "paid":
      return 2;
    case "result":
      return 3;
    default:
      return -1;
  }
}
