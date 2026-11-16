import { isAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/AppShell";
import { DateNav } from "@/components/DateNav";
import { DailyExceptions, DailySummary, DailyTable, ReportTabs } from "@/components/DailyReportView";
import { ReportActions } from "@/components/ReportActions";
import { ReportControls } from "@/components/ReportControls";
import { CsvButton } from "@/components/CsvButton";
import { StatCard } from "@/components/StatCard";
import { HorizontalBars, StackedBarChart } from "@/components/charts";
import { Card, CardHeader } from "@/components/ui";
import {
  getAttendanceRange,
  getCabPerformance,
  getCabs,
  getDailyReport,
  getDriverPerformance,
  getDrivers,
} from "@/lib/data";
import { pct } from "@/lib/cx";
import {
  SHIFT_LABEL,
  formatDateLabel,
  formatDateShort,
  formatTime,
  isIsoDate,
  minutesToLabel,
  shiftDate,
  todayIso,
  type ShiftType,
} from "@/lib/tracking";

export const dynamic = "force-dynamic";

async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; view?: string; date?: string }>;
}) {
  const sp = await searchParams;
  const today = todayIso();
  const to = sp.to && isIsoDate(sp.to) ? sp.to : today;
  const from =
    sp.from && isIsoDate(sp.from) && sp.from <= to
      ? sp.from
      : shiftDate(today, -29);

  const [records, cabPerf, driverPerf, cabList, driverList] = await Promise.all([
    getAttendanceRange(from, to),
    getCabPerformance(from, to),
    getDriverPerformance(from, to),
    getCabs(),
    getDrivers(),
  ]);
  const cabName = new Map(cabList.map((c) => [c.id, c.cabNumber]));
  const cabOwner = new Map(cabList.map((c) => [c.id, c.ownerName]));
  const drvName = new Map(driverList.map((d) => [d.id, d.name]));

  const active = records.filter((r) => r.status !== "off");
  const present = active.filter((r) => r.status === "present");
  const absent = active.filter((r) => r.status === "absent");
  const leave = active.filter((r) => r.status === "leave");
  const half = active.filter((r) => r.status === "half_day");
  const pending = active.filter((r) => r.status === "pending");
  const late = present.filter((r) => r.lateMinutes > 0);
  const totalOt = active.reduce((s, r) => s + r.overtimeMinutes, 0);

  const dayCount = new Set(records.map((r) => r.date)).size || 1;

  /* daily breakdown */
  const dayMap = new Map<
    string,
    { date: string; presentDay: number; presentNight: number; absent: number; pending: number }
  >();
  for (const r of active) {
    const row =
      dayMap.get(r.date) ??
      { date: r.date, presentDay: 0, presentNight: 0, absent: 0, pending: 0 };
    if (r.status === "present") {
      if (r.shiftType === "day") row.presentDay += 1;
      else row.presentNight += 1;
    } else if (r.status === "pending") row.pending += 1;
    else row.absent += 1;
    dayMap.set(r.date, row);
  }
  const daily = [...dayMap.values()].sort((a, b) => (a.date < b.date ? 1 : -1));

  const cabCsv = [
    [
      "Cab number",
      "Model",
      "Owner",
      "Slots",
      "Present",
      "Absent",
      "Leave",
      "Half day",
      "Pending",
      "Late",
      "Attendance %",
      "On-time %",
    ].join(","),
    ...cabPerf.map((c) =>
      [
        c.cab.cabNumber,
        c.cab.model,
        c.cab.ownerName,
        c.slots,
        c.present,
        c.absent,
        c.leave,
        c.halfDay,
        c.pending,
        c.late,
        c.attendanceRate,
        c.onTimeRate,
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(","),
    ),
  ].join("\n");

  const recordCsv = [
    [
      "Date",
      "Cab",
      "Owner",
      "Shift",
      "Scheduled in",
      "Scheduled out",
      "Actual in",
      "Actual out",
      "Status",
      "Late min",
      "OT min",
      "Driver",
      "Reason",
      "Notes",
    ].join(","),
    ...records.map((r) =>
      [
        r.date,
        cabName.get(r.cabId) ?? "",
        cabOwner.get(r.cabId) ?? "",
        SHIFT_LABEL[r.shiftType as ShiftType],
        r.scheduledIn,
        r.scheduledOut,
        r.actualIn ?? "",
        r.actualOut ?? "",
        r.status,
        r.lateMinutes,
        r.overtimeMinutes,
        r.driverId ? (drvName.get(r.driverId) ?? "") : "",
        r.reason,
        r.notes,
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(","),
    ),
  ].join("\n");

  return (
    <>
      <ReportTabs active="range" />
      <PageHeader
        title="Date range report"
        subtitle={`${formatDateLabel(from)} → ${formatDateLabel(to)} · ${dayCount} days`}
      >
        <ReportControls />
        <CsvButton
          filename={`cab-report-${from}-to-${to}.csv`}
          content={cabCsv}
          label="⬇️ Cab summary"
        />
        <CsvButton
          filename={`cab-attendance-${from}-to-${to}.csv`}
          content={recordCsv}
          label="⬇️ Full records"
        />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Present"
          value={present.length}
          icon="✅"
          accent="emerald"
          sub={`${pct(present.length, active.length)}% of slots`}
        />
        <StatCard
          label="Absent"
          value={absent.length}
          icon="🚫"
          accent="rose"
          sub={`${leave.length} leave · ${half.length} half day`}
        />
        <StatCard
          label="Late arrivals"
          value={late.length}
          icon="⏰"
          accent="rose"
          sub={
            late.length
              ? `Avg ${minutesToLabel(
                  Math.round(
                    late.reduce((s, r) => s + r.lateMinutes, 0) / late.length,
                  ),
                )} late`
              : "No late"
          }
        />
        <StatCard
          label="On-time rate"
          value={`${pct(present.length - late.length, Math.max(1, present.length))}%`}
          icon="🎯"
          accent="sky"
          sub={`${present.length - late.length} of ${present.length}`}
        />
        <StatCard
          label="Pending fill"
          value={pending.length}
          icon="⏳"
          accent="amber"
          sub="Unfilled slots"
        />
        <StatCard
          label="Total overtime"
          value={minutesToLabel(totalOt)}
          icon="⏱️"
          accent="violet"
          sub={`${Math.round(totalOt / 60)} hours`}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon="📅"
            title="Day-by-day breakdown"
            subtitle="How many cabs came each day — day and night shown separately"
          />
          <div className="px-5 py-4">
            {daily.length ? (
              <StackedBarChart
                height={170}
                data={daily
                  .slice()
                  .reverse()
                  .map((d) => ({
                    label: formatDateShort(d.date),
                    sublabel: formatDateLabel(d.date),
                    segments: [
                      { value: d.presentDay, color: "bg-amber-400", label: "Day" },
                      { value: d.presentNight, color: "bg-indigo-500", label: "Night" },
                      { value: d.absent, color: "bg-rose-400", label: "Absent" },
                      { value: d.pending, color: "bg-slate-200", label: "Pending" },
                    ],
                  }))}
              />
            ) : (
              <p className="py-10 text-center text-[13px] text-slate-400">
                No records in this range.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader icon="🏆" title="Best attendance" subtitle="Cab-wise %" />
          <div className="px-5 py-4">
            <HorizontalBars
              data={cabPerf
                .filter((c) => c.slots > 0)
                .sort((a, b) => b.attendanceRate - a.attendanceRate)
                .slice(0, 8)
                .map((c) => ({
                  label: c.cab.cabNumber,
                  sublabel: `${c.present}/${c.slots}`,
                  value: c.attendanceRate,
                  color: c.cab.color,
                }))}
            />
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader
            icon="🚕"
            title="Cab-wise summary"
            subtitle={`${from} → ${to}`}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5 font-semibold">Cab</th>
                  <th className="px-3 py-2.5 font-semibold">Slots</th>
                  <th className="px-3 py-2.5 font-semibold">Present</th>
                  <th className="px-3 py-2.5 font-semibold">Absent</th>
                  <th className="px-3 py-2.5 font-semibold">Leave</th>
                  <th className="px-3 py-2.5 font-semibold">Half</th>
                  <th className="px-3 py-2.5 font-semibold">Pending</th>
                  <th className="px-3 py-2.5 font-semibold">Late</th>
                  <th className="px-3 py-2.5 font-semibold">Avg late</th>
                  <th className="px-3 py-2.5 font-semibold">Attendance</th>
                  <th className="px-5 py-2.5 font-semibold">On-time</th>
                </tr>
              </thead>
              <tbody>
                {cabPerf.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-5 py-10 text-center text-slate-400">
                      No cabs.
                    </td>
                  </tr>
                ) : (
                  cabPerf.map((c) => (
                    <tr
                      key={c.cab.id}
                      className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50"
                    >
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="grid size-7 place-items-center rounded-lg text-[12px] text-white"
                            style={{ background: c.cab.color }}
                          >
                            🚕
                          </span>
                          <div>
                            <div className="font-semibold text-slate-900">
                              {c.cab.cabNumber}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {[c.cab.model, c.cab.ownerName ? `👤 ${c.cab.ownerName}` : ""].filter(Boolean).join(" · ") || "—"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">{c.slots}</td>
                      <td className="px-3 py-2.5 font-semibold tabular-nums text-emerald-700">
                        {c.present}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-rose-600">
                        {c.absent}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-sky-600">
                        {c.leave}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-violet-600">
                        {c.halfDay}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-amber-600">
                        {c.pending}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">{c.late}</td>
                      <td className="px-3 py-2.5 tabular-nums text-slate-500">
                        {c.avgLateMinutes ? minutesToLabel(c.avgLateMinutes) : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-semibold tabular-nums">
                          {c.attendanceRate}%
                        </span>
                      </td>
                      <td className="px-5 py-2.5">
                        <span
                          className={
                            c.onTimeRate >= 90
                              ? "font-semibold tabular-nums text-emerald-600"
                              : c.onTimeRate >= 70
                                ? "font-semibold tabular-nums text-amber-600"
                                : "font-semibold tabular-nums text-rose-600"
                          }
                        >
                          {c.onTimeRate}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader icon="🧑‍✈️" title="Driver-wise duties" subtitle="Present shifts only" />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5 font-semibold">Driver</th>
                  <th className="px-3 py-2.5 font-semibold">Duties</th>
                  <th className="px-3 py-2.5 font-semibold">Late</th>
                  <th className="px-5 py-2.5 font-semibold">Cabs</th>
                </tr>
              </thead>
              <tbody>
                {driverPerf.filter((d) => d.duties > 0).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-slate-400">
                      No duty records.
                    </td>
                  </tr>
                ) : (
                  driverPerf
                    .filter((d) => d.duties > 0)
                    .map((d) => (
                      <tr
                        key={d.driver.id}
                        className="border-b border-slate-50 last:border-0"
                      >
                        <td className="px-5 py-2.5 font-semibold text-slate-900">
                          {d.driver.name}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">{d.duties}</td>
                        <td className="px-3 py-2.5">
                          {d.late > 0 ? (
                            <span className="font-semibold tabular-nums text-rose-600">
                              {d.late}
                            </span>
                          ) : (
                            <span className="text-emerald-600">0</span>
                          )}
                        </td>
                        <td className="px-5 py-2.5 text-[12px] text-slate-600">
                          {d.cabs.join(", ")}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader
            icon="📆"
            title="Daily log"
            subtitle="Newest first · full record"
          />
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-100 text-[10.5px] uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5 font-semibold">Date</th>
                  <th className="px-3 py-2.5 font-semibold">Day</th>
                  <th className="px-3 py-2.5 font-semibold">Night</th>
                  <th className="px-3 py-2.5 font-semibold">Absent</th>
                  <th className="px-5 py-2.5 font-semibold">Pending</th>
                </tr>
              </thead>
              <tbody>
                {daily.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-slate-400">
                      No records.
                    </td>
                  </tr>
                ) : (
                  daily.map((d) => (
                    <tr key={d.date} className="border-b border-slate-50 last:border-0">
                      <td className="px-5 py-2 font-medium text-slate-700">
                        {formatDateLabel(d.date)}
                      </td>
                      <td className="px-3 py-2 font-semibold tabular-nums text-amber-600">
                        {d.presentDay}
                      </td>
                      <td className="px-3 py-2 font-semibold tabular-nums text-indigo-600">
                        {d.presentNight}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-rose-600">
                        {d.absent}
                      </td>
                      <td className="px-5 py-2 tabular-nums text-slate-400">
                        {d.pending}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <p className="mt-4 text-[12px] text-slate-400">
        Tip: <span className="font-medium">{formatTime("07:00")}</span>-style
        scheduled times are set per cab on the Cabs page — if you change them, future daily sheets update automatically.
      </p>
    </>
  );
}

export default async function Page(props: Parameters<typeof ReportsPage>[0]) {
  if (!(await isAdmin())) return null;
  const sp = await props.searchParams;
  if (sp.view !== "range") return DailyReportPage(sp.date);
  return ReportsPage(props);
}

async function DailyReportPage(dateParam?: string) {
  const date = dateParam && isIsoDate(dateParam) ? dateParam : todayIso();
  const report = await getDailyReport(date);
  const label = formatDateLabel(date);
  return (
    <>
      <ReportTabs active="daily" />
      <PageHeader title="Daily report" subtitle={`${label} · ${report.counts.total} shift slots · duty ${minutesToLabel(report.totalDutyMinutes)} total`}>
        <DateNav basePath="/reports" extraParams={{ view: "daily" }} />
      </PageHeader>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="hidden text-[18px] font-bold print:block">🚕 CabTrack — Daily report · {label}</p>
        <ReportActions report={report} dateLabel={label} />
      </div>
      <DailySummary report={report} />
      <div className="mt-4">
        <DailyExceptions report={report} limit={20} />
      </div>
      <h2 className="mb-2 mt-6 text-[16px] font-bold text-slate-900">Details per cab</h2>
      <DailyTable report={report} />
    </>
  );
}
