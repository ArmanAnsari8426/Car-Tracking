import { headers } from "next/headers";
import { getPublicUrl } from "./settings";

/** Public base URL of the app (setting first, else the current host). */
export async function appBaseUrl(): Promise<string> {
  const pub = await getPublicUrl();
  if (pub) return pub;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const local = host.startsWith("localhost") || host.startsWith("127.");
  const proto = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return `${proto}://${host}`;
}
