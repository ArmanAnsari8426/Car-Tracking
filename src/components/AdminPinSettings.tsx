"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHeader, TextInput } from "@/components/ui";
import { browserSession, COOKIE_BLOCKED_MESSAGE } from "@/lib/client-session";
import { isValidPin, normalizePin } from "@/lib/pin";

export function AdminPinSettings({ hasPin }: { hasPin: boolean }) {
  const router = useRouter();
  const [configured, setConfigured] = useState(hasPin);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [recovered, setRecovered] = useState(false);

  useEffect(() => setConfigured(hasPin), [hasPin]);
  useEffect(() => setRecovered(new URLSearchParams(window.location.search).get("recovered") === "1"), []);

  const save = async (value: string, confirmation: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminPin: value, confirmPin: confirmation }),
      });
      const data = await res.json() as { error?: string; recovery?: string | null; pinConfigured?: boolean };
      if (!res.ok) throw new Error(data.error ?? "PIN was not saved.");
      setRecovery(data.recovery ?? null);
      setConfigured(data.pinConfigured === true);
      setCopied(false);
      const session = await browserSession();
      if (!session.authenticated) throw new Error(COOKIE_BLOCKED_MESSAGE);
      setSuccess(value ? "PIN saved ✅ You are logged in. You can lock and log in again with this PIN." : "PIN removed. The dashboard now opens without a PIN.");
      setPin("");
      setConfirm("");
      setRecovered(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const p = normalizePin(pin);
    if (!isValidPin(p)) { setError("PIN must be 4 to 8 digits."); return; }
    if (p !== normalizePin(confirm)) { setError("The two PINs do not match. Check again."); return; }
    void save(p, normalizePin(confirm));
  };

  return (
    <Card>
      <section id="pin" data-testid="admin-pin-settings" className="scroll-mt-6">
        <CardHeader icon="🔒" title="Admin PIN" subtitle={configured ? "PIN is set ✅ — the dashboard is only for you" : "⚠️ PIN not set — protect your dashboard"} />
        <div className="space-y-4 p-5">
          {recovered ? <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-[12.5px] font-medium text-amber-900">You logged in with the recovery code. Your current PIN is still set; set a new PIN below and keep the new recovery code.</p> : null}
          <form onSubmit={submit} noValidate className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label htmlFor="new-admin-pin" className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-slate-600">{configured ? "Naya PIN" : "Admin PIN"}</span>
                <TextInput id="new-admin-pin" name="newPin" type={show ? "text" : "password"} inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(normalizePin(e.target.value))} placeholder="4–8 number" aria-invalid={!!error} />
              </label>
              <label htmlFor="confirm-admin-pin" className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-slate-600">Re-enter the PIN</span>
                <TextInput id="confirm-admin-pin" name="confirmPin" type={show ? "text" : "password"} inputMode="numeric" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(normalizePin(e.target.value))} placeholder="Confirm PIN" aria-invalid={!!error} />
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-[12px] text-slate-600">
                <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="accent-indigo-600" /> Show PIN
              </label>
              <span className="text-[11px] text-slate-400">Remember a leading zero if you use one</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="primary" disabled={busy || !pin || !confirm}>{busy ? "Checking & saving…" : configured ? "Change PIN" : "Set PIN"}</Button>
              {configured ? <Button type="button" variant="ghost" disabled={busy} className="text-rose-600 hover:bg-rose-50" onClick={() => { if (window.confirm("Remove the PIN? Then anyone can open the dashboard.")) void save("", ""); }}>Remove PIN</Button> : null}
            </div>
          </form>
          {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-[12.5px] font-medium leading-relaxed text-rose-700">{error}</p> : null}
          {success ? <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2.5 text-[12.5px] font-semibold text-emerald-800">{success}</p> : null}
          {recovery ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-[12px] font-bold text-amber-900">🔑 Recovery code — write it down now</div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <code data-testid="recovery-code" className="select-all rounded-lg bg-white px-3 py-2 font-mono text-[19px] font-bold tracking-wider text-slate-900">{recovery}</code>
                <Button size="sm" type="button" onClick={async () => { try { await navigator.clipboard.writeText(recovery); setCopied(true); } catch { setError("Select the code and copy it manually."); } }}>{copied ? "✓ Copied" : "📋 Copy"}</Button>
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-amber-800">If you forget your PIN, choose “Recovery code” on the login screen. The code works only once. It will not be shown again after you leave this page.</p>
            </div>
          ) : null}
          <p className="border-t border-slate-100 pt-3 text-[12px] leading-relaxed text-slate-500">The driver form works without a PIN. The PIN is only for your dashboard. Changing the PIN logs out older browser sessions.</p>
        </div>
      </section>
    </Card>
  );
}
