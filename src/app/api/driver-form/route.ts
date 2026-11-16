import { NextResponse } from "next/server";
import { dutyAction, getDutyCab, lookupCabs } from "@/lib/duty";
import { getDriverFormKey, isDriverFormEnabled } from "@/lib/settings";
import { isUuid } from "@/lib/tracking";

export const dynamic = "force-dynamic";

async function check(k: string | null | undefined): Promise<NextResponse | null> {
  if (!(await isDriverFormEnabled())) {
    return NextResponse.json({ error: "The driver form is currently closed — contact the owner" }, { status: 403 });
  }
  if (!k || k !== (await getDriverFormKey())) {
    return NextResponse.json({ error: "This link is old or invalid — ask the owner for a new link" }, { status: 403 });
  }
  return null;
}

/** Lookup: ?k=KEY&q=6430  (or &cabId=uuid) */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const denied = await check(url.searchParams.get("k"));
  if (denied) return denied;
  const cabId = url.searchParams.get("cabId");
  if (cabId && isUuid(cabId)) {
    const cab = await getDutyCab(cabId);
    return NextResponse.json({ cabs: cab ? [cab] : [] });
  }
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.replace(/[^a-z0-9]/gi, "").length < 3) {
    return NextResponse.json({ error: "Enter at least 3 digits (e.g. 6430)" }, { status: 400 });
  }
  return NextResponse.json({ cabs: await lookupCabs(q) });
}

/** Duty ON / OFF / LEAVE */
export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as {
    k?: string; cabId?: string; action?: string; shiftType?: string; driverId?: string | null; note?: string;
  };
  const denied = await check(b.k);
  if (denied) return denied;
  if (!b.cabId || !isUuid(b.cabId)) return NextResponse.json({ error: "Choose a cab first" }, { status: 400 });
  if (b.action !== "on" && b.action !== "off" && b.action !== "leave") {
    return NextResponse.json({ error: "Choose DUTY ON / DUTY OFF / LEAVE" }, { status: 400 });
  }
  const res = await dutyAction({
    cabId: b.cabId,
    action: b.action,
    shiftType: b.shiftType === "day" || b.shiftType === "night" ? b.shiftType : undefined,
    driverId: b.driverId && isUuid(b.driverId) ? b.driverId : null,
    note: typeof b.note === "string" ? b.note : "",
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ...res, cab: await getDutyCab(b.cabId) });
}
