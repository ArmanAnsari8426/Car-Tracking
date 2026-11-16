import { guard } from "@/lib/auth";
import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { cabs } from "@/db/schema";
import { saveCabShifts, shiftInputError, type CabShiftInput } from "@/lib/cab-save";
import { isUuid } from "@/lib/tracking";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid cab" }, { status: 400 });
    const body = (await request.json()) as CabShiftInput & {
      cabNumber?: string; model?: string; ownerName?: string; color?: string;
      capacity?: number; fuelType?: string; status?: string; notes?: string;
    };
    const err = shiftInputError(body);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const updates: Partial<typeof cabs.$inferInsert> = {};
    if (body.cabNumber !== undefined) {
      const n = body.cabNumber.trim().toUpperCase();
      if (!n) return NextResponse.json({ error: "Cab number cannot be empty" }, { status: 400 });
      const [dup] = await db.select({ id: cabs.id }).from(cabs).where(and(eq(cabs.cabNumber, n), ne(cabs.id, id))).limit(1);
      if (dup) return NextResponse.json({ error: "This cab number belongs to another cab" }, { status: 409 });
      updates.cabNumber = n;
    }
    if (body.model !== undefined) updates.model = body.model.trim();
    if (body.ownerName !== undefined) updates.ownerName = body.ownerName.trim();
    if (body.color !== undefined) updates.color = body.color;
    if (body.capacity !== undefined) updates.capacity = Number(body.capacity) || 4;
    if (body.fuelType !== undefined) updates.fuelType = body.fuelType.trim();
    if (body.status !== undefined) updates.status = body.status;
    if (body.notes !== undefined) updates.notes = body.notes.trim();
    if (Object.keys(updates).length) await db.update(cabs).set(updates).where(eq(cabs.id, id));
    await saveCabShifts(id, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("cab update failed", error);
    return NextResponse.json({ error: "Could not update cab" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid cab" }, { status: 400 });
    await db.delete(cabs).where(eq(cabs.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("cab delete failed", error);
    return NextResponse.json({ error: "Could not delete cab" }, { status: 500 });
  }
}
