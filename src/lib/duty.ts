import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { attendance, cabShifts, cabs, driverSubmissions, drivers, type Attendance, type Cab, type CabShift, type Driver } from "@/db/schema";
import { DEFAULT_SHIFTS, SHIFTS, getActiveCabs, getDrivers, getShifts, indexShifts, learnAssignments } from "./data";
import { notify } from "./notify";
import {
  EARLY_OFF_ALERT_MIN,
  cabKey,
  computeEarlyMinutes,
  computeLateMinutes,
  computeOvertimeMinutes,
  dutyMinutes,
  formatDateLabel,
  formatTime,
  hhmm,
  minutesToLabel,
  nowIst,
  shiftDate,
  timeToMinutes,
  type ShiftType,
} from "./tracking";

export type DutyShift = { shiftType: ShiftType; in: string; out: string; driverId: string | null; driverName: string | null; driverPhone: string | null };
export type DutyRecord = { shiftType: ShiftType; date: string; status: string; actualIn: string | null; actualOut: string | null; driverName: string | null; lateMinutes: number; earlyOffMinutes: number; dutyMinutes: number | null };
export type DutyCab = {
  cabId: string;
  cabNumber: string;
  model: string;
  owner: string;
  shifts: DutyShift[];
  suggested: { shiftType: ShiftType; date: string };
  records: DutyRecord[];
  open: DutyRecord | null;
};

const SL = (st: ShiftType) => (st === "day" ? "☀️ Day" : "🌙 Night");
type Now = ReturnType<typeof nowIst>;

/** Which shift (and date) the driver is most likely reporting for right now. */
export function suggestShift(shifts: { shiftType: ShiftType; in: string }[], now: Now = nowIst()): { shiftType: ShiftType; date: string } {
  let best: { shiftType: ShiftType; date: string; score: number } | null = null;
  for (const s of shifts) {
    const start = timeToMinutes(s.in) ?? 0;
    let d = now.minutes - start;
    if (d < -720) d += 1440;
    if (d >= 720) d -= 1440;
    const date = d > 0 && start > now.minutes ? shiftDate(now.date, -1) : now.date;
    if (!best || Math.abs(d) < best.score) best = { shiftType: s.shiftType, date, score: Math.abs(d) };
  }
  return best ? { shiftType: best.shiftType, date: best.date } : { shiftType: "day", date: now.date };
}

/** An "open" duty (ON without OFF) that is still realistic — not a forgotten one from yesterday. */
function isLiveOpen(r: Attendance, now: Now): boolean {
  if (!r.actualIn || r.actualOut || (r.status !== "present" && r.status !== "half_day")) return false;
  if (r.date === now.date) return true;
  return r.date === shiftDate(now.date, -1) && r.shiftType === "night" && now.minutes < 14 * 60;
}

function toRecord(r: Attendance, dmap: Map<string, Driver>): DutyRecord {
  return {
    shiftType: r.shiftType as ShiftType,
    date: r.date,
    status: r.status,
    actualIn: hhmm(r.actualIn),
    actualOut: hhmm(r.actualOut),
    driverName: r.driverId ? (dmap.get(r.driverId)?.name ?? null) : null,
    lateMinutes: r.lateMinutes,
    earlyOffMinutes: r.earlyOffMinutes,
    dutyMinutes: dutyMinutes(r.actualIn, r.actualOut),
  };
}

