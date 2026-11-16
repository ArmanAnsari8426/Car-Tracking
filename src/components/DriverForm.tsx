"use client";

import { useEffect, useState } from "react";
import type { DutyCab } from "@/lib/duty";

type Result = { tone: "green" | "red" | "blue" | "amber"; title: string; message: string };
type Action = "on" | "off" | "leave";

const STORE = "cabtrack_cab";
const TONE: Record<Result["tone"], string> = {
  green: "bg-emerald-600",
  red: "bg-rose-600",
  blue: "bg-sky-600",
  amber: "bg-amber-500",
};
const ACTIONS: { id: Action; label: string; icon: string; cls: string }[] = [
  { id: "on", label: "DUTY ON", icon: "🟢", cls: "border-emerald-500 bg-emerald-50 text-emerald-800" },
  { id: "off", label: "DUTY OFF", icon: "🔴", cls: "border-rose-500 bg-rose-50 text-rose-800" },
  { id: "leave", label: "LEAVE", icon: "🏖️", cls: "border-sky-500 bg-sky-50 text-sky-800" },
];

const len = (a: string, b: string) => {
  const [h1, m1] = a.split(":").map(Number);
  const [h2, m2] = b.split(":").map(Number);
  const d = (h2 * 60 + m2 - (h1 * 60 + m1) + 1440) % 1440;
  return `${Math.floor(d / 60)}h${d % 60 ? ` ${d % 60}m` : ""}`;
};
const mins = (m: number) => `${Math.floor(m / 60) ? `${Math.floor(m / 60)}h ` : ""}${m % 60}m`;

