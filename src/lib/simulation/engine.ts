import { SCENARIOS, type Offer, type ScenarioId, type ScenarioService } from "./scenarios";

/**
 * Deterministic step generator. Same input → same steps, always.
 * Money is tracked in integer cents so budget checks are exact.
 */

export type StepKind = "user" | "agent" | "service" | "offer" | "payreq" | "check" | "paid" | "result" | "error" | "done";

export interface SimConfig {
  scenario: ScenarioId;
  /** USD, 0.05-2.00 */
  budget: number;
  serviceDown: boolean;
}

export interface HttpCall {
  service: string;
  host: string;
  path: string;
  priceCents: number;
}

export interface Step {
  kind: StepKind;
  /** 0-4 drives the flow nodes; 5 = done. */
  stage: number;
  title: string;
  detail: string;
  text?: string;
  err?: boolean;
  chip?: string;
  chipTone?: "signal" | "ink";
  /** Service the step relates to (for the technical inspector). */
  call?: HttpCall;
  /** Running totals *after* this step. */
  spentCents: number;
  paid: number;
  /** Only on `done`. */
  gaps?: number;
}

export const toCents = (usd: number) => Math.round(usd * 100);
export const fmt = (cents: number) => `$${(Math.max(0, cents) / 100).toFixed(2)}`;
export const fmtUsd = (usd: number) => fmt(toCents(usd));

/** Price the agent expects to pay if every preferred choice is affordable. */
export function preferredPrice(svc: ScenarioService): number {
  if (!svc.offers) return toCents(svc.price ?? 0);
  const ok = acceptable(svc);
  return ok.length ? toCents(ok[0].price) : 0;
}

/** Offers that meet the quality bar, best rating first, then cheapest. */
function acceptable(svc: ScenarioService): Offer[] {
  return (svc.offers ?? [])
    .filter((o) => o.rating >= (svc.minRating ?? 0))
    .sort((a, b) => b.rating - a.rating || a.price - b.price);
}

export function taskTotalCents(scenario: ScenarioId): number {
  return SCENARIOS[scenario].services.reduce((a, s) => a + preferredPrice(s), 0);
}

type Choice = { offer: Offer; reason: string } | { offer: null; reason: string; cheapest: Offer | null };

/**
 * Agent-to-agent selection rule: split what is left evenly across the
 * remaining purchases; take the best-rated acceptable offer inside that share,
 * otherwise the cheapest acceptable offer that still fits the funds.
 */
export function chooseOffer(svc: ScenarioService, fundsCents: number, remaining: number): Choice {
  const ok = acceptable(svc);
  const share = Math.floor(fundsCents / Math.max(1, remaining));
  const inShare = ok.find((o) => toCents(o.price) <= share);
  if (inShare) {
    return {
      offer: inShare,
      reason: inShare === ok[0] ? `Highest rating (★${inShare.rating}) and within its ${fmt(share)} share of the budget.` : `Best rating that fits its ${fmt(share)} share of the budget. The top-rated offer costs more.`,
    };
  }
  const cheapest = [...ok].sort((a, b) => a.price - b.price)[0] ?? null;
  if (cheapest && toCents(cheapest.price) <= fundsCents) {
    return { offer: cheapest, reason: `Nothing rated ★${svc.minRating}+ fits an even share, so it takes the cheapest acceptable offer.` };
  }
  return { offer: null, reason: "No acceptable offer fits what is left of the budget.", cheapest };
}

