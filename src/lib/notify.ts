import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { attendance, cabs, drivers, notifications, type Notification } from "@/db/schema";
import { generateDailySheet } from "./data";
import { isDriverFormEnabled } from "./settings";
import { formatTime, nowIst, timeToMinutes } from "./tracking";

export type NewAlert = {
  type: string;
  title: string;
  message?: string;
  cabId?: string | null;
  driverId?: string | null;
  date?: string | null;
  dedupeKey?: string | null;
};

export async function notify(n: NewAlert, store: Pick<typeof db, "insert"> = db) {
  await store
    .insert(notifications)
    .values({
      type: n.type,
      title: n.title,
      message: n.message ?? "",
      cabId: n.cabId ?? null,
      driverId: n.driverId ?? null,
      date: n.date ?? null,
      dedupeKey: n.dedupeKey ?? null,
    })
    .onConflictDoNothing();
}

export async function listNotifications(after?: Date, limit = 30): Promise<Notification[]> {
  const q = db.select().from(notifications);
  const rows = after ? await q.where(gt(notifications.createdAt, after)).orderBy(desc(notifications.createdAt)).limit(limit) : await q.orderBy(desc(notifications.createdAt)).limit(limit);
  return rows;
}

export async function unreadCount(): Promise<number> {
  const res = await db.execute(sql`select count(*)::int as n from notifications where read = false`);
  return Number((res.rows[0] as { n?: number } | undefined)?.n ?? 0);
}

export async function markRead(ids?: string[]) {
  if (ids && ids.length) await db.update(notifications).set({ read: true }).where(inArray(notifications.id, ids));
  else await db.update(notifications).set({ read: true }).where(eq(notifications.read, false));
}

let lastCheck = 0;

/** "Not reported" alerts: shift started 30+ min ago but no Duty ON yet. */
export async function runChecks() {
  if (Date.now() - lastCheck < 60_000) return;
  lastCheck = Date.now();
  if (!(await isDriverFormEnabled())) return;
  const now = nowIst();
  await generateDailySheet(now.date);
  // only cabs whose drivers actually use the form (no spam while rolling out)
  const used = await db.execute(sql`select distinct cab_id from driver_submissions where created_at > now() - interval '14 days'`);
  const usingForm = new Set((used.rows as { cab_id: string }[]).map((r) => r.cab_id));
  if (!usingForm.size) return;
  const rows = await db
    .select({
      id: attendance.id,
      cabId: attendance.cabId,
      shiftType: attendance.shiftType,
      scheduledIn: attendance.scheduledIn,
      driverId: attendance.driverId,
      cabNumber: cabs.cabNumber,
      driverName: drivers.name,
    })
    .from(attendance)
    .innerJoin(cabs, eq(cabs.id, attendance.cabId))
    .leftJoin(drivers, eq(drivers.id, attendance.driverId))
    .where(and(eq(attendance.date, now.date), eq(attendance.status, "pending")));
  for (const r of rows) {
    if (!usingForm.has(r.cabId)) continue;
    const s = timeToMinutes(r.scheduledIn);
    if (s === null) continue;
    const since = now.minutes - s;
    if (since < 30 || since > 6 * 60) continue;
    await notify({
      type: "not_reported",
      title: `⏳ ${r.cabNumber} has not started Duty ON yet`,
      message: `${r.shiftType === "day" ? "☀️ Day" : "🌙 Night"} shift scheduled at ${formatTime(r.scheduledIn)}${r.driverName ? ` · ${r.driverName}` : ""}`,
      cabId: r.cabId,
      driverId: r.driverId,
      date: now.date,
      dedupeKey: `nr:${r.id}`,
    });
  }
}
