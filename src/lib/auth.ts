import { timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { adminSessionToken } from "./settings";

export const ADMIN_COOKIE = "ct_admin";
export const EMBEDDED_ADMIN_COOKIE = "ct_admin_embed";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
type HeaderSource = Pick<Headers, "get">;
const first = (v: string | null) => (v ?? "").split(",")[0].trim().toLowerCase();

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** The TLS connection may terminate at a reverse proxy before reaching Next. */
export function requestIsSecure(request: Request): boolean {
  const proto = first(request.headers.get("x-forwarded-proto"));
  if (proto === "https") return true;
  if (proto === "http") return false;
  const forwarded = request.headers.get("forwarded") ?? "";
  if (/(?:^|[;,]\s*)proto="?https"?(?:[;,]|$)/i.test(forwarded)) return true;
  if (new URL(request.url).protocol === "https:") return true;
  const origin = request.headers.get("origin");
  if (origin) {
    try { return new URL(origin).protocol === "https:"; } catch { /* invalid origin */ }
  }
  return false;
}

/** SameSite=None is needed in the preview iframe, so validate request origins too. */
export function requestOriginError(h: HeaderSource): NextResponse | null {
  const origin = h.get("origin");
  if (!origin) return null; // CLI/server clients have no ambient browser cookies.
  try {
    const parsed = new URL(origin);
    const hosts = [first(h.get("host")), first(h.get("x-forwarded-host"))].filter(Boolean);
    const proto = first(h.get("x-forwarded-proto"));
    if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || !hosts.includes(parsed.host.toLowerCase())) throw new Error("origin");
    if ((proto === "http" || proto === "https") && parsed.protocol !== `${proto}:`) throw new Error("protocol");
    return null;
  } catch {
    return NextResponse.json({ error: "This request came from an unauthorized website. Try again from the app's own page." }, { status: 403 });
  }
}

/**
 * Keep the normal first-party session, plus an independent CHIPS session for
 * embedded previews. Never put admin tokens in URLs or localStorage.
 */
export function setAdminCookies(response: NextResponse, request: Request, token: string) {
  const secure = requestIsSecure(request);
  const options = { httpOnly: true, path: "/", maxAge: token ? SESSION_MAX_AGE : 0, priority: "high" as const };
  response.cookies.set(ADMIN_COOKIE, token, { ...options, secure, sameSite: "lax" });
  if (secure) {
    response.cookies.set(EMBEDDED_ADMIN_COOKIE, token, {
      ...options,
      secure: true,
      sameSite: "none",
      partitioned: true,
    });
  }
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
}

/** True when no admin PIN is set, or this browser has a valid admin session. */
export async function isAdmin(): Promise<boolean> {
  const token = await adminSessionToken();
  if (!token) return true;
  const store = await cookies();
  return [store.get(ADMIN_COOKIE)?.value, store.get(EMBEDDED_ADMIN_COOKIE)?.value]
    .some((value) => !!value && equal(value, token));
}

/** Every protected API checks both the session and browser request origin. */
export async function guard(): Promise<NextResponse | null> {
  const originError = requestOriginError(await headers());
  if (originError) return originError;
  return (await isAdmin())
    ? null
    : NextResponse.json({ error: "Your session has ended. Log in again with the admin PIN.", code: "LOGIN_REQUIRED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
}
