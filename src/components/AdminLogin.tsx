"use client";

import { useState, type FormEvent } from "react";
import { browserSession, COOKIE_BLOCKED_MESSAGE } from "@/lib/client-session";
import { normalizePin, normalizeRecoveryCode } from "@/lib/pin";

export function AdminLogin() {
  const [pin, setPin] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retryAt, setRetryAt] = useState<number | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const value = recoveryMode ? normalizeRecoveryCode(pin) : normalizePin(pin);
      if (!value) throw new Error(recoveryMode ? "Enter the recovery code." : "Enter your PIN.");
      const res = await fetch("/api/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: value }),
      });
      const data = await res.json() as { error?: string; retryAfter?: number; recoveryUsed?: boolean };
      if (!res.ok) {
        if (data.retryAfter) setRetryAt(Date.now() + data.retryAfter * 1000);
        throw new Error(data.error ?? "Login failed. Try again.");
      }
      const session = await browserSession();
      if (!session.authenticated) throw new Error(COOKIE_BLOCKED_MESSAGE);
      // A full navigation avoids a cached admin layout showing the old login UI.
      if (data.recoveryUsed) window.location.assign("/share?recovered=1#pin");
      else window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-4 py-10">
      <section className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-2xl">
        <div className="text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-2xl shadow-lg shadow-indigo-500/20">🚕</div>
          <h1 className="mt-4 text-xl font-bold text-slate-900">CabTrack Admin</h1>
          <p className="mt-1 text-[13px] text-slate-500">{recoveryMode ? "Forgot your PIN? Enter your recovery code." : "Enter your admin PIN"}</p>
        </div>

        <form onSubmit={submit} className="mt-6" noValidate>
          <label htmlFor="admin-login-pin" className="mb-2 block text-[12px] font-semibold text-slate-600">
            {recoveryMode ? "Recovery code" : "Admin PIN"}
          </label>
          <div className="relative">
            <input
              id="admin-login-pin"
              name={recoveryMode ? "recoveryCode" : "pin"}
              type={show || recoveryMode ? "text" : "password"}
              inputMode={recoveryMode ? "text" : "numeric"}
              autoComplete={recoveryMode ? "off" : "current-password"}
              autoCapitalize={recoveryMode ? "characters" : "none"}
              spellCheck={false}
              autoFocus
              value={pin}
              onChange={(e) => setPin(recoveryMode ? e.target.value : normalizePin(e.target.value))}
              placeholder={recoveryMode ? "ABCD-1234" : "PIN"}
              aria-invalid={!!error}
              aria-describedby={error ? "admin-login-error" : "admin-login-help"}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 pr-16 text-[19px] tracking-[0.18em] text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
            {!recoveryMode ? (
              <button type="button" onClick={() => setShow((v) => !v)} className="absolute inset-y-0 right-3 text-[11.5px] font-semibold text-slate-500 hover:text-slate-900" aria-label={show ? "Hide PIN" : "Show PIN"}>
                {show ? "Hide" : "Show"}
              </button>
            ) : null}
          </div>
          <p id="admin-login-help" className="mt-2 text-[11.5px] text-slate-400">{recoveryMode ? "The code you received when setting the PIN. It works only once." : "4–8 digits · a leading zero is part of the PIN."}</p>
          {error ? <p id="admin-login-error" role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2.5 text-[12.5px] font-medium leading-relaxed text-rose-700">{error}</p> : null}
          {retryAt ? <p className="mt-2 text-[11.5px] text-slate-500">You can try again at: {new Date(retryAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</p> : null}
          <button type="submit" disabled={busy || !pin.trim()} className="mt-4 w-full rounded-xl bg-slate-900 py-3 text-[15px] font-bold text-white transition hover:bg-slate-800 disabled:opacity-50">
            {busy ? "Checking login…" : "🔓 Login"}
          </button>
        </form>

        <button type="button" onClick={() => { setRecoveryMode((v) => !v); setPin(""); setError(null); }} className="mt-4 w-full text-center text-[12px] font-semibold text-indigo-600 hover:text-indigo-500">
          {recoveryMode ? "← Log in with PIN" : "Forgot your PIN? Use the recovery code"}
        </button>
        <div className="mt-5 flex items-center justify-center gap-1.5 border-t border-slate-100 pt-4 text-[11px] text-slate-400">
          <span aria-hidden="true">🔒</span> Your fleet data is protected by the PIN
        </div>
      </section>
    </main>
  );
}
