"use client";

import { useState } from "react";
import Link from "next/link";

export default function ChatPage() {
  const [prompt, setPrompt] = useState("Explain what an API is in two sentences.");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function send() {
    setLoading(true);
    setError("");
    setAnswer("");
    try {
      // The browser only talks to our own server route; the Gemini key stays on the server.
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setAnswer(data.text ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <p><Link href="/">← Home</Link></p>
      <h1>Gemini chat</h1>
      <textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <button onClick={send} disabled={loading || !prompt.trim()}>
        {loading ? "Thinking…" : "Ask Gemini"}
      </button>
      {error && <p className="error">{error}</p>}
      {answer && <pre>{answer}</pre>}
    </>
  );
}
