import { guard } from "@/lib/auth";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { attendance, cabShifts, cabs } from "@/db/schema";
import { saveCabShifts, shiftInputError, type CabShiftInput } from "@/lib/cab-save";

export const dynamic = "force-dynamic";

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const body = (await request.json()) as CabShiftInput & {
      cabNumber?: string; model?: string; ownerName?: string; color?: string;
      capacity?: number; fuelType?: string; status?: string; notes?: string;
    };
    const cabNumber = (body.cabNumber ?? "").trim().toUpperCase();
    if (!cabNumber) return NextResponse.json({ error: "Cab number is required" }, { status: 400 });
    if (body.color && !HEX.test(body.color)) return NextResponse.json({ error: "Invalid colour" }, { status: 400 });
    const err = shiftInputError(body);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    const [dup] = await db.select({ id: cabs.id }).from(cabs).where(eq(cabs.cabNumber, cabNumber)).limit(1);
    if (dup) return NextResponse.json({ error: "This cab number already exists" }, { status: 409 });

    const [row] = await db
      .insert(cabs)
      .values({
        cabNumber,
        model: body.model?.trim() ?? "",
        ownerName: body.ownerName?.trim() ?? "",
        color: body.color ?? "#6366f1",
        capacity: Number(body.capacity) || 4,
        fuelType: body.fuelType?.trim() || "CNG",
        status: body.status === "inactive" || body.status === "maintenance" ? body.status : "active",
        notes: body.notes?.trim() ?? "",
      })
      .returning();
    await saveCabShifts(row.id, body);
    return NextResponse.json({ ok: true, cab: row });
  } catch (error) {
    console.error("cab create failed", error);
    return NextResponse.json({ error: "Could not add cab" }, { status: 500 });
  }
}

/** Bulk: switch a shift ON/OFF for every cab. */
export async function PATCH(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const body = (await request.json()) as { shiftType?: string; enabled?: boolean };
    if ((body.shiftType !== "day" && body.shiftType !== "night") || typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    await db.update(cabShifts).set({ enabled: body.enabled }).where(eq(cabShifts.shiftType, body.shiftType));
    if (!body.enabled) {
      await db.delete(attendance).where(and(eq(attendance.shiftType, body.shiftType), eq(attendance.status, "pending"), eq(attendance.source, "auto")));
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("bulk shift failed", error);
    return NextResponse.json({ error: "Update fail" }, { status: 500 });
  }
}
