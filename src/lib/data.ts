import { db } from "@/db";
import {
  attendance,
  cabs,
  cabShifts,
  drivers,
  type Attendance,
  type Cab,
  type CabShift,
  type Driver,
  type NewAttendance,
} from "@/db/schema";
import { and, asc, desc, eq, gte, lte, sql, type Column } from "drizzle-orm";
import {
  EARLY_OFF_ALERT_MIN,
  computeEarlyMinutes,
  computeLateMinutes,
  computeOvertimeMinutes,
  dutyMinutes,
  hhmm,
  istDate,
  shiftDate,
  todayIso,
  type AttendanceStatus,
  type ShiftType,
} from "./tracking";

export const SHIFTS: ShiftType[] = ["day", "night"];

export const DEFAULT_SHIFTS: Record<ShiftType, { in: string; out: string }> = {
  day: { in: "08:00", out: "20:00" },
  night: { in: "20:00", out: "08:00" },
};

export type SheetEntry = {
  cab: Cab;
  shiftType: ShiftType;
  recordId: string | null;
  scheduledIn: string;
  scheduledOut: string;
  status: AttendanceStatus;
  driverId: string | null;
  /** Regular (assigned) driver of this cab for this shift */
  defaultDriverId: string | null;
  actualIn: string | null;
  actualOut: string | null;
  lateMinutes: number;
  overtimeMinutes: number;
  earlyOffMinutes: number;
  reason: string;
  notes: string;
  source: string;
};

/* ------------------------------------------------------------------ */
/* Lookups                                                            */
/* ------------------------------------------------------------------ */

export async function getCabs(): Promise<Cab[]> {
  return db.select().from(cabs).orderBy(asc(cabs.cabNumber));
}

export async function getActiveCabs(): Promise<Cab[]> {
  return db
    .select()
    .from(cabs)
    .where(eq(cabs.status, "active"))
    .orderBy(asc(cabs.cabNumber));
}

export async function getDrivers(): Promise<Driver[]> {
  return db.select().from(drivers).orderBy(asc(drivers.name));
}

export async function getActiveDrivers(): Promise<Driver[]> {
  return db
    .select()
    .from(drivers)
    .where(eq(drivers.status, "active"))
    .orderBy(asc(drivers.name));
}

export async function getShifts(): Promise<CabShift[]> {
  return db.select().from(cabShifts);
}

export function indexShifts(list: CabShift[]): Map<string, CabShift> {
  const map = new Map<string, CabShift>();
  for (const s of list) map.set(`${s.cabId}:${s.shiftType}`, s);
  return map;
}

export async function getAttendanceRange(
  fromIso: string,
  toIso: string,
): Promise<Attendance[]> {
  return db
    .select()
    .from(attendance)
    .where(and(gte(attendance.date, fromIso), lte(attendance.date, toIso)))
    .orderBy(asc(attendance.date));
}

export type Assignment = {
  cabId: string;
  cabNumber: string;
  shiftType: ShiftType;
  driverId: string;
  driverName: string;
};

/** Regular driver of every cab / shift (from cab list upload or learned). */
export async function getAssignments(): Promise<Assignment[]> {
  const rows = await db
    .select({
      cabId: cabShifts.cabId,
      shiftType: cabShifts.shiftType,
      driverId: drivers.id,
      cabNumber: cabs.cabNumber,
      driverName: drivers.name,
    })
    .from(cabShifts)
    .innerJoin(cabs, eq(cabs.id, cabShifts.cabId))
    .innerJoin(drivers, eq(drivers.id, cabShifts.defaultDriverId))
    .where(eq(cabShifts.enabled, true))
    .orderBy(asc(cabs.cabNumber));
  return rows.map((r) => ({ ...r, shiftType: r.shiftType as ShiftType }));
}

/* ------------------------------------------------------------------ */
/* Attendance sheet                                                   */
/* ------------------------------------------------------------------ */

