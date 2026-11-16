import Link from "next/link";
import { cx } from "@/lib/cx";
import type { DailyReport, DailyRow } from "@/lib/data";
import { EARLY_OFF_ALERT_MIN, minutesToLabel } from "@/lib/tracking";

export function dailyStatus(r: DailyRow): { label: string; cls: string } {
  if (r.status === "present" || r.status === "half_day") {
    if (r.onDuty) return { label: "🟢 On duty", cls: "bg-emerald-100 text-emerald-800" };
    if (r.actualOut) return { label: r.status === "half_day" ? "🌓 Half day" : "🏁 Complete", cls: "bg-slate-100 text-slate-700" };
    return { label: r.status === "half_day" ? "🌓 Half day" : "✅ Present", cls: "bg-emerald-50 text-emerald-700" };
  }
  if (r.status === "leave") return { label: "🏖️ Leave", cls: "bg-sky-100 text-sky-800" };
  if (r.status === "absent") return { label: "❌ Absent", cls: "bg-rose-100 text-rose-800" };
  if (r.status === "off") return { label: "⚪ Off", cls: "bg-slate-100 text-slate-500" };
  return { label: "⏳ Not reported", cls: "bg-amber-100 text-amber-800" };
}

const SRC: Record<string, string> = { driver: "📱 Driver", manual: "✍️ Manual", upload: "📤 Upload", auto: "", template: "" };

