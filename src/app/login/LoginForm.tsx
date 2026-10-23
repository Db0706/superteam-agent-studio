"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Module } from "@/components/system";
import { supabaseBrowser } from "@/lib/supabase/browser";

/** Email one-time code sign-in. Works with the code or the link in the same email. */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setBusy(false);
    if (error) setError(error.status === 429 ? "Too many sign-in emails just now. Wait a minute and try again." : error.message);
    else setStage("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setError("That code didn't work. Check the latest email, or send a new code.");
    else {
      router.replace(next);
      router.refresh();
    }
  }

  return (
    <Module label="SIGN IN" right="EMAIL CODE">
      {stage === "email" ? (
        <form onSubmit={sendCode} className="flex flex-col gap-3 p-4">
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 rounded-[3px] border border-[#CFCFC8] bg-white px-3 text-[15px] font-normal"
              placeholder="you@cam.ac.uk"
            />
          </label>
          <p className="m-0 text-[13px] leading-[1.45] text-ink-2">Use the email you registered with. We&apos;ll send a 6-digit code. No password needed.</p>
          <button type="submit" disabled={busy} className="btn-primary self-start !h-11 !px-5 !text-[14px]">
            {busy ? "Sending…" : "Send code ▸"}
          </button>
          {error && <p role="alert" className="m-0 text-[13px] text-fault">{error}</p>}
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-3 p-4">
          <p className="m-0 text-[14px] leading-normal text-ink-2">
            We sent a code to <b>{email}</b>. Enter it here, or open the link in the email.
          </p>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
            6-digit code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="h-11 w-40 rounded-[3px] border border-[#CFCFC8] bg-white px-3 font-mono text-[18px] tracking-[0.3em]"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="btn-primary !h-11 !px-5 !text-[14px]">
              {busy ? "Checking…" : "Sign in ▸"}
            </button>
            <button type="button" onClick={() => setStage("email")} className="btn-secondary !h-11 !px-4 !text-[14px]">
              Use a different email
            </button>
          </div>
          {error && <p role="alert" className="m-0 text-[13px] text-fault">{error}</p>}
        </form>
      )}
    </Module>
  );
}