export function buildSteps(cfg: SimConfig): Step[] {
  const sc = SCENARIOS[cfg.scenario];
  const budget = toCents(cfg.budget);
  const out: Step[] = [];
  let funds = budget;
  let spent = 0;
  let paid = 0;
  let gaps = 0;
  const push = (s: Omit<Step, "spentCents" | "paid">) => out.push({ ...s, spentCents: spent, paid });

  push({ kind: "user", stage: 0, title: "", detail: "", text: sc.task });
  push({ kind: "agent", stage: 0, title: "Agent plans the task", detail: sc.plan });

  sc.services.forEach((svc, i) => {
    const remaining = sc.services.length - i;
    const directoryCall: HttpCall = { service: svc.name, host: svc.host, path: svc.path, priceCents: preferredPrice(svc) };

    if (svc.offers) {
      push({ kind: "service", stage: 1, title: `Looks for ${svc.name} agents`, detail: `Asks an agent directory who can do it: ${svc.what}.`, call: directoryCall });
    } else {
      push({ kind: "service", stage: 1, title: `Finds ${svc.name}`, detail: `${svc.what} · ${fmtUsd(svc.price ?? 0)} per request`, call: directoryCall });
    }

    if (cfg.serviceDown && i === 1) {
      push({
        kind: "error",
        stage: 1,
        err: true,
        title: `${svc.offers ? "Agent directory" : svc.name} is unavailable`,
        detail: "The service did not respond (HTTP 503). No payment was requested, so nothing was spent.",
        call: directoryCall,
      });
      push({ kind: "agent", stage: 1, title: "Agent adapts", detail: `Carries on without ${svc.short}. The result will note the gap.` });
      gaps++;
      return;
    }

    let price = toCents(svc.price ?? 0);
    let call = directoryCall;
    let seller = svc.name;

    if (svc.offers) {
      push({
        kind: "offer",
        stage: 1,
        title: `${svc.offers.length} agents make offers`,
        detail: svc.offers.map((o) => `${o.agent} ${fmtUsd(o.price)} ★${o.rating}`).join(" · "),
        call: directoryCall,
      });
      const choice = chooseOffer(svc, funds, remaining);
      if (!choice.offer) {
        const need = choice.cheapest ? fmtUsd(choice.cheapest.price) : "more";
        push({
          kind: "error",
          stage: 3,
          err: true,
          title: "No offer fits the budget",
          detail: `The cheapest offer rated ★${svc.minRating}+ costs ${need}, but only ${fmt(funds)} of your ${fmt(budget)} budget remains. Nothing was paid.`,
          call: directoryCall,
        });
        push({ kind: "agent", stage: 3, title: "Agent respects the limit", detail: `It will not exceed the budget you set, so it continues without ${svc.short}.` });
        gaps++;
        return;
      }
      const o = choice.offer;
      price = toCents(o.price);
      seller = o.agent;
      call = { service: o.agent, host: o.host, path: svc.path.replace(/^\/v1\/translate/, "/v1/jobs"), priceCents: price };
      push({ kind: "agent", stage: 1, title: `Selects ${o.agent}`, detail: choice.reason, call });
    }

    push({
      kind: "payreq",
      stage: 2,
      title: svc.offers ? `${seller} requests payment` : "Service requests payment",
      detail: `HTTP 402: ${fmt(price)} to unlock ${svc.offers ? svc.what : svc.what.toLowerCase()}.`,
      chip: fmt(price),
      chipTone: "signal",
      call,
    });

    if (price > funds) {
      push({
        kind: "error",
        stage: 3,
        err: true,
        title: "Payment declined: over budget",
        detail: `Needs ${fmt(price)} but only ${fmt(funds)} of your ${fmt(budget)} budget remains. Nothing was paid.`,
        call,
      });
      push({ kind: "agent", stage: 3, title: "Agent respects the limit", detail: `It will not exceed the budget you set, so it continues without ${svc.short}.` });
      gaps++;
      return;
    }

    push({ kind: "check", stage: 3, title: "Budget check passed", detail: `${fmt(price)} requested · ${fmt(funds)} available.`, call });
    funds -= price;
    spent += price;
    paid += 1;
    push({ kind: "paid", stage: 3, title: "Payment authorised (simulated)", detail: `${fmt(price)} paid · ${fmt(funds)} left.`, chip: `−${fmt(price)}`, chipTone: "ink", call });
    push({ kind: "result", stage: 4, title: `${seller} delivers`, detail: svc.delivers, call });
  });

  push({
    kind: "done",
    stage: 5,
    gaps,
    title: gaps ? "DONE WITH GAPS" : "TASK COMPLETE",
    text: gaps ? sc.partial : sc.report,
    detail: `SPENT ${fmt(spent)} OF ${fmt(budget)} · ${paid} PAYMENT${paid === 1 ? "" : "S"} · SIMULATED`,
  });
  return out;
}
