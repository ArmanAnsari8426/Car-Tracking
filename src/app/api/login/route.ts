import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdmin, requestOriginError, setAdminCookies } from "@/lib/auth";
import { adminSessionToken, consumeRecoveryCode, hasAdminPin, verifyAdmin } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const WINDOW = 5 * 60_000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, { count: number; until: number }>();
const noStore = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };

function attemptKey(request: Request): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "local";
  return createHash("sha256").update(ip).digest("hex");
}

/** The UI verifies this after login so blocked cookies don't cause a silent loop. */
export async function GET() {
  const [authenticated, pinConfigured] = await Promise.all([isAdmin(), hasAdminPin()]);
  return NextResponse.json({ authenticated, pinConfigured }, { headers: noStore });
}

export async function POST(request: Request) {
  const originError = requestOriginError(request.headers);
  if (originError) return originError;
  try {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || !("pin" in body) || typeof body.pin !== "string" || !body.pin.trim() || body.pin.length > 128) {
      return NextResponse.json({ error: "Enter your PIN or recovery code." }, { status: 400, headers: noStore });
    }
    const key = attemptKey(request);
    const prior = attempts.get(key);
    if (prior && prior.until > Date.now() && prior.count >= MAX_ATTEMPTS) {
      const retryAfter = Math.ceil((prior.until - Date.now()) / 1000);
      return NextResponse.json({ error: "Too many wrong PIN attempts. Try again later.", retryAfter }, {
        status: 429, headers: { ...noStore, "Retry-After": String(retryAfter) },
      });
    }
    const how = await verifyAdmin(body.pin);
    const recovered = how === "recovery" && await consumeRecoveryCode(body.pin);
    if (!how || (how === "recovery" && !recovered)) {
      const bucket = prior && prior.until > Date.now() ? prior : { count: 0, until: Date.now() + WINDOW };
      attempts.set(key, { count: bucket.count + 1, until: bucket.until });
      if (attempts.size > 2000) {
        for (const [k, v] of attempts) if (v.until <= Date.now()) attempts.delete(k);
      }
      return NextResponse.json({ error: "Wrong PIN. Check it again or log in with the recovery code.", code: "INVALID_PIN" }, { status: 401, headers: noStore });
    }
    attempts.delete(key);
    const token = await adminSessionToken();
    const res = NextResponse.json({ ok: true, recoveryUsed: recovered, redirectTo: recovered ? "/share#pin" : null }, { headers: noStore });
    setAdminCookies(res, request, token);
    return res;
  } catch (error) {
    console.error("Admin login failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "The login service is not responding. Try again shortly." }, { status: 503, headers: noStore });
  }
}

export async function DELETE(request: Request) {
  const originError = requestOriginError(request.headers);
  if (originError) return originError;
  const res = NextResponse.json({ ok: true }, { headers: noStore });
  setAdminCookies(res, request, "");
  return res;
}
