import { guard } from "@/lib/auth";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { attendance } from "@/db/schema";
import {
  DEFAULT_SHIFTS,
  bulkMark,
  learnAssignments,
  upsertAttendance,
  type AttendanceInput,
} from "@/lib/data";
import {
  ATTENDANCE_STATUSES,
  SHIFT_TYPES,
  hhmm,
  isIsoDate,
  isValidTime,
  isUuid,
} from "@/lib/tracking";

export const dynamic = "force-dynamic";

type EntryPayload = {
  cabId: string;
  date: string;
  shiftType: string;
  status: string;
  driverId?: string | null;
  scheduledIn?: string;
  scheduledOut?: string;
  actualIn?: string | null;
  actualOut?: string | null;
  reason?: string;
  notes?: string;
};

function parseEntry(raw: EntryPayload): AttendanceInput | string {
  if (!isUuid(raw.cabId)) return "Invalid cab";
  if (!isIsoDate(raw.date)) return "Invalid date";
  if (!SHIFT_TYPES.includes(raw.shiftType as never)) return "Invalid shift type";
  if (!ATTENDANCE_STATUSES.includes(raw.status as never))
    return "Invalid status";

  const scheduledIn = raw.scheduledIn ?? DEFAULT_SHIFTS.day.in;
  const scheduledOut = raw.scheduledOut ?? DEFAULT_SHIFTS.day.out;
  if (!isValidTime(scheduledIn) || !isValidTime(scheduledOut))
    return "Invalid scheduled time";

  const bad = [raw.actualIn, raw.actualOut].find((v) => v && !isValidTime(v));
  if (bad) return `Invalid time: ${bad}`;
  const actualIn = raw.actualIn ? hhmm(raw.actualIn) : null;
  const actualOut = raw.actualOut ? hhmm(raw.actualOut) : null;

  if (raw.driverId && !isUuid(raw.driverId)) return "Invalid driver";

  return {
    cabId: raw.cabId,
    date: raw.date,
    shiftType: raw.shiftType as AttendanceInput["shiftType"],
    status: raw.status as AttendanceInput["status"],
    driverId: raw.driverId ?? null,
    scheduledIn: hhmm(scheduledIn) ?? scheduledIn,
    scheduledOut: hhmm(scheduledOut) ?? scheduledOut,
    actualIn,
    actualOut,
    reason: raw.reason ?? "",
    notes: raw.notes ?? "",
  };
}

export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const body = (await request.json()) as { entries?: EntryPayload[] };
    const entries = body.entries ?? [];
    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: "No entries provided" }, { status: 400 });
    }

    const parsed: AttendanceInput[] = [];
    for (const raw of entries) {
      const result = parseEntry(raw);
      if (typeof result === "string") {
        return NextResponse.json({ error: result }, { status: 400 });
      }
      parsed.push(result);
    }

    for (const entry of parsed) {
      await upsertAttendance(entry);
    }
    await learnAssignments();

    return NextResponse.json({ ok: true, saved: parsed.length });
  } catch (error) {
    console.error("attendance POST failed", error);
    return NextResponse.json(
      { error: "Could not save attendance" },
      { status: 500 },
    );
  }
}

/** Bulk action: mark every cab present / absent for a shift on a date. */
export async function PATCH(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const body = (await request.json()) as {
      action?: string;
      date?: string;
      shiftType?: string;
      status?: string;
    };
    if (body.action !== "bulk") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    if (!body.date || !isIsoDate(body.date)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }
    if (!SHIFT_TYPES.includes(body.shiftType as never)) {
      return NextResponse.json({ error: "Invalid shift" }, { status: 400 });
    }
    if (!ATTENDANCE_STATUSES.includes(body.status as never)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const count = await bulkMark(
      body.date,
      body.shiftType as "day" | "night",
      body.status as "present",
    );
    return NextResponse.json({ ok: true, count });
  } catch (error) {
    console.error("attendance PATCH failed", error);
    return NextResponse.json({ error: "Bulk update failed" }, { status: 500 });
  }
}

/** Clear a single attendance record (resets that slot back to pending). */
export async function DELETE(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id || !isUuid(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    await db.delete(attendance).where(eq(attendance.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("attendance DELETE failed", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
