import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { attendance, cabShifts, drivers } from "@/db/schema";
import { DEFAULT_SHIFTS, SHIFTS, reapplySchedule, syncPendingRows } from "./data";
import { hhmm, isUuid, isValidTime, type ShiftType } from "./tracking";

export type CabShiftInput = {
  dayIn?: string; dayOut?: string; nightIn?: string; nightOut?: string;
  dayEnabled?: boolean; nightEnabled?: boolean;
  dayDriverId?: string | null; nightDriverId?: string | null;
  dayDriverName?: string; dayDriverPhone?: string; nightDriverName?: string; nightDriverPhone?: string;
  applyPast?: boolean;
};

export function shiftInputError(b: CabShiftInput): string | null {
  for (const t of [b.dayIn, b.dayOut, b.nightIn, b.nightOut]) {
    if (t !== undefined && t !== "" && !isValidTime(t)) return "Enter shift times in HH:MM format";
  }
  if (b.dayDriverId === "new" && !b.dayDriverName?.trim()) return "Enter the new day driver's name";
  if (b.nightDriverId === "new" && !b.nightDriverName?.trim()) return "Enter the new night driver's name";
  for (const d of [b.dayDriverId, b.nightDriverId]) {
    if (d && d !== "new" && !isUuid(d)) return "Invalid driver";
  }
  return null;
}

/** Saves timing, running flag and regular driver for both shifts of a cab. */
export async function saveCabShifts(cabId: string, b: CabShiftInput) {
  for (const st of SHIFTS as ShiftType[]) {
    const inT = hhmm(st === "day" ? b.dayIn : b.nightIn);
    const outT = hhmm(st === "day" ? b.dayOut : b.nightOut);
    const enabled = st === "day" ? b.dayEnabled : b.nightEnabled;
    let drv = st === "day" ? b.dayDriverId : b.nightDriverId;
    const phone = (st === "day" ? b.dayDriverPhone : b.nightDriverPhone)?.trim();
    if (drv === "new") {
      drv = await findOrCreateDriver((st === "day" ? b.dayDriverName : b.nightDriverName) ?? "", phone ?? "");
    } else if (drv && phone !== undefined) {
      await db.update(drivers).set({ phone }).where(eq(drivers.id, drv));
    }
    const [cur] = await db.select().from(cabShifts).where(and(eq(cabShifts.cabId, cabId), eq(cabShifts.shiftType, st))).limit(1);
    const newIn = inT ?? hhmm(cur?.scheduledIn) ?? DEFAULT_SHIFTS[st].in;
    const newOut = outT ?? hhmm(cur?.scheduledOut) ?? DEFAULT_SHIFTS[st].out;
    let driverId: string | null | undefined = undefined;
    if (drv !== undefined) {
      driverId = drv || null;
      if (driverId) {
        const [d] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.id, driverId)).limit(1);
        if (!d) driverId = null;
      }
    }
    const timingChanged = Boolean(cur) && (hhmm(cur?.scheduledIn) !== newIn || hhmm(cur?.scheduledOut) !== newOut);
    if (cur) {
      await db
        .update(cabShifts)
        .set({
          scheduledIn: newIn,
          scheduledOut: newOut,
          isDefault: inT || outT ? (timingChanged ? false : cur.isDefault) : cur.isDefault,
          ...(enabled !== undefined ? { enabled } : {}),
          ...(driverId !== undefined ? { defaultDriverId: driverId } : {}),
        })
        .where(eq(cabShifts.id, cur.id));
      if (timingChanged) {
        await reapplySchedule(cabId, st, b.applyPast ? null : cur.scheduledIn, b.applyPast ? null : cur.scheduledOut, newIn, newOut);
      }
      if (enabled === false && cur.enabled) {
        await db.delete(attendance).where(and(eq(attendance.cabId, cabId), eq(attendance.shiftType, st), eq(attendance.status, "pending"), eq(attendance.source, "auto")));
      }
    } else {
      await db.insert(cabShifts).values({
        cabId, shiftType: st, scheduledIn: newIn, scheduledOut: newOut,
        isDefault: !(inT || outT), enabled: enabled ?? true, defaultDriverId: driverId ?? null,
      });
    }
  }
  await syncPendingRows();
}

/** Finds a driver by name (case-insensitive) or creates one. */
export async function findOrCreateDriver(rawName: string, phone = ""): Promise<string | null> {
  const name = rawName.replace(/\s+/g, " ").trim();
  if (!name) return null;
  const [found] = await db.select().from(drivers).where(sql`lower(${drivers.name}) = lower(${name})`).limit(1);
  if (found) {
    if (phone && phone !== found.phone) await db.update(drivers).set({ phone }).where(eq(drivers.id, found.id));
    return found.id;
  }
  const [row] = await db.insert(drivers).values({ name, phone }).returning();
  return row.id;
}

/** Makes a driver the regular driver of a cab's shift. */
export async function assignDriver(driverId: string, cabId: string, shiftType: ShiftType) {
  await db
    .update(cabShifts)
    .set({ defaultDriverId: driverId, enabled: true })
    .where(and(eq(cabShifts.cabId, cabId), eq(cabShifts.shiftType, shiftType)));
  await syncPendingRows();
}