/** Day + night rows for every cab on a date (records merged with templates). */
export async function getSheet(dateIso: string): Promise<SheetEntry[]> {
  const [cabList, shiftList, recordList] = await Promise.all([
    getCabs(),
    getShifts(),
    db.select().from(attendance).where(eq(attendance.date, dateIso)),
  ]);
  const tpl = indexShifts(shiftList);
  const recs = new Map(recordList.map((r) => [`${r.cabId}:${r.shiftType}`, r]));

  const entries: SheetEntry[] = [];
  for (const cab of cabList) {
    for (const st of SHIFTS) {
      const t = tpl.get(`${cab.id}:${st}`);
      const r = recs.get(`${cab.id}:${st}`);
      const def = t?.defaultDriverId ?? null;
      if (r) {
        entries.push({
          cab,
          shiftType: st,
          recordId: r.id,
          scheduledIn: hhmm(r.scheduledIn) ?? DEFAULT_SHIFTS[st].in,
          scheduledOut: hhmm(r.scheduledOut) ?? DEFAULT_SHIFTS[st].out,
          status: r.status as AttendanceStatus,
          driverId: r.driverId ?? (r.status === "pending" ? def : null),
          defaultDriverId: def,
          actualIn: hhmm(r.actualIn),
          actualOut: hhmm(r.actualOut),
          lateMinutes: r.lateMinutes,
          overtimeMinutes: r.overtimeMinutes,
          earlyOffMinutes: r.earlyOffMinutes,
          reason: r.reason,
          notes: r.notes,
          source: r.source,
        });
        continue;
      }
      if (cab.status !== "active" || (t && !t.enabled)) continue;
      entries.push({
        cab,
        shiftType: st,
        recordId: null,
        scheduledIn: hhmm(t?.scheduledIn) ?? DEFAULT_SHIFTS[st].in,
        scheduledOut: hhmm(t?.scheduledOut) ?? DEFAULT_SHIFTS[st].out,
        status: "pending",
        driverId: def,
        defaultDriverId: def,
        actualIn: null,
        actualOut: null,
        lateMinutes: 0,
        overtimeMinutes: 0,
        earlyOffMinutes: 0,
        reason: "",
        notes: "",
        source: "template",
      });
    }
  }
  return entries;
}

/**
 * Creates the daily sheet for a date: one "pending" row per running shift of
 * every active cab, pre-filled with the cab's timing and regular driver.
 */
export async function generateDailySheet(dateIso: string): Promise<{
  created: number;
  existing: number;
}> {
  const [cabList, shiftList] = await Promise.all([getActiveCabs(), getShifts()]);
  const tpl = indexShifts(shiftList);
  const values: NewAttendance[] = [];

  if (dateIso <= shiftDate(todayIso(), 7)) {
    for (const cab of cabList) {
      if (dateIso < istDate(cab.createdAt)) continue;
      for (const st of SHIFTS) {
        const t = tpl.get(`${cab.id}:${st}`);
        if (t && !t.enabled) continue;
        values.push({
          cabId: cab.id,
          date: dateIso,
          shiftType: st,
          status: "pending",
          driverId: t?.defaultDriverId ?? null,
          scheduledIn: t?.scheduledIn ?? DEFAULT_SHIFTS[st].in,
          scheduledOut: t?.scheduledOut ?? DEFAULT_SHIFTS[st].out,
          source: "auto",
        });
      }
    }
  }

  let created = 0;
  if (values.length) {
    const ins = await db
      .insert(attendance)
      .values(values)
      .onConflictDoNothing({
        target: [attendance.cabId, attendance.date, attendance.shiftType],
      })
      .returning({ id: attendance.id });
    created = ins.length;
  }
  await syncPendingRows(dateIso);
  return { created, existing: values.length - created };
}

/** Untouched auto rows always follow the latest cab timing + regular driver. */
export async function syncPendingRows(dateIso?: string) {
  await db.execute(sql`
    update attendance a set
      scheduled_in = s.scheduled_in,
      scheduled_out = s.scheduled_out,
      driver_id = coalesce(s.default_driver_id, a.driver_id)
    from cab_shifts s
    where a.cab_id = s.cab_id
      and a.shift_type = s.shift_type
      and a.status = 'pending'
      and a.source = 'auto'
      ${dateIso ? sql`and a.date = ${dateIso}` : sql`and a.date >= ${todayIso()}`}
  `);
}

