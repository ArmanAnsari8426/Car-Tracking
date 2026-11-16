import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { listNotifications, markRead, runChecks, unreadCount } from "@/lib/notify";
import { isUuid } from "@/lib/tracking";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  await runChecks();
  const after = new URL(request.url).searchParams.get("after");
  const d = after ? new Date(after) : undefined;
  const items = await listNotifications(d && !Number.isNaN(d.getTime()) ? d : undefined, 30);
  return NextResponse.json({ items, unread: await unreadCount() });
}

export async function PATCH(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const b = (await request.json().catch(() => ({}))) as { ids?: string[] };
  await markRead(Array.isArray(b.ids) ? b.ids.filter((x) => typeof x === "string" && isUuid(x)) : undefined);
  return NextResponse.json({ ok: true, unread: await unreadCount() });
}
