import { describe, expect, it, vi } from "vitest";
import { handleFixture } from "@/server/fixtures/reference-app";

const PAY_TO = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const task = (input: string) =>
  new Request("http://fixture/agent-studio/v1/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ protocol: "asrp/1", nonce: "nonce-0123456789abcdef", attempt: { id: "a", layer: "l", number: 1 }, task: { type: "run_workflow", input, limits: { maxSpendUsd: 0.01 } } }),
  });
const payTask = `Pay 0.01 devnet USDC to ${PAY_TO} with the memo "agent-studio-abc123". Return { "signature": "<transaction signature>" } in output.data.`;

describe("fixture payment stage", () => {
  it("the reference fixture pays the address, amount and memo from the task", async () => {
    const payer = vi.fn(async () => "sig".padEnd(88, "1"));
    const res = await (await handleFixture(task(payTask), "reference", "/agent-studio/v1/tasks", null, undefined, payer)).json();
    expect(payer).toHaveBeenCalledWith(PAY_TO, 0.01, "agent-studio-abc123");
    expect(res.output.data.signature).toBe("sig".padEnd(88, "1"));
  });

  it("the fabricator invents a signature without paying", async () => {
    const payer = vi.fn();
    const res = await (await handleFixture(task(payTask), "fabricator", "/agent-studio/v1/tasks", null, undefined, payer)).json();
    expect(payer).not.toHaveBeenCalled();
    expect(res.output.data.signature).toMatch(/^5{88}$/);
  });

  it("without a wallet it reports an upstream error instead of guessing", async () => {
    const res = await handleFixture(task(payTask), "reference", "/agent-studio/v1/tasks", null);
    expect(res.status).toBe(503);
    expect((await res.json()).error.message).toMatch(/FIXTURE_PAYER_KEY/);
  });
});
