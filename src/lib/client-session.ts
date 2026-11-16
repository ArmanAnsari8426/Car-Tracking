/** Verify that the browser actually stored the server's HttpOnly session cookie. */
export async function browserSession(): Promise<{ authenticated: boolean; pinConfigured: boolean }> {
  const res = await fetch("/api/login", { credentials: "include", cache: "no-store" });
  if (!res.ok) throw new Error("Could not check login status. Try again.");
  const data = await res.json() as { authenticated?: boolean; pinConfigured?: boolean };
  return { authenticated: data.authenticated === true, pinConfigured: data.pinConfigured === true };
}

export const COOKIE_BLOCKED_MESSAGE = "PIN verified, but the browser blocked the login cookie. Allow site data/cookies for this preview and press Login again. You do not need to change your PIN.";
