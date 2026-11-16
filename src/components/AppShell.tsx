"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { browserSession } from "@/lib/client-session";
import { cx } from "@/lib/cx";
import { Bell, NotificationProvider } from "@/components/Notifications";

const NAV = [
  { href: "/", label: "Dashboard", icon: "📊", desc: "Live overview + today's report" },
  { href: "/attendance", label: "Daily Attendance", icon: "📝", desc: "Duty sheet · enter manually" },
  { href: "/reports", label: "Reports", icon: "📈", desc: "Daily report · range report" },
  { href: "/share", label: "Driver Form & Link", icon: "📱", desc: "Send link · QR · alerts" },
  { href: "/cabs", label: "Cabs", icon: "🚕", desc: "Add cab · driver · timing" },
  { href: "/drivers", label: "Drivers", icon: "🧑‍✈️", desc: "Driver details · regular cab" },
  { href: "/upload", label: "Upload Data", icon: "📤", desc: "Excel / CSV · backup" },
  { href: "/settings", label: "Automation", icon: "⚙️", desc: "Auto sheet · data tools" },
];

export function AppShell({ children, hasPin }: { children: ReactNode; hasPin: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [locking, setLocking] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);

  const lock = async () => {
    if (locking) return;
    setLocking(true);
    setLockError(null);
    try {
      const res = await fetch("/api/login", { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Logout failed. Try again.");
      const session = await browserSession();
      if (session.pinConfigured && session.authenticated) throw new Error("Session was not cleared. Press Lock again.");
      window.location.reload();
    } catch (error) {
      setLockError(error instanceof Error ? error.message : "Network error. Try again.");
      setLocking(false);
    }
  };

  return (
    <NotificationProvider>
      <div className="min-h-screen bg-[#f6f7fb]">
        <div className="sticky top-0 z-30 flex items-center justify-between bg-slate-950 px-4 py-3 lg:hidden print:hidden">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-base">🚕</span>
            <span className="text-[15px] font-bold tracking-tight text-white">CabTrack</span>
          </Link>
          <div className="flex items-center gap-2">
            <Bell placement="below" />
            <button onClick={() => setOpen((v) => !v)} className="rounded-lg p-2 text-white hover:bg-white/10" aria-label="Menu">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {open ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
              </svg>
            </button>
          </div>
        </div>

        <aside
          className={cx(
            "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-950 transition-transform lg:translate-x-0 print:hidden",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between gap-2 px-5 py-5">
            <div className="flex items-center gap-2.5">
              <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-lg shadow-lg shadow-indigo-900/40">🚕</span>
              <div>
                <div className="text-[15px] font-bold leading-tight text-white">CabTrack</div>
                <div className="text-[11px] font-medium text-slate-400">Daily fleet monitoring</div>
              </div>
            </div>
            <div className="hidden lg:block">
              <Bell placement="right" />
            </div>
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
            {NAV.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cx(
                    "group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors",
                    active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
                  )}
                >
                  <span className="mt-0.5 text-base leading-none">{item.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold leading-tight">{item.label}</span>
                    <span className="block text-[11px] leading-tight text-slate-500">{item.desc}</span>
                  </span>
                  {active ? <span className="ml-auto mt-1.5 size-1.5 rounded-full bg-indigo-400" /> : null}
                </Link>
              );
            })}
          </nav>

          <div className="mx-3 mb-4 space-y-2">
            {lockError ? <p role="alert" className="rounded-lg bg-rose-500/15 px-3 py-2 text-[11.5px] text-rose-200">{lockError}</p> : null}
            <Link
              href="/attendance"
              onClick={() => setOpen(false)}
              className="flex w-full items-center justify-center rounded-lg bg-indigo-500 px-3 py-2 text-[12px] font-semibold text-white hover:bg-indigo-400"
            >
              📝 Today's duty sheet
            </Link>
            {hasPin ? (
              <button onClick={lock} disabled={locking} className="flex w-full items-center justify-center rounded-lg bg-white/10 px-3 py-2 text-[12px] font-semibold text-white hover:bg-white/20 disabled:opacity-50">
                {locking ? "Locking…" : "🔒 Lock (logout)"}
              </button>
            ) : (
              <Link href="/share#pin" onClick={() => setOpen(false)} className="block rounded-lg bg-amber-500/15 px-3 py-2 text-center text-[11.5px] font-semibold text-amber-300">
                ⚠️ Admin PIN not set — set one
              </Link>
            )}
          </div>
        </aside>

        {open ? <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)} /> : null}

        <main className="lg:pl-64 print:pl-0">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8 print:max-w-none print:p-0">{children}</div>
        </main>
      </div>
    </NotificationProvider>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-slate-900 sm:text-[30px]">{title}</h1>
        {subtitle ? <p className="mt-1 text-[14px] text-slate-500">{subtitle}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2 print:hidden">{children}</div> : null}
    </header>
  );
}
