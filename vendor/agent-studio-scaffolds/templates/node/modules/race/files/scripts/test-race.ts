// Offline tests for the race adapter's protocol handling. Run: npm run test:race
// They check the envelope, the token and the nonce, not your AI logic: the race verifier does that.
import assert from "node:assert/strict";
import { test } from "node:test";
import { handleHealth, handleTask } from "../src/race/adapter.js";
import { handlers } from "../src/race/handlers.js";
import { TaskError } from "../src/race/protocol.js";

const env = { AGENT_STUDIO_VERIFIER_TOKEN: "test-token-0123456789" };
const auth = `Bearer ${env.AGENT_STUDIO_VERIFIER_TOKEN}`;
const request = (task: unknown) => ({ protocol: "asrp/1", nonce: "nonce-0123456789abcdef", attempt: { id: "a", layer: "l", number: 1 }, task });

test("health needs the token", () => {
  assert.equal(handleHealth(undefined, {}).status, 503);
  assert.equal(handleHealth("Bearer wrong", env).status, 401);
  const ok = handleHealth(auth, env);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.protocol, "asrp/1");
  assert.equal(ok.body.status, "ready");
});

test("tasks reject unknown callers and malformed requests", async () => {
  const noAuth = await handleTask("Bearer nope", request({ type: "respond", input: "hi" }), env);
  assert.equal(noAuth.status, 401);
  assert.deepEqual((noAuth.body.error as { code: string }).code, "unauthorized");
  const bad = await handleTask(auth, { nonce: "n".repeat(16), task: { type: "dance" } }, env);
  assert.equal(bad.status, 400);
  assert.equal(bad.body.nonce, "n".repeat(16));
});

test("answers are wrapped with the echoed nonce", async () => {
  const original = handlers.respond;
  handlers.respond = async (task) => ({ text: `echo: ${String(task.input)}` });
  try {
    const r = await handleTask(auth, request({ type: "respond", input: "hi" }), env);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { protocol: "asrp/1", nonce: "nonce-0123456789abcdef", status: "ok", output: { text: "echo: hi" } });
  } finally {
    handlers.respond = original;
  }
});

test("TaskError becomes the matching protocol error", async () => {
  const original = handlers.extract;
  handlers.extract = async () => {
    throw new TaskError("invalid_input", "no schema");
  };
  try {
    const r = await handleTask(auth, request({ type: "extract", input: "" }), env);
    assert.equal(r.status, 400);
    assert.deepEqual(r.body.error, { code: "invalid_input", message: "no schema" });
  } finally {
    handlers.extract = original;
  }
});

test("unbuilt task types say so instead of guessing", async () => {
  const r = await handleTask(auth, request({ type: "converse", input: "hi", sessionId: "s" }), env);
  assert.equal(r.status, 500);
  assert.match((r.body.error as { message: string }).message, /doesn't handle "converse" tasks yet/);
});
