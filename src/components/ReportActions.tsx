"use client";

import type { DailyReport } from "@/lib/data";
import { EARLY_OFF_ALERT_MIN, minutesToLabel } from "@/lib/tracking";

export function reportText(report: DailyReport, dateLabel: string): string {
  const c = report.counts;
  const who = (r: DailyReport["rows"][number]) => `${r.cabNumber}${r.driverName ? ` ${r.driverName}` : ""}`;
  const early = report.rows.filter((r) => r.earlyOffMinutes >= EARLY_OFF_ALERT_MIN);
  const late = report.rows.filter((r) => r.lateMinutes > 0);
  const pending = report.rows.filter((r) => r.status === "pending");
  const away = report.rows.filter((r) => r.status === "leave" || r.status === "absent");
  const lines = [
    `🚕 *CabTrack Daily Report* — ${dateLabel}`,
    `✅ Present: ${c.present}/${c.total}  (🟢 on duty: ${c.onDuty}, 🏁 complete: ${c.completed})`,
    `🏖️ Leave: ${c.leave} · ❌ Absent: ${c.absent} · ⏳ Not reported: ${c.pending}`,
  ];
  if (late.length) lines.push(`⏰ Late (${late.length}): ${late.slice(0, 10).map((r) => `${who(r)} +${minutesToLabel(r.lateMinutes)}`).join(", ")}`);
  if (early.length) lines.push(`⚠️ Early OFF (${early.length}): ${early.slice(0, 10).map((r) => `${who(r)} ${minutesToLabel(r.earlyOffMinutes)} early`).join(", ")}`);
  if (away.length) lines.push(`🏖️ Leave/Absent: ${away.slice(0, 10).map(who).join(", ")}`);
  if (pending.length) lines.push(`⏳ Not reported: ${pending.slice(0, 12).map((r) => r.cabNumber).join(", ")}${pending.length > 12 ? " …" : ""}`);
  return lines.join("\n");
}

export function ReportActions({ report, dateLabel, compact = false }: { report: DailyReport; dateLabel: string; compact?: boolean }) {
  const csv = () => {
    const head = ["Date", "Cab", "Owner", "Shift", "Time", "Driver", "Phone", "Duty ON", "Duty OFF", "Hours", "Status", "Late (min)", "Early off (min)", "OT (min)", "Source", "Reason", "Notes"];
    const rows = report.rows.map((r) => [
      report.date, r.cabNumber, r.owner, r.shiftType === "day" ? "Day" : "Night", `${r.scheduledIn}-${r.scheduledOut}`,
      r.driverName ?? "", r.driverPhone ?? "", r.actualIn ?? "", r.actualOut ?? "",
      r.dutyMinutes !== null ? (r.dutyMinutes / 60).toFixed(2) : "",
      r.onDuty ? "On duty" : r.status, r.lateMinutes, r.earlyOffMinutes, r.overtimeMinutes, r.source, r.reason, r.notes,
    ]);
    const text = [head, ...rows].map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-report-${report.date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const wa = `https://wa.me/?text=${encodeURIComponent(reportText(report, dateLabel))}`;
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <a href={wa} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-emerald-500">
        💬 Send on WhatsApp
      </a>
      {!compact ? (
        <>
          <button onClick={csv} className="rounded-xl bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
            ⬇️ Excel / CSV
          </button>
          <button onClick={() => window.print()} className="rounded-xl bg-slate-900 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-slate-800">
            🖨️ Print
          </button>
        </>
      ) : null}
    </div>
  );
}
