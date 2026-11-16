import { guard } from "@/lib/auth";
import * as XLSX from "xlsx";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { attendance, cabShifts, cabs, drivers } from "@/db/schema";
import { SHIFT_LABEL, STATUS_META, hhmm, todayIso, type AttendanceStatus, type ShiftType } from "@/lib/tracking";

export const dynamic = "force-dynamic";

/** Full backup as Excel — can be uploaded again to restore everything. */
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  const [cabList, driverList, shiftList, rows] = await Promise.all([
    db.select().from(cabs).orderBy(asc(cabs.cabNumber)),
    db.select().from(drivers).orderBy(asc(drivers.name)),
    db.select().from(cabShifts),
    db.select().from(attendance).orderBy(asc(attendance.date), asc(attendance.shiftType)),
  ]);
  const cabName = new Map(cabList.map((c) => [c.id, c.cabNumber]));
  const drvName = new Map(driverList.map((d) => [d.id, d.name]));
  const tpl = new Map(shiftList.map((s) => [`${s.cabId}:${s.shiftType}`, s]));

  const cabSheet = cabList.map((c) => {
    const d = tpl.get(`${c.id}:day`);
    const n = tpl.get(`${c.id}:night`);
    return {
      "Cab Number": c.cabNumber,
      Model: c.model,
      Owner: c.ownerName,
      "Day In": hhmm(d?.scheduledIn) ?? "",
      "Day Out": hhmm(d?.scheduledOut) ?? "",
      "Night In": hhmm(n?.scheduledIn) ?? "",
      "Night Out": hhmm(n?.scheduledOut) ?? "",
      "Day Driver": d?.defaultDriverId ? (drvName.get(d.defaultDriverId) ?? "") : "",
      "Night Driver": n?.defaultDriverId ? (drvName.get(n.defaultDriverId) ?? "") : "",
      "Runs Day": d?.enabled === false ? "No" : "Yes",
      "Runs Night": n?.enabled === false ? "No" : "Yes",
      Status: c.status,
    };
  });
  const driverSheet = driverList.map((d) => ({
    Name: d.name,
    Phone: d.phone,
    "Licence Number": d.licenseNumber,
    "Licence Expiry": d.licenseExpiry ?? "",
    Status: d.status,
  }));
  const attSheet = rows.filter((r) => !(r.status === "pending" && r.source === "auto")).map((r) => ({
    Date: r.date,
    "Cab Number": cabName.get(r.cabId) ?? "",
    Shift: SHIFT_LABEL[r.shiftType as ShiftType] ?? r.shiftType,
    "Scheduled In": hhmm(r.scheduledIn) ?? "",
    "Scheduled Out": hhmm(r.scheduledOut) ?? "",
    "In Time": hhmm(r.actualIn) ?? "",
    "Out Time": hhmm(r.actualOut) ?? "",
    Driver: r.driverId ? (drvName.get(r.driverId) ?? "") : "",
    Status: STATUS_META[r.status as AttendanceStatus]?.label ?? r.status,
    "Late (min)": r.lateMinutes,
    "OT (min)": r.overtimeMinutes,
    Reason: r.reason,
    Notes: r.notes,
  }));

  const wb = XLSX.utils.book_new();
  const sheet = (data: Record<string, unknown>[], fallback: Record<string, unknown>) =>
    XLSX.utils.json_to_sheet(data.length ? data : [fallback]);
  XLSX.utils.book_append_sheet(wb, sheet(cabSheet, { "Cab Number": "" }), "Cabs");
  XLSX.utils.book_append_sheet(wb, sheet(driverSheet, { Name: "" }), "Drivers");
  XLSX.utils.book_append_sheet(wb, sheet(attSheet, { Date: "", "Cab Number": "" }), "Attendance");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="cabtrack-backup-${todayIso()}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