export async function generateRecentSheets(
  dateIso: string,
  days: number,
): Promise<{ dates: string[]; created: number }> {
  const dates: string[] = [];
  let created = 0;
  for (let i = days; i >= 0; i -= 1) {
    const d = shiftDate(dateIso, -i);
    const res = await generateDailySheet(d);
    created += res.created;
    dates.push(d);
  }
  return { dates, created };
}

/* ------------------------------------------------------------------ */
/* Learning & schedule maintenance                                    */
/* ------------------------------------------------------------------ */

/**
 * Fills the regular driver of every cab/shift that has none, using whoever
 * drove it most often in its latest 14 days of records.
 */
export async function learnAssignments(): Promise<number> {
  const res = await db.execute(sql`
    with recent as (
      select cab_id, shift_type, driver_id, date,
             dense_rank() over (partition by cab_id, shift_type order by date desc) as rk
      from attendance
      where driver_id is not null and status in ('present', 'half_day')
    ), counts as (
      select cab_id, shift_type, driver_id, count(*) as c, max(date) as last_date
      from recent where rk <= 14
      group by cab_id, shift_type, driver_id
    ), best as (
      select distinct on (cab_id, shift_type) cab_id, shift_type, driver_id
      from counts
      order by cab_id, shift_type, c desc, last_date desc
    )
    update cab_shifts s set default_driver_id = b.driver_id
    from best b
    where s.cab_id = b.cab_id
      and s.shift_type = b.shift_type
      and s.default_driver_id is null
  `);
  return res.rowCount ?? 0;
}

function wrappedMinutes(col: Column, t: string) {
  const d = sql`(extract(epoch from (${col} - ${t}::time)) / 60)`;
  return sql`(case when ${col} is null or ${attendance.status} not in ('present', 'half_day') then 0
    else greatest(0, round(case when ${d} < -720 then ${d} + 1440 when ${d} > 720 then ${d} - 1440 else ${d} end))::int end)`;
}

function wrappedEarly(col: Column, t: string) {
  const d = sql`(extract(epoch from (${t}::time - ${col})) / 60)`;
  return sql`(case when ${col} is null or ${attendance.status} <> 'present' then 0
    else greatest(0, round(case when ${d} < -720 then ${d} + 1440 when ${d} > 720 then ${d} - 1440 else ${d} end))::int end)`;
}

/**
 * Applies a new shift timing to existing records of a cab and recalculates
 * late / overtime. When old timing is given, only records that still use the
 * old timing are touched.
 */