async function buildCab(cab: Cab, tpl: Map<string, CabShift>, dmap: Map<string, Driver>): Promise<DutyCab> {
  const now = nowIst();
  const shifts: DutyShift[] = [];
  for (const st of SHIFTS) {
    const t = tpl.get(`${cab.id}:${st}`);
    if (t && !t.enabled) continue;
    const d = t?.defaultDriverId ? dmap.get(t.defaultDriverId) : undefined;
    shifts.push({
      shiftType: st,
      in: hhmm(t?.scheduledIn) ?? DEFAULT_SHIFTS[st].in,
      out: hhmm(t?.scheduledOut) ?? DEFAULT_SHIFTS[st].out,
      driverId: d?.id ?? null,
      driverName: d?.name ?? null,
      driverPhone: d?.phone || null,
    });
  }
  const recs = await db
    .select()
    .from(attendance)
    .where(and(eq(attendance.cabId, cab.id), gte(attendance.date, shiftDate(now.date, -1)), lte(attendance.date, now.date)))
    .orderBy(desc(attendance.date), desc(attendance.updatedAt));
  const open = recs.find((r) => isLiveOpen(r, now));
  return {
    cabId: cab.id,
    cabNumber: cab.cabNumber,
    model: cab.model,
    owner: cab.ownerName,
    shifts,
    suggested: open ? { shiftType: open.shiftType as ShiftType, date: open.date } : suggestShift(shifts, now),
    records: recs.filter((r) => r.date === now.date || r.shiftType === "night").map((r) => toRecord(r, dmap)),
    open: open ? toRecord(open, dmap) : null,
  };
}

/** Find cabs by full number, last digits ("6430") or the driver's mobile number. */
export async function lookupCabs(q: string): Promise<DutyCab[]> {
  const digits = q.replace(/\D/g, "");
  const key = cabKey(q);
  if (!key) return [];
  const [cabList, shiftList, driverList] = await Promise.all([getActiveCabs(), getShifts(), getDrivers()]);
  const tpl = indexShifts(shiftList);
  const dmap = new Map(driverList.map((d) => [d.id, d]));
  let matches: Cab[] = [];
  if (digits.length >= 10) {
    const phone = digits.slice(-10);
    const ids = new Set(driverList.filter((d) => d.phone.replace(/\D/g, "").slice(-10) === phone).map((d) => d.id));
    const cabIds = new Set(shiftList.filter((s) => s.enabled && s.defaultDriverId && ids.has(s.defaultDriverId)).map((s) => s.cabId));
    matches = cabList.filter((c) => cabIds.has(c.id));
  }
  if (!matches.length) {
    const exact = cabList.filter((c) => cabKey(c.cabNumber) === key);
    matches = exact.length ? exact : key.length >= 3 ? cabList.filter((c) => cabKey(c.cabNumber).endsWith(key)) : [];
  }
  return Promise.all(matches.slice(0, 8).map((c) => buildCab(c, tpl, dmap)));
}

export async function getDutyCab(cabId: string): Promise<DutyCab | null> {
  const [cab] = await db.select().from(cabs).where(eq(cabs.id, cabId)).limit(1);
  if (!cab || cab.status !== "active") return null;
  const [shiftList, driverList] = await Promise.all([getShifts(), getDrivers()]);
  return buildCab(cab, indexShifts(shiftList), new Map(driverList.map((d) => [d.id, d])));
}

export type DutyResult =
  | { ok: true; tone: "green" | "red" | "blue" | "amber"; title: string; message: string }
  | { ok: false; error: string };

type DutyInput = {
  cabId: string;
  action: "on" | "off" | "leave";
  shiftType?: ShiftType;
  driverId?: string | null;
  note?: string;
};
type DutyStore = Pick<typeof db, "select" | "insert" | "update">;

