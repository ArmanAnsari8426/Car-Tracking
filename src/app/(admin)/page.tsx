import { isAdmin } from "@/lib/auth";
import Link from "next/link";
import { PageHeader } from "@/components/AppShell";
import { DateNav } from "@/components/DateNav";
import { StatCard } from "@/components/StatCard";
import { CabCard } from "@/components/CabCards";
import {
  AreaTrend,
  DonutChart,
  HorizontalBars,
  Legend,
  StackedBarChart,
} from "@/components/charts";
import { Badge, Button, Card, CardHeader, EmptyState } from "@/components/ui";
import { pct } from "@/lib/cx";
import {
  getCabPerformance,
  getDailyReport,
  getDataIssues,
  getDriverPerformance,
  getDrivers,
  getLateArrivals,
  getLatestDataDate,
  getSheet,
  getTrend,
} from "@/lib/data";
import { cx, timeAgo } from "@/lib/cx";
import { listNotifications } from "@/lib/notify";
import { DailyExceptions, DailySummary } from "@/components/DailyReportView";
import { ReportActions } from "@/components/ReportActions";
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

const TREND_DAYS = 14;
const RANGE_DAYS = 30;

async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  let date = sp.date && isIsoDate(sp.date) ? sp.date : todayIso();
  if (!sp.date) {
    // If there is no data for today, show the latest date that has data
    const latest = await getLatestDataDate();
    if (latest && latest < date) {
      const todays = await getSheet(date);
      if (!todays.some((e) => e.status !== "pending" && e.status !== "off")) date = latest;
    }
  }
  const from = shiftDate(date, -(RANGE_DAYS - 1));
  const trendFrom = shiftDate(date, -(TREND_DAYS - 1));

  const [sheet, trend, performance, driverPerf, late, allDrivers] = await Promise.all([
    getSheet(date),
    getTrend(date, TREND_DAYS),
    getCabPerformance(from, date),
    getDriverPerformance(from, date),
    getLateArrivals(trendFrom, date, 6),
    getDrivers(),
  ]);

  const [issues, report, latestNotes] = await Promise.all([getDataIssues(), getDailyReport(date), listNotifications(undefined, 8)]);
  const activeEntries = sheet.filter((e) => e.status !== "off");
  const working = activeEntries.filter(
    (e) => e.status === "present" || e.status === "half_day",
  );
  const present = activeEntries.filter((e) => e.status === "present");
  const absent = activeEntries.filter(
    (e) => e.status === "absent" || e.status === "leave",
  );
  const halfDay = activeEntries.filter((e) => e.status === "half_day");
  const pending = activeEntries.filter((e) => e.status === "pending");
  const lateToday = present.filter((e) => e.lateMinutes > 0);

  const dayEntries = activeEntries.filter((e) => e.shiftType === "day");
  const nightEntries = activeEntries.filter((e) => e.shiftType === "night");
  const dayPresent = dayEntries.filter((e) => e.status === "present");
  const nightPresent = nightEntries.filter((e) => e.status === "present");
  const dayLate = dayPresent.filter((e) => e.lateMinutes > 0);
  const nightLate = nightPresent.filter((e) => e.lateMinutes > 0);

  const cabCount = new Set(sheet.map((e) => e.cab.id)).size;
  const totalSlots = activeEntries.length;

  if (cabCount === 0) {
    return (
      <>
        <PageHeader
          title="Dashboard"
          subtitle="Daily cab arrival tracking — day & night shifts, drivers, late arrivals"
        />
        <Card>
          <EmptyState
            icon="🚕"
            title="No data yet"
            description="Upload your Excel / CSV sheet — cabs, drivers and daily timings will appear here. Or add a cab manually."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Link href="/upload">
                  <Button variant="primary">📤 Upload your sheet</Button>
                </Link>
                <Link href="/cabs">
                  <Button variant="secondary">+ Add your first cab</Button>
                </Link>
              </div>
            }
          />
        </Card>
      </>
    );
  }

  const trendData = trend.map((t) => ({
    label: formatDateShort(t.date),
    sublabel: formatDateLabel(t.date),
    segments: [
      { value: t.presentDay, color: "bg-amber-400", label: "Day present" },
      { value: t.presentNight, color: "bg-indigo-500", label: "Night present" },
      { value: t.absent, color: "bg-rose-400", label: "Absent / leave" },
      { value: t.pending, color: "bg-slate-200", label: "Pending" },
    ],
  }));

  const donutData = [
    { label: "Present", value: present.length, color: "#10b981" },
    { label: "Half day", value: halfDay.length, color: "#8b5cf6" },
    { label: "Absent / leave", value: absent.length, color: "#f43f5e" },
    { label: "Pending", value: pending.length, color: "#fbbf24" },
  ].filter((d) => d.value > 0);

  const rangePresent = performance.reduce((s, c) => s + c.present, 0);
  const rangeSlots = performance.reduce((s, c) => s + c.slots, 0);
  const rangeLate = performance.reduce((s, c) => s + c.late, 0);

  const cabBars = performance
    .filter((c) => c.slots > 0)
    .sort((a, b) => b.attendanceRate - a.attendanceRate)
    .slice(0, 8)
    .map((c) => ({
      label: c.cab.cabNumber,
      sublabel: `${c.present}/${c.slots} days`,
      value: c.attendanceRate,
      color: c.cab.color,
    }));

  const topDrivers = driverPerf.filter((d) => d.duties > 0).slice(0, 6);

  const trendValues = trend.map((t) => t.presentDay + t.presentNight);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${formatDateLabel(date)} · ${cabCount} cabs · day & night tracking`}
      >
        <DateNav basePath="/" />
        <Link href="/attendance">
          <Button variant="primary">📝 Mark attendance</Button>
        </Link>
      </PageHeader>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Total cabs"
          value={cabCount}
          icon="🚕"
          accent="slate"
          sub={`${totalSlots} shift slots today`}
        />
        <StatCard
          label="Day shift ☀️"
          value={`${dayPresent.length}/${dayEntries.length}`}
          icon="☀️"
          accent="amber"
          sub={`${dayLate.length} late · ${pct(dayPresent.length, dayEntries.length)}% on duty`}
        />
        <StatCard
          label="Night shift 🌙"
          value={`${nightPresent.length}/${nightEntries.length}`}
          icon="🌙"
          accent="indigo"
          sub={`${nightLate.length} late · ${pct(nightPresent.length, nightEntries.length)}% on duty`}
        />
        <StatCard
          label="Late arrivals"
          value={lateToday.length}
          icon="⏰"
          accent="rose"
          sub={
            lateToday.length
              ? `Max ${minutesToLabel(Math.max(...lateToday.map((e) => e.lateMinutes)))} late`
              : "All on time 👍"
          }
        />
        <StatCard
          label="Absent / leave"
          value={absent.length}
          icon="🚫"
          accent="rose"
          sub={`${halfDay.length} half day`}
        />
        <StatCard
          label="Pending fill"
          value={pending.length}
          icon="⏳"
          accent="amber"
          sub={pending.length ? "Enter the times in the sheet" : "All filled ✅"}
        />
      </div>

      {issues.noDriver.length || issues.pastPending || issues.licences.length ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="text-[13px] font-bold text-amber-900">🔎 Data check — please review</div>
          <ul className="mt-1.5 space-y-1 text-[12.5px] text-amber-900">
            {issues.noDriver.length ? (
              <li>
                🧑‍✈️ <b>{issues.noDriver.length}</b> cabs have no regular driver (
                {issues.noDriver
                  .slice(0, 4)
                  .map((x) => `${x.cabNumber} ${x.shifts.map((st) => (st === "day" ? "☀️" : "🌙")).join("")}`)
                  .join(", ")}
                {issues.noDriver.length > 4 ? " …" : ""}) —{" "}
                <Link href="/upload" className="font-semibold underline">upload a cab list</Link> ya{" "}
                <Link href="/cabs" className="font-semibold underline">Cabs page</Link> or choose on the Cabs page
              </li>
            ) : null}
            {issues.pastPending ? (
              <li>
                ⏳ <b>{issues.pastPending}</b> slots from the last 7 days are still pending —{" "}
                <Link href={`/attendance?date=${shiftDate(todayIso(), -1)}`} className="font-semibold underline">fill the sheet</Link>
              </li>
            ) : null}
            {issues.licences.length ? (
              <li>
                🪪 Licence:{" "}
                {issues.licences.map((l) => `${l.name} (${l.expired ? "expired" : "expiring soon"} ${l.expiry})`).join(", ")}
              </li>
            ) : null}
          </ul>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-[13px] font-semibold text-emerald-800">
          ✅ Data check: every cab has a driver and no slots are pending from the last 7 days.
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon="📋"
            title={`Today's report — ${formatDateLabel(date)}`}
            subtitle="Built automatically from driver Duty ON / OFF"
            right={
              <>
                <ReportActions report={report} dateLabel={formatDateLabel(date)} compact />
                <Link href={`/reports?view=daily&date=${date}`}>
                  <Button size="sm" variant="secondary">Full report →</Button>
                </Link>
              </>
            }
          />
          <div className="space-y-3 p-5">
            <DailySummary report={report} compact />
            <DailyExceptions report={report} limit={5} />
          </div>
        </Card>
        <Card>
          <CardHeader
            icon="🔔"
            title="Live updates"
            subtitle="Driver actions — live"
            right={
              <Link href="/share">
                <Button size="sm" variant="ghost">Driver link →</Button>
              </Link>
            }
          />
          <div className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
            {latestNotes.length === 0 ? (
              <EmptyState icon="📱" title="No updates yet" description="Send drivers the Driver Form link — their Duty ON / OFF will show here live." />
            ) : (
              latestNotes.map((n) => (
                <div key={n.id} className={cx("px-5 py-3", n.type === "early_off" && "bg-rose-50", (n.type === "late" || n.type === "not_reported") && "bg-amber-50/60")}>
                  <div className="text-[13px] font-semibold text-slate-900">{n.title}</div>
                  {n.message ? <div className="text-[12px] text-slate-500">{n.message}</div> : null}
                  <div className="mt-0.5 text-[10.5px] text-slate-400">{timeAgo(n.createdAt)}</div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* charts */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon="📈"
            title={`Last ${TREND_DAYS} days — who came, when`}
            subtitle="Day present vs night present vs absent"
            right={
              <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200" dot="bg-emerald-500">
                {pct(rangePresent, rangeSlots)}% attendance ({RANGE_DAYS}d)
              </Badge>
            }
          />
          <div className="px-5 py-4">
            <StackedBarChart data={trendData} height={186} highlightIndex={TREND_DAYS - 1} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <Legend
                items={[
                  { label: "Day present", color: "#fbbf24" },
                  { label: "Night present", color: "#6366f1" },
                  { label: "Absent / leave", color: "#fb7185" },
                  { label: "Pending", color: "#e2e8f0" },
                ]}
              />
              <div className="flex items-end gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Avg / day
                  </div>
                  <div className="text-[15px] font-bold text-slate-900">
                    {Math.round(
                      trend.reduce((s, t) => s + t.presentDay + t.presentNight, 0) /
                        TREND_DAYS,
                    )}
                  </div>
                </div>
                <div className="h-9 w-24">
                  <AreaTrend data={trendValues} color="#6366f1" height={36} />
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader icon="🍩" title="Today's status" subtitle={formatDateLabel(date)} />
          <div className="px-5 py-5">
            {donutData.length ? (
              <DonutChart
                data={donutData}
                centerValue={String(working.length)}
                centerLabel="on duty"
              />
            ) : (
              <EmptyState
                icon="⏳"
                title="Nothing filled yet"
                description="This date's sheet has not been generated yet."
                action={<Link href="/attendance"><Button variant="primary">Open sheet</Button></Link>}
              />
            )}
          </div>
        </Card>
      </div>

      {/* cab performance + late arrivals */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon="🏆"
            title="Cab-wise attendance"
            subtitle={`Last ${RANGE_DAYS} days · ${rangeLate} late arrivals`}
            right={
              <Link href="/reports">
                <Button size="sm" variant="ghost">
                  Full report →
                </Button>
              </Link>
            }
          />
          <div className="px-5 py-4">
            {cabBars.length ? (
              <HorizontalBars data={cabBars} />
            ) : (
              <EmptyState icon="📭" title="No records yet" />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader icon="⏰" title="Late arrivals" subtitle={`Last ${TREND_DAYS} days`} />
          <div className="divide-y divide-slate-100">
            {late.length === 0 ? (
              <EmptyState icon="✅" title="No late arrivals" description="All cabs are arriving on time." />
            ) : (
              late.map((l) => (
                <div key={l.record.id} className="flex items-center gap-3 px-5 py-3">
                  <span
                    className="grid size-9 shrink-0 place-items-center rounded-xl text-sm text-white"
                    style={{ background: l.cab.color }}
                  >
                    🚕
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-slate-800">
                      {l.cab.cabNumber}
                    </div>
                    <div className="truncate text-[11px] text-slate-500">
                      {SHIFT_LABEL[l.record.shiftType as ShiftType]} ·{" "}
                      {formatTime(l.record.scheduledIn)} → {formatTime(l.record.actualIn)} ·{" "}
                      {l.driver?.name ?? "no driver"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] font-bold tabular-nums text-rose-600">
                      +{minutesToLabel(l.record.lateMinutes)}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {formatDateShort(l.record.date)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* live cab grid */}
      <div className="mt-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[17px] font-bold tracking-tight text-slate-900">
            Live cab status — {formatDateLabel(date)}
          </h2>
          <Link
            href="/attendance"
            className="text-[12.5px] font-semibold text-indigo-600 hover:text-indigo-500"
          >
            Mark attendance →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[...new Map(sheet.map((e) => [e.cab.id, e.cab])).values()].map((cab) => {
            const pair = sheet.filter((e) => e.cab.id === cab.id);
            return (
              <CabCard
                key={cab.id}
                cabNumber={cab.cabNumber}
                model={cab.model}
                owner={cab.ownerName}
                color={cab.color}
                entries={pair}
                drivers={allDrivers}
                presentCount={pair.filter((p) => p.status === "present" || p.status === "half_day").length}
                slotCount={pair.length}
              />
            );
          })}
        </div>
      </div>

      {/* drivers */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon="🧑‍✈️"
            title="Top drivers"
            subtitle={`Duties completed in last ${RANGE_DAYS} days`}
            right={
              <Link href="/drivers">
                <Button size="sm" variant="ghost">
                  All drivers →
                </Button>
              </Link>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-2.5 font-semibold">Driver</th>
                  <th className="px-3 py-2.5 font-semibold">Duties</th>
                  <th className="px-3 py-2.5 font-semibold">Late</th>
                  <th className="px-5 py-2.5 font-semibold">Cabs driven</th>
                </tr>
              </thead>
              <tbody>
                {topDrivers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-slate-400">
                      No duties recorded
                    </td>
                  </tr>
                ) : (
                  topDrivers.map((d) => (
                    <tr key={d.driver.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="grid size-7 place-items-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
                            {d.driver.name.slice(0, 1)}
                          </span>
                          <div>
                            <div className="font-semibold text-slate-800">{d.driver.name}</div>
                            <div className="text-[11px] text-slate-400">{d.driver.phone}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-semibold tabular-nums text-slate-900">
                        {d.duties}
                      </td>
                      <td className="px-3 py-2.5">
                        {d.late > 0 ? (
                          <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-bold text-rose-600">
                            {d.late}
                          </span>
                        ) : (
                          <span className="text-[11px] text-emerald-600">0</span>
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-[12px] text-slate-600">
                        {d.cabs.slice(0, 3).join(", ")}
                        {d.cabs.length > 3 ? ` +${d.cabs.length - 3}` : ""}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader icon="🧠" title="Quick insights" subtitle="Auto-generated for today" />
          <div className="space-y-3 px-5 py-4">
            <Insight
              tone="emerald"
              title="Best attendance"
              text={
                performance.filter((c) => c.slots > 0).sort((a, b) => b.attendanceRate - a.attendanceRate)[0]
                  ? `${
                      performance
                        .filter((c) => c.slots > 0)
                        .sort((a, b) => b.attendanceRate - a.attendanceRate)[0].cab.cabNumber
                    } — ${
                      performance
                        .filter((c) => c.slots > 0)
                        .sort((a, b) => b.attendanceRate - a.attendanceRate)[0].attendanceRate
                    }% in ${RANGE_DAYS} days`
                  : "No data"
              }
            />
            <Insight
              tone="rose"
              title="Needs attention"
              text={
                performance.filter((c) => c.slots > 0 && c.absent + c.leave > 0).sort((a, b) => b.absent + b.leave - (a.absent + a.leave))[0]
                  ? `${
                      performance
                        .filter((c) => c.slots > 0 && c.absent + c.leave > 0)
                        .sort((a, b) => b.absent + b.leave - (a.absent + a.leave))[0].cab.cabNumber
                    } — ${
                      performance
                        .filter((c) => c.slots > 0 && c.absent + c.leave > 0)
                        .sort((a, b) => b.absent + b.leave - (a.absent + a.leave))[0].absent +
                      performance
                        .filter((c) => c.slots > 0 && c.absent + c.leave > 0)
                        .sort((a, b) => b.absent + b.leave - (a.absent + a.leave))[0].leave
                    } missed shifts`
                  : "All cabs are regular 🎉"
              }
            />
            <Insight
              tone="amber"
              title="Punctuality"
              text={`${pct(rangePresent - rangeLate, Math.max(1, rangePresent))}% arrivals on time (${rangeLate} late out of ${rangePresent})`}
            />
            <Insight
              tone="sky"
              title="Automation"
              text="A new sheet is generated automatically every morning — just enter the actual in/out times."
            />
          </div>
        </Card>
      </div>
    </>
  );
}

function Insight({
  tone,
  title,
  text,
}: {
  tone: "emerald" | "rose" | "amber" | "sky";
  title: string;
  text: string;
}) {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    rose: "bg-rose-50 text-rose-700 ring-rose-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    sky: "bg-sky-50 text-sky-700 ring-sky-100",
  };
  return (
    <div className={cx("rounded-xl px-3.5 py-3 ring-1 ring-inset", tones[tone])}>
      <div className="text-[11px] font-bold uppercase tracking-wide opacity-70">
        {title}
      </div>
      <div className="mt-0.5 text-[13px] font-medium text-slate-700">{text}</div>
    </div>
  );
}

export default async function Page(props: Parameters<typeof DashboardPage>[0]) {
  if (!(await isAdmin())) return null;
  return DashboardPage(props);
}