export async function reapplySchedule(
  cabId: string,
  shiftType: ShiftType,
  oldIn: string | null,
  oldOut: string | null,
  newIn: string,
  newOut: string,
): Promise<number> {
  const conds = [eq(attendance.cabId, cabId), eq(attendance.shiftType, shiftType)];
  if (oldIn && oldOut) {
    conds.push(eq(attendance.scheduledIn, oldIn), eq(attendance.scheduledOut, oldOut));
  }
  const res = await db
    .update(attendance)
    .set({
      scheduledIn: newIn,
      scheduledOut: newOut,
      lateMinutes: wrappedMinutes(attendance.actualIn, newIn),
      overtimeMinutes: wrappedMinutes(attendance.actualOut, newOut),
      earlyOffMinutes: wrappedEarly(attendance.actualOut, newOut),
    })
    .where(and(...conds));
  return res.rowCount ?? 0;
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                          */
/* ------------------------------------------------------------------ */

export type TrendPoint = {
  date: string;
  presentDay: number;
  presentNight: number;
  absent: number;
  pending: number;
  late: number;
  total: number;
};

export async function getTrend(toIso: string, days: number): Promise<TrendPoint[]> {
  const fromIso = shiftDate(toIso, -(days - 1));
  const rows = await getAttendanceRange(fromIso, toIso);
  const map = new Map<string, TrendPoint>();
  for (let i = 0; i < days; i += 1) {
    const d = shiftDate(fromIso, i);
    map.set(d, { date: d, presentDay: 0, presentNight: 0, absent: 0, pending: 0, late: 0, total: 0 });
  }
  for (const r of rows) {
    const p = map.get(r.date);
    if (!p) continue;
    p.total += 1;
    if (r.status === "present" || r.status === "half_day") {
      if (r.shiftType === "day") p.presentDay += 1;
      else p.presentNight += 1;
    } else if (r.status === "pending") p.pending += 1;
    else if (r.status !== "off") p.absent += 1;
    if (r.lateMinutes > 0) p.late += 1;
  }
  return [...map.values()];
}

export type CabPerformance = {
  cab: Cab;
  slots: number;
  present: number;
  halfDay: number;
  absent: number;
  leave: number;
  pending: number;
  late: number;
  onTimeRate: number;
  attendanceRate: number;
  avgLateMinutes: number;
  lastSeen: string | null;
};

export async function getCabPerformance(
  fromIso: string,
  toIso: string,
): Promise<CabPerformance[]> {
  const [cabList, rows] = await Promise.all([getCabs(), getAttendanceRange(fromIso, toIso)]);
  const byCab = new Map<string, Attendance[]>();
  for (const r of rows) {
    const list = byCab.get(r.cabId) ?? [];
    list.push(r);
    byCab.set(r.cabId, list);
  }

  return cabList.map((cab) => {
    const list = byCab.get(cab.id) ?? [];
    const filled = list.filter((r) => r.status !== "off" && r.status !== "pending");
    const present = list.filter((r) => r.status === "present");
    const halfDay = list.filter((r) => r.status === "half_day");
    const absent = list.filter((r) => r.status === "absent");
    const leave = list.filter((r) => r.status === "leave");
    const pending = list.filter((r) => r.status === "pending");
    const late = present.filter((r) => r.lateMinutes > 0);
    const seen = [...present, ...halfDay].sort((a, b) => (a.date < b.date ? 1 : -1));
    return {
      cab,
      slots: filled.length,
      present: present.length,
      halfDay: halfDay.length,
      absent: absent.length,
      leave: leave.length,
      pending: pending.length,
      late: late.length,
      onTimeRate: present.length
        ? Math.round(((present.length - late.length) / present.length) * 100)
        : 0,
      attendanceRate: filled.length
        ? Math.round(((present.length + halfDay.length) / filled.length) * 100)
        : 0,
      avgLateMinutes: late.length
        ? Math.round(late.reduce((s, r) => s + r.lateMinutes, 0) / late.length)
        : 0,
      lastSeen: seen[0]?.date ?? null,
    };
  });
}

export type DriverPerformance = {
  driver: Driver;
  duties: number;
  late: number;
  absent: number;
  cabs: string[];
};

export async function getDriverPerformance(
  fromIso: string,
  toIso: string,
): Promise<DriverPerformance[]> {
  const [driverList, rows, cabList] = await Promise.all([
    getDrivers(),
    getAttendanceRange(fromIso, toIso),
    getCabs(),
  ]);
  const cabName = new Map(cabList.map((c) => [c.id, c.cabNumber]));
  const byDriver = new Map<string, Attendance[]>();
  for (const r of rows) {
    if (!r.driverId) continue;
    const list = byDriver.get(r.driverId) ?? [];
    list.push(r);
    byDriver.set(r.driverId, list);
  }
  return driverList
    .map((driver) => {
      const list = byDriver.get(driver.id) ?? [];
      const duties = list.filter((r) => r.status === "present" || r.status === "half_day");
      return {
        driver,
        duties: duties.length,
        late: duties.filter((r) => r.lateMinutes > 0).length,
        absent: list.filter((r) => r.status === "absent" || r.status === "leave").length,
        cabs: [...new Set(duties.map((r) => cabName.get(r.cabId) ?? "—"))],
      };
    })
    .sort((a, b) => b.duties - a.duties);
}

export type LateArrival = { record: Attendance; cab: Cab; driver: Driver | null };

export async function getLateArrivals(
  fromIso: string,
  toIso: string,
  limit = 8,
): Promise<LateArrival[]> {
  const [rows, cabList, driverList] = await Promise.all([
    db
      .select()
      .from(attendance)
      .where(
        and(
          gte(attendance.date, fromIso),
          lte(attendance.date, toIso),
          eq(attendance.status, "present"),
        ),
      )
      .orderBy(desc(attendance.date), desc(attendance.lateMinutes)),
    getCabs(),
    getDrivers(),
  ]);
  const cabMap = new Map(cabList.map((c) => [c.id, c]));
  const driverMap = new Map(driverList.map((d) => [d.id, d]));
  const out: LateArrival[] = [];
  for (const r of rows) {
    if (r.lateMinutes <= 0) continue;
    const cab = cabMap.get(r.cabId);
    if (!cab) continue;
    out.push({ record: r, cab, driver: r.driverId ? (driverMap.get(r.driverId) ?? null) : null });
    if (out.length >= limit) break;
  }
  return out;
}

export async function getLatestDataDate(): Promise<string | null> {
  const res = await db.execute(
    sql`select max(date)::text as d from attendance where status <> 'pending'`,
  );
  const row = res.rows[0] as { d: string | null } | undefined;
  return row?.d ?? null;
}

export type DataIssues = {
  noDriver: { cabNumber: string; shifts: ShiftType[] }[];
  pastPending: number;
  licences: { name: string; expiry: string; expired: boolean }[];
};

/** Things the owner should fix — shown on the dashboard. */
export async function getDataIssues(): Promise<DataIssues> {
  const today = todayIso();
  const [cabList, shiftList, driverList, pend] = await Promise.all([
    getActiveCabs(),
    getShifts(),
    getDrivers(),
    db.execute(
      sql`select count(*)::int as n from attendance where status = 'pending' and date < ${today} and date >= ${shiftDate(today, -7)}`,
    ),
  ]);
  const tpl = indexShifts(shiftList);
  const noDriver = cabList
    .map((c) => ({
      cabNumber: c.cabNumber,
      shifts: SHIFTS.filter((st) => {
        const t = tpl.get(`${c.id}:${st}`);
        return (!t || t.enabled) && !t?.defaultDriverId;
      }),
    }))
    .filter((x) => x.shifts.length > 0);
  const soon = shiftDate(today, 30);
  const licences = driverList
    .filter((d) => d.status === "active" && d.licenseExpiry && d.licenseExpiry <= soon)
    .map((d) => ({
      name: d.name,
      expiry: d.licenseExpiry as string,
      expired: (d.licenseExpiry as string) < today,
    }));
  const n = (pend.rows[0] as { n?: number } | undefined)?.n ?? 0;
  return { noDriver, pastPending: Number(n), licences };
}

/* ------------------------------------------------------------------ */
/* Mutations                                                          */
/* ------------------------------------------------------------------ */

export type AttendanceInput = {
  cabId: string;
  date: string;
  shiftType: ShiftType;
  status: AttendanceStatus;
  driverId: string | null;
  scheduledIn: string;
  scheduledOut: string;
  actualIn: string | null;
  actualOut: string | null;
  reason: string;
  notes: string;
};

export async function upsertAttendance(input: AttendanceInput) {
  const working = input.status === "present" || input.status === "half_day";
  const actualIn = working ? input.actualIn : null;
  const actualOut = working ? input.actualOut : null;
  const values = {
    status: input.status,
    // driver is kept for absences too, so we know *who* did not come
    driverId: input.status === "off" ? null : input.driverId,
    scheduledIn: input.scheduledIn,
    scheduledOut: input.scheduledOut,
    actualIn,
    actualOut,
    lateMinutes: working ? computeLateMinutes(input.scheduledIn, actualIn) : 0,
    overtimeMinutes: working ? computeOvertimeMinutes(input.scheduledOut, actualOut) : 0,
    earlyOffMinutes: input.status === "present" ? computeEarlyMinutes(input.scheduledOut, actualOut) : 0,
    reason: input.reason,
    notes: input.notes,
    source: "manual",
    updatedAt: new Date(),
  };
  await db
    .insert(attendance)
    .values({ cabId: input.cabId, date: input.date, shiftType: input.shiftType, ...values })
    .onConflictDoUpdate({
      target: [attendance.cabId, attendance.date, attendance.shiftType],
      set: values,
    });
}

/** Quick fill: only rows that are still pending are touched. */
export async function bulkMark(
  dateIso: string,
  shiftType: ShiftType,
  status: AttendanceStatus,
): Promise<number> {
  const entries = (await getSheet(dateIso)).filter(
    (e) => e.shiftType === shiftType && e.status === "pending",
  );
  for (const e of entries) {
    await upsertAttendance({
      cabId: e.cab.id,
      date: dateIso,
      shiftType,
      status,
      driverId: e.driverId,
      scheduledIn: e.scheduledIn,
      scheduledOut: e.scheduledOut,
      actualIn: status === "present" ? e.scheduledIn : null,
      actualOut: null,
      reason: e.reason,
      notes: e.notes,
    });
  }
  return entries.length;
}

/* ------------------------------------------------------------------ */
/* Daily report                                                       */
/* ------------------------------------------------------------------ */

export type DailyRow = {
  cabId: string;
  cabNumber: string;
  owner: string;
  color: string;
  shiftType: ShiftType;
  status: AttendanceStatus;
  scheduledIn: string;
  scheduledOut: string;
  actualIn: string | null;
  actualOut: string | null;
  driverName: string | null;
  driverPhone: string | null;
  regularName: string | null;
  lateMinutes: number;
  earlyOffMinutes: number;
  overtimeMinutes: number;
  dutyMinutes: number | null;
  onDuty: boolean;
  reason: string;
  notes: string;
  source: string;
};

export type DailyReport = {
  date: string;
  rows: DailyRow[];
  counts: {
    total: number;
    present: number;
    onDuty: number;
    completed: number;
    leave: number;
    absent: number;
    off: number;
    pending: number;
    late: number;
    earlyOff: number;
    byDriver: number;
  };
  totalDutyMinutes: number;
};

export async function getDailyReport(date: string): Promise<DailyReport> {
  const [sheet, driverList] = await Promise.all([getSheet(date), getDrivers()]);
  const dmap = new Map(driverList.map((d) => [d.id, d]));
  const rows: DailyRow[] = sheet.map((e) => {
    const drv = e.driverId ? dmap.get(e.driverId) : undefined;
    const reg = e.defaultDriverId ? dmap.get(e.defaultDriverId) : undefined;
    const shown = drv ?? reg;
    const working = e.status === "present" || e.status === "half_day";
    return {
      cabId: e.cab.id,
      cabNumber: e.cab.cabNumber,
      owner: e.cab.ownerName,
      color: e.cab.color,
      shiftType: e.shiftType,
      status: e.status,
      scheduledIn: e.scheduledIn,
      scheduledOut: e.scheduledOut,
      actualIn: e.actualIn,
      actualOut: e.actualOut,
      driverName: shown?.name ?? null,
      driverPhone: shown?.phone || null,
      regularName: reg?.name ?? null,
      lateMinutes: working ? e.lateMinutes : 0,
      earlyOffMinutes: e.status === "present" ? e.earlyOffMinutes : 0,
      overtimeMinutes: working ? e.overtimeMinutes : 0,
      dutyMinutes: working ? dutyMinutes(e.actualIn, e.actualOut) : null,
      onDuty: working && Boolean(e.actualIn) && !e.actualOut,
      reason: e.reason,
      notes: e.notes,
      source: e.source,
    };
  });
  const c = (f: (r: DailyRow) => boolean) => rows.filter(f).length;
  const working = (r: DailyRow) => r.status === "present" || r.status === "half_day";
  return {
    date,
    rows,
    counts: {
      total: rows.length,
      present: c(working),
      onDuty: c((r) => r.onDuty),
      completed: c((r) => working(r) && Boolean(r.actualOut)),
      leave: c((r) => r.status === "leave"),
      absent: c((r) => r.status === "absent"),
      off: c((r) => r.status === "off"),
      pending: c((r) => r.status === "pending"),
      late: c((r) => r.lateMinutes > 0),
      earlyOff: c((r) => r.earlyOffMinutes >= EARLY_OFF_ALERT_MIN),
      byDriver: c((r) => r.source === "driver"),
    },
    totalDutyMinutes: rows.reduce((s, r) => s + (r.dutyMinutes ?? 0), 0),
  };
}