/** Serialize each cab's actions and commit attendance, audit log and alert together. */
export async function dutyAction(input: DutyInput): Promise<DutyResult> {
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.cabId}))`);
    return applyDutyAction(input, tx);
  });
  if (result.ok) {
    try { await learnAssignments(); }
    catch { console.error("Regular-driver learning deferred; duty entry is safely saved."); }
  }
  return result;
}

async function applyDutyAction(input: DutyInput, store: DutyStore): Promise<DutyResult> {
  const emit = (n: Parameters<typeof notify>[0]) => notify(n, store);
  const now = nowIst();
  const [cab] = await store.select().from(cabs).where(eq(cabs.id, input.cabId)).limit(1);
  if (!cab || cab.status !== "active") return { ok: false, error: "Cab not found" };
  const [shiftList, driverList] = await Promise.all([
    db.select().from(cabShifts).where(eq(cabShifts.cabId, cab.id)),
    db.select().from(drivers),
  ]);
  const dmap = new Map(driverList.map((d) => [d.id, d]));
  if (input.driverId && (!dmap.has(input.driverId) || dmap.get(input.driverId)?.status !== "active")) {
    return { ok: false, error: "This driver is not in the active list. Ask the owner to check the driver details." };
  }
  const tplOf = (st: ShiftType) => shiftList.find((s) => s.shiftType === st);
  if (input.action !== "off" && input.shiftType && tplOf(input.shiftType)?.enabled === false) {
    return { ok: false, error: "This shift is OFF. Ask the owner to turn it on." };
  }
  const startOf = (st: ShiftType) => hhmm(tplOf(st)?.scheduledIn) ?? DEFAULT_SHIFTS[st].in;
  const pool = input.shiftType
    ? [{ shiftType: input.shiftType, in: startOf(input.shiftType) }]
    : SHIFTS.filter((st) => tplOf(st)?.enabled !== false).map((st) => ({ shiftType: st, in: startOf(st) }));
  const note = (input.note ?? "").trim().slice(0, 300);
  if (!pool.length) return { ok: false, error: "No shift is active for this cab. Contact the owner." };

  let target = suggestShift(pool, now);
  let existing: Attendance | undefined;
  if (input.action === "off") {
    const recent = await store
      .select()
      .from(attendance)
      .where(and(eq(attendance.cabId, cab.id), gte(attendance.date, shiftDate(now.date, -1)), lte(attendance.date, now.date)))
      .orderBy(desc(attendance.date), desc(attendance.updatedAt));
    const open = recent.filter((r) => isLiveOpen(r, now));
    const pick = open.find((r) => !input.shiftType || r.shiftType === input.shiftType) ?? open[0];
    if (pick) {
      existing = pick;
      target = { shiftType: pick.shiftType as ShiftType, date: pick.date };
    }
  }
  if (!existing) {
    [existing] = await store
      .select()
      .from(attendance)
      .where(and(eq(attendance.cabId, cab.id), eq(attendance.date, target.date), eq(attendance.shiftType, target.shiftType)))
      .limit(1);
  }

  const st = target.shiftType;
  if (input.action === "off" && existing?.actualOut) {
    return { ok: true, tone: "amber", title: "Duty is already OFF", message: `${SL(st)} · OFF ${formatTime(existing.actualOut)} saved. The time was not changed.` };
  }
  if (input.action === "on" && existing?.actualOut) {
    return { ok: false, error: "This shift's duty is already complete. To change the time, the owner can update it manually." };
  }
  if (input.action === "leave" && (existing?.actualIn || existing?.actualOut)) {
    return { ok: false, error: "Duty times are already saved. For leave, contact the owner; the entry was not erased." };
  }
  if (input.action === "leave" && existing?.status === "leave") {
    return { ok: true, tone: "blue", title: "Leave is already recorded", message: `${SL(st)} · ${formatDateLabel(target.date)}` };
  }
  const tpl = tplOf(st);
  const schedIn = hhmm(existing?.scheduledIn) ?? hhmm(tpl?.scheduledIn) ?? DEFAULT_SHIFTS[st].in;
  const schedOut = hhmm(existing?.scheduledOut) ?? hhmm(tpl?.scheduledOut) ?? DEFAULT_SHIFTS[st].out;
  const driverId = (input.driverId && dmap.has(input.driverId) ? input.driverId : null) ?? existing?.driverId ?? tpl?.defaultDriverId ?? null;
  const driverName = driverId ? (dmap.get(driverId)?.name ?? "") : "";
  const who = driverName ? `${driverName} · ` : "";
  const quote = note ? ` · "${note}"` : "";
  const notes = note ? [existing?.notes, `📱 ${now.time} ${note}`].filter(Boolean).join(" | ").slice(0, 500) : (existing?.notes ?? "");
  const base = { cabId: cab.id, driverId, date: target.date };

  let values: Partial<typeof attendance.$inferInsert>;
  let result: DutyResult;

  if (input.action === "on") {
    if (existing && isLiveOpen(existing, now)) {
      return { ok: true, tone: "amber", title: "Duty is already ON", message: `${SL(st)} · running since ${formatTime(existing.actualIn)}` };
    }
    const late = computeLateMinutes(schedIn, now.time);
    values = { status: "present", actualIn: now.time, actualOut: null, lateMinutes: late, overtimeMinutes: 0, earlyOffMinutes: 0, reason: "" };
    await emit({
      ...base,
      type: late > 0 ? "late" : "duty_on",
      title: late > 0 ? `⏰ ${cab.cabNumber} Duty ON — ${minutesToLabel(late)} late` : `🟢 ${cab.cabNumber} Duty ON`,
      message: `${who}${SL(st)} · ON ${now.time} (scheduled ${schedIn})${quote}`,
    });
    result = late > 0
      ? { ok: true, tone: "amber", title: `Duty ON ✅ ${now.time}`, message: `${minutesToLabel(late)} late — scheduled time was ${schedIn}` }
      : { ok: true, tone: "green", title: `Duty ON ✅ ${now.time}`, message: `On time! Shift ${schedIn} → ${schedOut}` };
  } else if (input.action === "off") {
    const inT = hhmm(existing?.actualIn);
    const early = computeEarlyMinutes(schedOut, now.time);
    const dm = dutyMinutes(inT, now.time);
    const dur = dm !== null ? ` · duty ${minutesToLabel(dm)}` : "";
    values = {
      status: existing?.status === "half_day" ? "half_day" : "present",
      actualOut: now.time,
      overtimeMinutes: computeOvertimeMinutes(schedOut, now.time),
      earlyOffMinutes: early,
    };
    if (early >= EARLY_OFF_ALERT_MIN) {
      await emit({
        ...base,
        type: "early_off",
        title: `⚠️ ${cab.cabNumber} went off duty ${minutesToLabel(early)} early`,
        message: `${who}${SL(st)} · OFF ${now.time}, scheduled ${schedOut}${dur}${quote}`,
      });
    } else {
      await emit({
        ...base,
        type: "duty_off",
        title: `🔴 ${cab.cabNumber} Duty OFF`,
        message: `${who}${SL(st)} · OFF ${now.time}${dur}${inT ? "" : " · (Duty ON was not recorded)"}${quote}`,
      });
    }
    result = {
      ok: true,
      tone: early >= EARLY_OFF_ALERT_MIN ? "amber" : "red",
      title: `Duty OFF ✅ ${now.time}`,
      message: early >= EARLY_OFF_ALERT_MIN
        ? `${minutesToLabel(early)} early — scheduled ${schedOut}${dm !== null ? ` · today's duty ${minutesToLabel(dm)}` : ""}`
        : dm !== null ? `Today's duty: ${minutesToLabel(dm)}` : "No Duty ON was recorded",
    };
  } else {
    values = { status: "leave", actualIn: null, actualOut: null, lateMinutes: 0, overtimeMinutes: 0, earlyOffMinutes: 0, reason: note || "Driver leave" };
    await emit({ ...base, type: "leave", title: `🏖️ ${cab.cabNumber} — leave`, message: `${who}${SL(st)} · ${formatDateLabel(target.date)}${quote}` });
    result = { ok: true, tone: "blue", title: "Leave recorded 🏖️", message: `${SL(st)} · ${formatDateLabel(target.date)}` };
  }

  const full = { ...values, driverId, scheduledIn: schedIn, scheduledOut: schedOut, notes, source: "driver", updatedAt: new Date() };
  if (existing) await store.update(attendance).set(full).where(eq(attendance.id, existing.id));
  else await store.insert(attendance).values({ cabId: cab.id, date: target.date, shiftType: st, ...full });

  await store.insert(driverSubmissions).values({
    cabId: cab.id,
    driverId,
    date: target.date,
    shiftType: st,
    action: input.action,
    actualIn: input.action === "on" ? now.time : null,
    actualOut: input.action === "off" ? now.time : null,
    note,
  });
  return result;
}
