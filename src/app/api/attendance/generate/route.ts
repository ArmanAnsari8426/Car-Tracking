import { guard } from "@/lib/auth";
import { NextResponse } from "next/server";
import {
  generateDailySheet,
  generateRecentSheets,
} from "@/lib/data";
import { isIsoDate } from "@/lib/tracking";

export const dynamic = "force-dynamic";

/**
 * Auto-generates the daily sheet (one "pending" row per cab per shift) for a
 * date, or for the last N days when `days` is supplied.
 */
export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      date?: string;
      days?: number;
    };
    const date = body.date ?? new Date().toISOString().slice(0, 10);
    if (!isIsoDate(date)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    if (body.days && body.days > 1) {
      const res = await generateRecentSheets(date, Math.min(body.days, 90));
      return NextResponse.json({ ok: true, ...res });
    }

    const res = await generateDailySheet(date);
    return NextResponse.json({ ok: true, date, ...res });
  } catch (error) {
    console.error("generate failed", error);
    return NextResponse.json(
      { error: "Could not generate sheet" },
      { status: 500 },
    );
  }
}
