import { guard } from "@/lib/auth";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { drivers } from "@/db/schema";
import { assignDriver } from "@/lib/cab-save";
import { isIsoDate, isUuid } from "@/lib/tracking";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Invalid driver" }, { status: 400 });
    }
    const body = (await request.json()) as {
      name?: string;
      phone?: string;
      licenseNumber?: string;
      licenseExpiry?: string | null;
      status?: string;
      notes?: string;
      assignCabId?: string;
      assignShift?: string;
    };
    if (body.licenseExpiry && !isIsoDate(body.licenseExpiry)) {
      return NextResponse.json({ error: "Invalid licence expiry date" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.phone !== undefined) updates.phone = body.phone.trim();
    if (body.licenseNumber !== undefined)
      updates.licenseNumber = body.licenseNumber.trim();
    if (body.licenseExpiry !== undefined)
      updates.licenseExpiry = body.licenseExpiry || null;
    if (body.status !== undefined) updates.status = body.status;
    if (body.notes !== undefined) updates.notes = body.notes.trim();

    if (Object.keys(updates).length) await db.update(drivers).set(updates).where(eq(drivers.id, id));
    if (body.assignCabId && isUuid(body.assignCabId) && (body.assignShift === "day" || body.assignShift === "night")) {
      await assignDriver(id, body.assignCabId, body.assignShift);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("driver update failed", error);
    return NextResponse.json({ error: "Could not update driver" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Invalid driver" }, { status: 400 });
    }
    await db.delete(drivers).where(eq(drivers.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("driver delete failed", error);
    return NextResponse.json({ error: "Could not delete driver" }, { status: 500 });
  }
}
