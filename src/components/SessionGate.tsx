"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

const KEY = "ct_admin_token";

export const getToken = (): string =>
  typeof window === "undefined" ? "" : window.localStorage.getItem(KEY) ?? "";
export const saveToken = (t: string) => {
  if (t && typeof window !== "undefined") window.localStorage.setItem(KEY, t);
};
export const clearToken = () => {
  if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
};

// Patch fetch ONCE, at module load, so every later request — including Next.js
// router RSC fetches — carries the admin token header when we have one.
if (typeof window !== "undefined") {
  const w = window as unknown as { __ctPatched?: boolean };
  if (!w.__ctPatched) {
    w.__ctPatched = true;
    const orig = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const t = getToken();
      if (!t) return orig(input, init);
      const h = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      if (!h.has("x-admin-token")) h.set("x-admin-token", t);
      return orig(input, { ...init, headers: h });
    };
  }
}

/**
 * Mounted in the root layout. If the browser already holds a token (e.g. cookie
 * was blocked by the iframe), one refresh re-renders the app with the header.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    if (getToken()) router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>{children}</>;
}
