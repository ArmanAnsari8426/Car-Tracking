import { NextResponse } from "next/server";
import { guard, setAdminCookies } from "@/lib/auth";
import { isValidPin, normalizePin } from "@/lib/pin";
import {
  adminSessionToken,
  getDriverFormKey,
  getPublicUrl,
  hasAdminPin,
  isDriverFormEnabled,
  regenerateDriverFormKey,
  setAdminPin,
  setSetting,
} from "@/lib/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  return NextResponse.json({
    driverFormEnabled: await isDriverFormEnabled(),
    key: await getDriverFormKey(),
    publicUrl: await getPublicUrl(),
    hasPin: await hasAdminPin(),
  }, { headers: noStore });
}

export async function PATCH(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const raw: unknown = await request.json().catch(() => null);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return NextResponse.json({ error: "Invalid settings input." }, { status: 400, headers: noStore });
    }
    const b = raw as Record<string, unknown>;
    for (const [field, kind] of [["adminPin", "string"], ["confirmPin", "string"], ["publicUrl", "string"], ["regenerateKey", "boolean"], ["driverFormEnabled", "boolean"]]) {
      if (b[field] !== undefined && typeof b[field] !== kind) {
        return NextResponse.json({ error: "Invalid settings input." }, { status: 400, headers: noStore });
      }
    }
    const pin = typeof b.adminPin === "string" ? normalizePin(b.adminPin) : undefined;
    if (pin && !isValidPin(pin)) {
      return NextResponse.json({ error: "PIN must be 4 to 8 digits. A leading zero is allowed." }, { status: 400, headers: noStore });
    }
    if (pin !== undefined && typeof b.confirmPin === "string" && normalizePin(b.confirmPin) !== pin) {
      return NextResponse.json({ error: "The two PINs do not match." }, { status: 400, headers: noStore });
    }
    const publicUrl = typeof b.publicUrl === "string" ? b.publicUrl.trim().replace(/\/+$/, "") : undefined;
    if (publicUrl) {
      try {
        const u = new URL(publicUrl);
        if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || /\s/.test(publicUrl)) throw new Error("URL");
      } catch {
        return NextResponse.json({ error: "URL must start with https://" }, { status: 400, headers: noStore });
      }
    }

    // Validate everything before changing any state.
    let recovery: string | null | undefined;
    if (pin !== undefined) recovery = await setAdminPin(pin);
    if (typeof b.driverFormEnabled === "boolean") await setSetting("driver_form_enabled", b.driverFormEnabled ? "true" : "false");
    if (publicUrl !== undefined) await setSetting("public_url", publicUrl);
    const key = b.regenerateKey === true ? await regenerateDriverFormKey() : undefined;
    const res = NextResponse.json({ ok: true, key, recovery, pinConfigured: await hasAdminPin() }, { headers: noStore });
    if (pin !== undefined) setAdminCookies(res, request, await adminSessionToken());
    return res;
  } catch (error) {
    console.error("Settings save failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Settings were not saved. Try again." }, { status: 503, headers: noStore });
  }
}