export function DriverForm({ k, drivers, initial }: { k: string; drivers: { id: string; name: string }[]; initial: DutyCab | null }) {
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<DutyCab[]>([]);
  const [cab, setCab] = useState<DutyCab | null>(initial);
  const [shift, setShift] = useState<"day" | "night">(initial?.suggested.shiftType ?? "day");
  const [other, setOther] = useState(false);
  const [driverId, setDriverId] = useState("");
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () =>
      setClock(new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date()));
    tick();
    const t = window.setInterval(tick, 15000);
    return () => window.clearInterval(t);
  }, []);

  const pickCab = (c: DutyCab) => {
    setCab(c);
    setMatches([]);
    setShift(c.suggested.shiftType);
    setOther(false);
    setDriverId("");
    setAction(null);
    setError(null);
    window.localStorage.setItem(STORE, c.cabId);
  };

  useEffect(() => {
    if (initial) {
      window.localStorage.setItem(STORE, initial.cabId);
      return;
    }
    const saved = window.localStorage.getItem(STORE);
    if (!saved) return;
    fetch(`/api/driver-form?k=${encodeURIComponent(k)}&cabId=${encodeURIComponent(saved)}`)
      .then((r) => r.json())
      .then((d: { cabs?: DutyCab[] }) => {
        if (d.cabs?.[0]) pickCab(d.cabs[0]);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = async () => {
    setBusy(true);
    setError(null);
    setMatches([]);
    try {
      const res = await fetch(`/api/driver-form?k=${encodeURIComponent(k)}&q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      const list = (data.cabs ?? []) as DutyCab[];
      if (!list.length) setError("This cab was not found. Enter the full number or the last 4 digits.");
      else if (list.length === 1) pickCab(list[0]);
      else setMatches(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!cab || !action) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/driver-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ k, cabId: cab.cabId, action, shiftType: shift, driverId: other ? driverId || null : null, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submission failed");
      setResult({ tone: data.tone, title: data.title, message: data.message });
      if (data.cab) setCab(data.cab as DutyCab);
      setAction(null);
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setBusy(false);
    }
  };

  const sel = cab?.shifts.find((s) => s.shiftType === shift) ?? cab?.shifts[0];
  const todayRec = cab?.records.find((r) => r.shiftType === shift && r.date === cab.suggested.date) ?? null;

  return (
    <div className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid size-10 place-items-center rounded-xl bg-slate-900 text-xl">🚕</span>
          <div>
            <div className="text-[17px] font-extrabold leading-tight text-slate-900">Duty ON / OFF</div>
            <div className="text-[12px] text-slate-500">CabTrack driver form</div>
          </div>
        </div>
        <div className="rounded-xl bg-white px-3 py-1.5 text-[15px] font-bold tabular-nums text-slate-800 shadow-sm">{clock}</div>
      </div>

      {result ? (
        <div className={`mt-6 rounded-3xl p-6 text-center text-white shadow-lg ${TONE[result.tone]}`}>
          <div className="text-[26px] font-extrabold">{result.title}</div>
          <div className="mt-2 text-[16px] font-medium opacity-95">{result.message}</div>
          <button onClick={() => setResult(null)} className="mt-5 w-full rounded-2xl bg-white/20 py-3.5 text-[16px] font-bold">
            ✔️ OK
          </button>
        </div>
      ) : null}

      {!cab && !result ? (
        <div className="mt-6 rounded-3xl bg-white p-5 shadow-lg">
          <label className="block text-[15px] font-bold text-slate-800">Enter your cab number</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="6430 ya PB-01-F-6430"
            autoFocus
            className="mt-2 w-full rounded-2xl border-2 border-slate-300 px-4 py-4 text-center text-[22px] font-bold tracking-wider focus:border-slate-900 focus:outline-none"
          />
          <p className="mt-2 text-[12.5px] text-slate-500">Last 4 digits also work · or your mobile number</p>
          <button
            onClick={search}
            disabled={busy || q.replace(/[^a-z0-9]/gi, "").length < 3}
            className="mt-4 w-full rounded-2xl bg-slate-900 py-4 text-[17px] font-bold text-white disabled:opacity-40"
          >
            {busy ? "Searching…" : "🔍 Show details"}
          </button>
          {matches.length ? (
            <div className="mt-4 space-y-2">
              <p className="text-[13px] font-semibold text-slate-600">Choose your cab:</p>
              {matches.map((m) => (
                <button key={m.cabId} onClick={() => pickCab(m)} className="w-full rounded-2xl border-2 border-slate-200 px-4 py-3 text-left">
                  <div className="text-[17px] font-extrabold text-slate-900">{m.cabNumber}</div>
                  <div className="text-[12.5px] text-slate-500">{m.shifts.map((s) => s.driverName).filter(Boolean).join(" / ") || m.model || "—"}</div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {cab && !result ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-3xl bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[24px] font-extrabold tracking-wide text-slate-900">{cab.cabNumber}</div>
                <div className="text-[13px] text-slate-500">{[cab.model, cab.owner].filter(Boolean).join(" · ")}</div>
              </div>
              <button
                onClick={() => {
                  setCab(null);
                  setQ("");
                  window.localStorage.removeItem(STORE);
                }}
                className="rounded-xl bg-slate-100 px-3 py-1.5 text-[12.5px] font-semibold text-slate-600"
              >
                Change cab
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {cab.shifts.map((s) => (
                <div key={s.shiftType} className={`rounded-2xl px-4 py-3 ${s.shiftType === "day" ? "bg-amber-50" : "bg-indigo-50"}`}>
                  <div className="flex items-center justify-between text-[15px] font-bold text-slate-800">
                    <span>{s.shiftType === "day" ? "☀️ Day" : "🌙 Night"}</span>
                    <span className="tabular-nums">
                      {s.in} → {s.out} <span className="text-[12px] font-semibold text-slate-500">({len(s.in, s.out)})</span>
                    </span>
                  </div>
                  <div className="mt-0.5 text-[14px] text-slate-700">🧑‍✈️ {s.driverName ?? "Driver not set"}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-[14px] text-slate-700">
              {cab.open ? (
                <span>
                  🟢 <b>Duty is ON</b> — since {cab.open.actualIn} ({cab.open.shiftType === "day" ? "Day" : "Night"})
                </span>
              ) : todayRec && todayRec.status === "present" && todayRec.actualOut ? (
                <span>
                  🏁 Today's duty ended: {todayRec.actualIn ?? "?"} → {todayRec.actualOut}
                  {todayRec.dutyMinutes !== null ? ` (${mins(todayRec.dutyMinutes)})` : ""}
                </span>
              ) : todayRec && todayRec.status === "leave" ? (
                <span>🏖️ On leave today</span>
              ) : (
                <span>⏳ Duty ON not started yet</span>
              )}
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-lg">
            {cab.shifts.length > 1 ? (
              <div className="grid grid-cols-2 gap-2">
                {cab.shifts.map((s) => (
                  <button
                    key={s.shiftType}
                    onClick={() => setShift(s.shiftType)}
                    className={`rounded-2xl py-3 text-[16px] font-bold ${shift === s.shiftType ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`}
                  >
                    {s.shiftType === "day" ? "☀️ Day" : "🌙 Night"}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="mt-3 text-[14px] text-slate-700">
              Driver: <b>{other ? drivers.find((d) => d.id === driverId)?.name ?? "—" : sel?.driverName ?? "—"}</b>{" "}
              <button onClick={() => setOther(!other)} className="ml-1 text-[12.5px] font-semibold text-indigo-600 underline">
                {other ? "regular driver" : "someone else driving?"}
              </button>
            </div>
            {other ? (
              <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className="mt-2 w-full rounded-2xl border-2 border-slate-300 px-4 py-3 text-[16px]">
                <option value="">— choose your name —</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            ) : null}

            <div className="mt-4 grid grid-cols-3 gap-2">
              {ACTIONS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAction(a.id)}
                  className={`rounded-2xl border-2 px-1 py-4 text-center ${action === a.id ? `${a.cls} ring-4 ring-offset-1` : "border-slate-200 bg-white text-slate-600"}`}
                >
                  <div className="text-[26px] leading-none">{a.icon}</div>
                  <div className="mt-1.5 text-[13.5px] font-extrabold">{a.label}</div>
                </button>
              ))}
            </div>

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Note (if you want to add something) — e.g. vehicle breakdown, traffic…"
              className="mt-4 w-full rounded-2xl border-2 border-slate-200 px-4 py-3 text-[15px]"
            />

            {error ? <p className="mt-2 rounded-xl bg-rose-50 px-4 py-2 text-center text-[14px] font-semibold text-rose-700">{error}</p> : null}

            <button
              onClick={submit}
              disabled={busy || !action || (other && !driverId)}
              className="mt-3 w-full rounded-2xl bg-emerald-600 py-4 text-[18px] font-extrabold text-white shadow disabled:opacity-40"
            >
              {busy ? "Sending…" : action ? `✅ Submit — ${ACTIONS.find((a) => a.id === action)?.label}` : "Choose DUTY ON / OFF / LEAVE above"}
            </button>
          </div>
        </div>
      ) : null}
      {!cab && error ? <p className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-center text-[14px] font-semibold text-rose-700">{error}</p> : null}
    </div>
  );
}