export function ReportTabs({ active }: { active: "daily" | "range" }) {
  return (
    <div className="mb-4 inline-flex rounded-2xl bg-white p-1 ring-1 ring-slate-200 print:hidden">
      {(
        [
          ["daily", "📅 Daily report", "/reports?view=daily"],
          ["range", "📊 Date range report", "/reports?view=range"],
        ] as const
      ).map(([id, label, href]) => (
        <Link key={id} href={href} className={cx("rounded-xl px-4 py-2 text-[13px] font-semibold", active === id ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900")}>
          {label}
        </Link>
      ))}
    </div>
  );
}

export function DailySummary({ report, compact = false }: { report: DailyReport; compact?: boolean }) {
  const c = report.counts;
  const cards = [
    { label: "Present", value: `${c.present}/${c.total}`, sub: `${c.total ? Math.round((c.present / c.total) * 100) : 0}% slots`, cls: "text-emerald-700" },
    { label: "🟢 On duty now", value: c.onDuty, sub: `🏁 ${c.completed} complete`, cls: "text-emerald-700" },
    { label: "⏳ Not reported", value: c.pending, sub: "Duty ON not started", cls: c.pending ? "text-amber-600" : "text-slate-900" },
    { label: "🏖️ Leave / ❌ Absent", value: `${c.leave} / ${c.absent}`, sub: `${c.off} off`, cls: "text-sky-700" },
    { label: "⏰ Late", value: c.late, sub: "Duty ON late", cls: c.late ? "text-amber-600" : "text-slate-900" },
    { label: "⚠️ Early OFF", value: c.earlyOff, sub: "before the time", cls: c.earlyOff ? "text-rose-600" : "text-slate-900" },
  ];
  return (
    <div className={cx("grid gap-2.5", compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6")}>
      {cards.map((k) => (
        <div key={k.label} className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k.label}</div>
          <div className={cx("mt-0.5 font-bold tabular-nums", compact ? "text-[22px]" : "text-[26px]", k.cls)}>{k.value}</div>
          <div className="text-[11.5px] text-slate-400">{k.sub}</div>
        </div>
      ))}
    </div>
  );
}

export function DailyExceptions({ report, limit = 8 }: { report: DailyReport; limit?: number }) {
  const early = report.rows.filter((r) => r.earlyOffMinutes >= EARLY_OFF_ALERT_MIN);
  const late = report.rows.filter((r) => r.lateMinutes > 0).sort((a, b) => b.lateMinutes - a.lateMinutes);
  const away = report.rows.filter((r) => r.status === "leave" || r.status === "absent");
  const pending = report.rows.filter((r) => r.status === "pending");
  const who = (r: DailyRow) => `${r.cabNumber}${r.driverName ? ` · ${r.driverName}` : ""} ${r.shiftType === "day" ? "☀️" : "🌙"}`;
  const groups = [
    { title: "⚠️ Duty OFF before time", rows: early, cls: "border-rose-200 bg-rose-50", txt: (r: DailyRow) => `${minutesToLabel(r.earlyOffMinutes)} early · OFF ${r.actualOut} (time ${r.scheduledOut})` },
    { title: "⏰ Late Duty ON", rows: late, cls: "border-amber-200 bg-amber-50", txt: (r: DailyRow) => `+${minutesToLabel(r.lateMinutes)} · ON ${r.actualIn} (time ${r.scheduledIn})` },
    { title: "🏖️ Leave / ❌ Absent", rows: away, cls: "border-sky-200 bg-sky-50", txt: (r: DailyRow) => `${r.status === "leave" ? "Leave" : "Absent"}${r.reason ? ` · ${r.reason}` : ""}` },
    { title: "⏳ Not reported yet", rows: pending, cls: "border-slate-200 bg-slate-50", txt: (r: DailyRow) => `time ${r.scheduledIn}` },
  ].filter((g) => g.rows.length);
  if (!groups.length) {
    return <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-800">✅ All good — no late arrivals, early OFFs, leave or pending entries.</div>;
  }
  return (
    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
      {groups.map((g) => (
        <div key={g.title} className={cx("rounded-2xl border px-4 py-3", g.cls)}>
          <div className="text-[13px] font-bold text-slate-900">
            {g.title} <span className="font-semibold text-slate-500">({g.rows.length})</span>
          </div>
          <ul className="mt-1.5 space-y-1">
            {g.rows.slice(0, limit).map((r) => (
              <li key={`${r.cabId}-${r.shiftType}`} className="text-[12.5px] text-slate-700">
                <b>{who(r)}</b> — {g.txt(r)}
              </li>
            ))}
            {g.rows.length > limit ? <li className="text-[12px] text-slate-500">+{g.rows.length - limit} more…</li> : null}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function DailyTable({ report }: { report: DailyReport }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[920px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-[10.5px] uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2.5">Cab</th>
            <th className="px-3 py-2.5">Shift / time</th>
            <th className="px-3 py-2.5">Driver</th>
            <th className="px-3 py-2.5">Duty ON</th>
            <th className="px-3 py-2.5">Duty OFF</th>
            <th className="px-3 py-2.5">Hours</th>
            <th className="px-3 py-2.5">Status</th>
            <th className="px-4 py-2.5">Remarks</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-10 text-center text-slate-400">No data for this day.</td>
            </tr>
          ) : (
            report.rows.map((r) => {
              const st = dailyStatus(r);
              return (
                <tr key={`${r.cabId}-${r.shiftType}`} className={cx("border-b border-slate-100 last:border-0", r.earlyOffMinutes >= EARLY_OFF_ALERT_MIN && "bg-rose-50/50")}>
                  <td className="px-4 py-2.5">
                    <div className="font-bold text-slate-900">{r.cabNumber}</div>
                    {r.owner ? <div className="text-[11px] text-slate-400">👤 {r.owner}</div> : null}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">
                    {r.shiftType === "day" ? "☀️" : "🌙"} {r.scheduledIn}–{r.scheduledOut}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-slate-800">{r.driverName ?? <span className="text-amber-600">—</span>}</div>
                    {r.driverPhone ? <div className="text-[11px] text-slate-400">{r.driverPhone}</div> : null}
                  </td>
                  <td className="px-3 py-2.5 font-semibold tabular-nums">{r.actualIn ?? "—"}</td>
                  <td className="px-3 py-2.5 font-semibold tabular-nums">{r.actualOut ?? (r.onDuty ? <span className="text-emerald-600">running</span> : "—")}</td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-700">{r.dutyMinutes !== null ? minutesToLabel(r.dutyMinutes) : "—"}</td>
                  <td className="px-3 py-2.5">
                    <span className={cx("rounded-full px-2.5 py-1 text-[11.5px] font-semibold", st.cls)}>{st.label}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-1">
                      {r.lateMinutes > 0 ? <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">Late {minutesToLabel(r.lateMinutes)}</span> : null}
                      {r.earlyOffMinutes >= EARLY_OFF_ALERT_MIN ? <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[11px] font-bold text-rose-700">Early {minutesToLabel(r.earlyOffMinutes)}</span> : null}
                      {r.overtimeMinutes > 0 ? <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-[11px] font-bold text-sky-700">OT {minutesToLabel(r.overtimeMinutes)}</span> : null}
                      {SRC[r.source] ? <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">{SRC[r.source]}</span> : null}
                    </div>
                    {r.reason || r.notes ? <div className="mt-0.5 max-w-[260px] text-[11.5px] text-slate-500">{[r.reason, r.notes].filter(Boolean).join(" · ")}</div> : null}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
