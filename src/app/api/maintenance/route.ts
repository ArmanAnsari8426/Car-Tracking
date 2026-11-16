import { guard } from "@/lib/auth";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

/** Clears every attendance record (cabs and drivers are kept). */
export async function DELETE() {
  const denied = await guard();
  if (denied) return denied;
  try {
    await db.execute(sql`truncate table attendance restart identity`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("clear attendance failed", error);
    return NextResponse.json({ error: "Could not clear attendance" }, { status: 500 });
  }
}
