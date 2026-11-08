/**
 * The reference challenge services' behaviour, as pure functions.
 *
 * During an attempt the verifier creates a session holding hidden facts (records, rates,
 * documents, inventory, budget) and optional fault behaviour. The participant's app calls the
 * tools with the session token; the service answers from the facts and records every call.
 * Because the answers are fresh per attempt and only the service knows them, an app can only
 * produce the right result by really calling the tools.
 */

export interface SessionFacts {
  records?: Record<string, Record<string, unknown>>;
  rates?: Record<string, number>;
  documents?: { id: string; title: string; text: string; keywords: string[] }[];
  inventory?: Record<string, { name: string; available: number; unitPriceUsd: number }>;
  budgetUsd?: number;
}

export interface SessionBehaviour {
  /** Fail the first N calls to these tools with 503 (recoverable outage). */
  failFirst?: { tools: string[]; count: number };
  /** Every call to these tools fails with 503 (unrecoverable outage). */
  down?: string[];
  /** Delay responses from these tools (ms). Used to test timeouts. */
  delayMs?: { tools: string[]; ms: number };
}

export interface PriorCall {
  tool: string;
  input: Record<string, unknown>;
  status: number;
  output: unknown;
}

export interface ToolAnswer {
  status: number;
  body: Record<string, unknown>;
  delayMs: number;
}

export const TOOL_CATALOGUE = {
  lookup_record: {
    description: "Look up a record by id. Returns its fields.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
  },
  exchange_rate: {
    description: "Get the exchange rate between two currency codes (ISO 4217). Returns { rate }.",
    inputSchema: { type: "object", required: ["from", "to"], properties: { from: { type: "string" }, to: { type: "string" } } },
  },
  search_source: {
    description: "Search the knowledge source. Returns matching documents with ids and text.",
    inputSchema: { type: "object", required: ["query"], properties: { query: { type: "string" } } },
  },
  check_inventory: {
    description: "Check stock and unit price for a product SKU.",
    inputSchema: { type: "object", required: ["sku"], properties: { sku: { type: "string" } } },
  },
  create_quote: {
    description: "Create a priced quote for a SKU and quantity. Check inventory for that SKU first.",
    inputSchema: { type: "object", required: ["sku", "quantity"], properties: { sku: { type: "string" }, quantity: { type: "integer", minimum: 1 } } },
  },
  place_order: {
    description: "Place an order for a quote. Refused if the quote total exceeds the budget.",
    inputSchema: { type: "object", required: ["quoteId"], properties: { quoteId: { type: "string" } } },
  },
} as const satisfies Record<string, { description: string; inputSchema: Record<string, unknown> }>;

export type ToolName = keyof typeof TOOL_CATALOGUE;
export const isToolName = (name: string): name is ToolName => name in TOOL_CATALOGUE;

const ok = (body: Record<string, unknown>, delayMs = 0): ToolAnswer => ({ status: 200, body, delayMs });
const fail = (status: number, error: string, delayMs = 0): ToolAnswer => ({ status, body: { error }, delayMs });
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function quoteIdFor(sku: string, quantity: number): string {
  return `q-${sku}-${quantity}`;
}

export function answerTool(tool: ToolName, input: Record<string, unknown>, facts: SessionFacts, behaviour: SessionBehaviour, prior: PriorCall[]): ToolAnswer {
  const delayMs = behaviour.delayMs?.tools.includes(tool) ? behaviour.delayMs.ms : 0;
  if (behaviour.down?.includes(tool)) return fail(503, "service unavailable", delayMs);
  if (behaviour.failFirst?.tools.includes(tool)) {
    const earlier = prior.filter((c) => c.tool === tool).length;
    if (earlier < behaviour.failFirst.count) return fail(503, "temporarily unavailable, retry", delayMs);
  }

  switch (tool) {
    case "lookup_record": {
      const record = facts.records?.[str(input.id)];
      return record ? ok({ id: str(input.id), ...record }, delayMs) : fail(404, "no record with that id", delayMs);
    }
    case "exchange_rate": {
      const from = str(input.from).toUpperCase();
      const to = str(input.to).toUpperCase();
      const rate = facts.rates?.[`${from}:${to}`];
      return rate === undefined ? fail(404, "unknown currency pair", delayMs) : ok({ from, to, rate }, delayMs);
    }
    case "search_source": {
      const words = str(input.query).toLowerCase().split(/\W+/).filter((w) => w.length > 2);
      if (!words.length) return fail(400, "query is required", delayMs);
      const hits = (facts.documents ?? [])
        .map((d) => ({ d, score: words.filter((w) => d.keywords.includes(w) || d.title.toLowerCase().includes(w)).length }))
        .filter((h) => h.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(({ d }) => ({ id: d.id, title: d.title, text: d.text }));
      return ok({ results: hits }, delayMs);
    }
    case "check_inventory": {
      const item = facts.inventory?.[str(input.sku)];
      return item ? ok({ sku: str(input.sku), ...item }, delayMs) : fail(404, "unknown sku", delayMs);
    }
    case "create_quote": {
      const sku = str(input.sku);
      const quantity = Number(input.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) return fail(400, "quantity must be a positive integer", delayMs);
      if (!prior.some((c) => c.tool === "check_inventory" && str(c.input.sku) === sku && c.status === 200)) return fail(409, "check inventory for this sku first", delayMs);
      const item = facts.inventory?.[sku];
      if (!item) return fail(404, "unknown sku", delayMs);
      if (quantity > item.available) return fail(409, "not enough stock", delayMs);
      return ok({ quoteId: quoteIdFor(sku, quantity), sku, quantity, totalUsd: Math.round(item.unitPriceUsd * quantity * 100) / 100 }, delayMs);
    }
    case "place_order": {
      const quoteId = str(input.quoteId);
      const quote = prior.find((c) => c.tool === "create_quote" && c.status === 200 && (c.output as { quoteId?: string })?.quoteId === quoteId);
      if (!quote) return fail(409, "create a quote first", delayMs);
      const total = (quote.output as { totalUsd: number }).totalUsd;
      if (facts.budgetUsd !== undefined && total > facts.budgetUsd) return fail(403, "quote total exceeds the budget", delayMs);
      if (prior.some((c) => c.tool === "place_order" && c.status === 200 && str(c.input.quoteId) === quoteId)) return fail(409, "order already placed", delayMs);
      return ok({ orderId: `o-${quoteId.slice(2)}`, quoteId, totalUsd: total, status: "confirmed" }, delayMs);
    }
  }
}
