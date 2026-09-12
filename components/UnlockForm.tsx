"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "./Wordmark";

export function UnlockForm({ next }: { next: string }) {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (checking || passcode.length === 0) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "That didn't work. Try again.");
        setPasscode("");
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError("Couldn't reach the app. Check your connection?");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="bg-card card-glow w-full max-w-sm rounded-2xl border border-white/8 p-6">
      <div className="flex flex-col gap-6">
        <Wordmark small />

        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-ink text-xl font-600">
            Passcode, please
          </h1>
          <p className="text-muted text-sm">
            Once per device. It sticks around after that.
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <label htmlFor="passcode" className="sr-only">
            Passcode
          </label>
          <input
            id="passcode"
            name="passcode"
            type="password"
            inputMode="text"
            autoComplete="current-password"
            autoFocus
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="input"
            placeholder="••••••••"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "passcode-error" : undefined}
          />

          {error && (
            <p
              id="passcode-error"
              role="alert"
              className="text-nope text-sm"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={checking || passcode.length === 0}
            className="border-cyan/50 bg-cyan/10 text-ink glow-cyan font-display font-500 flex items-center justify-center rounded-2xl border px-4 py-3 transition-all disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            {checking ? "Checking…" : "Let me in"}
          </button>
        </form>
      </div>
    </div>
  );
}
