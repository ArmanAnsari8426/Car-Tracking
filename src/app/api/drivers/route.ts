import { guard } from "@/lib/auth";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { drivers } from "@/db/schema";
import { assignDriver } from "@/lib/cab-save";
import { isIsoDate, isUuid } from "@/lib/tracking";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
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
    const name = (body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Driver name is required" }, { status: 400 });
    }
    if (body.licenseExpiry && !isIsoDate(body.licenseExpiry)) {
      return NextResponse.json({ error: "Invalid licence expiry date" }, { status: 400 });
    }
    const [row] = await db
      .insert(drivers)
      .values({
        name,
        phone: body.phone?.trim() ?? "",
        licenseNumber: body.licenseNumber?.trim() ?? "",
        licenseExpiry: body.licenseExpiry || null,
        status: body.status === "inactive" ? "inactive" : "active",
        notes: body.notes?.trim() ?? "",
      })
      .returning();
    if (body.assignCabId && isUuid(body.assignCabId) && (body.assignShift === "day" || body.assignShift === "night")) {
      await assignDriver(row.id, body.assignCabId, body.assignShift);
    }
    return NextResponse.json({ ok: true, driver: row });
  } catch (error) {
    console.error("driver create failed", error);
    return NextResponse.json({ error: "Could not add driver" }, { status: 500 });
  }
}
