"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cx } from "@/lib/cx";

export type Note = { id: string; type: string; title: string; message: string; read: boolean; createdAt: string };

type Ctx = {
  items: Note[];
  unread: number;
  markAll: () => void;
  soundOn: boolean;
  toggleSound: () => void;
  browserOn: boolean;
  enableBrowser: () => void;
};

const NotifCtx = createContext<Ctx | null>(null);
export const useNotifications = () => useContext(NotifCtx);

export const NOTE_TONE: Record<string, string> = {
  duty_on: "border-emerald-300 bg-emerald-50",
  late: "border-amber-300 bg-amber-50",
  duty_off: "border-slate-300 bg-white",
  early_off: "border-rose-400 bg-rose-50",
  leave: "border-sky-300 bg-sky-50",
  not_reported: "border-amber-400 bg-amber-50",
  info: "border-slate-200 bg-white",
};

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min early`;
  if (s < 86400) return `${Math.floor(s / 3600)} ghante early`;
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function beep() {
  try {
    const W = window as unknown as { webkitAudioContext?: typeof AudioContext };
    const AC = window.AudioContext ?? W.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.08;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.25);
  } catch {
    /* ignore */
  }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [items, setItems] = useState<Note[]>([]);
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState<Note[]>([]);
  const [soundOn, setSoundOn] = useState(true);
  const [browserOn, setBrowserOn] = useState(false);
  const latest = useRef<string | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const first = useRef(true);
  const prefs = useRef({ sound: true, browser: false });

  useEffect(() => {
    const sound = window.localStorage.getItem("ct_sound") !== "off";
    const browser = typeof Notification !== "undefined" && Notification.permission === "granted";
    setSoundOn(sound);
    setBrowserOn(browser);
    prefs.current = { sound, browser };
  }, []);

  const poll = useCallback(async () => {
    try {
      const url = latest.current ? `/api/notifications?after=${encodeURIComponent(latest.current)}` : "/api/notifications";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items: Note[]; unread: number };
      setUnread(data.unread);
      const fresh = data.items.filter((n) => !seen.current.has(n.id));
      if (data.items.length) latest.current = data.items[0].createdAt;
      if (fresh.length) {
        fresh.forEach((n) => seen.current.add(n.id));
        setItems((prev) => [...fresh, ...prev].slice(0, 40));
        if (!first.current) {
          setToasts((t) => [...fresh.slice(0, 3), ...t].slice(0, 4));
          if (prefs.current.sound) beep();
          if (prefs.current.browser && document.hidden) {
            fresh.slice(0, 3).forEach((n) => {
              try {
                new Notification(n.title, { body: n.message });
              } catch {
                /* ignore */
              }
            });
          }
          router.refresh();
        }
      }
      first.current = false;
    } catch {
      /* offline — try again later */
    }
  }, [router]);

  useEffect(() => {
    void poll();
    const t = window.setInterval(poll, 15000);
    return () => window.clearInterval(t);
  }, [poll]);

  useEffect(() => {
    if (!toasts.length) return;
    const t = window.setTimeout(() => setToasts((x) => x.slice(0, -1)), 8000);
    return () => window.clearTimeout(t);
  }, [toasts]);

  const markAll = () => {
    setUnread(0);
    setItems((p) => p.map((n) => ({ ...n, read: true })));
    void fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" });
  };
  const toggleSound = () => {
    const v = !soundOn;
    setSoundOn(v);
    prefs.current.sound = v;
    window.localStorage.setItem("ct_sound", v ? "on" : "off");
    if (v) beep();
  };
  const enableBrowser = () => {
    if (typeof Notification === "undefined") return;
    void Notification.requestPermission().then((p) => {
      const ok = p === "granted";
      setBrowserOn(ok);
      prefs.current.browser = ok;
    });
  };

  return (
    <NotifCtx.Provider value={{ items, unread, markAll, soundOn, toggleSound, browserOn, enableBrowser }}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[70] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2 print:hidden">
        {toasts.map((n) => (
          <div key={n.id} className={cx("pointer-events-auto rounded-2xl border-l-4 px-4 py-3 shadow-xl", NOTE_TONE[n.type] ?? NOTE_TONE.info)}>
            <div className="flex items-start justify-between gap-2">
              <div className="text-[13.5px] font-bold text-slate-900">{n.title}</div>
              <button onClick={() => setToasts((t) => t.filter((x) => x.id !== n.id))} className="text-slate-400 hover:text-slate-700">
                ✕
              </button>
            </div>
            {n.message ? <div className="mt-0.5 text-[12.5px] text-slate-600">{n.message}</div> : null}
          </div>
        ))}
      </div>
    </NotifCtx.Provider>
  );
}

export function Bell({ placement = "right" }: { placement?: "right" | "below" }) {
  const ctx = useNotifications();
  const [open, setOpen] = useState(false);
  if (!ctx) return null;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative grid size-9 place-items-center rounded-xl bg-white/10 text-[17px] text-white hover:bg-white/20"
        aria-label="Notifications"
      >
        🔔
        {ctx.unread ? (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-rose-500 px-1 text-center text-[10.5px] font-bold leading-[18px] text-white">
            {ctx.unread > 99 ? "99+" : ctx.unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={cx(
              "absolute z-50 w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl bg-white text-slate-900 shadow-2xl ring-1 ring-slate-900/10",
              placement === "right" ? "left-full top-0 ml-3" : "right-0 top-full mt-2",
            )}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="text-[14px] font-bold">🔔 Live updates</div>
              <button onClick={ctx.markAll} className="text-[12px] font-semibold text-indigo-600">
                Mark all read
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {ctx.items.length === 0 ? (
                <p className="px-4 py-8 text-center text-[13px] text-slate-400">No updates yet. When a driver submits Duty ON/OFF, it will appear here.</p>
              ) : (
                ctx.items.map((n) => (
                  <div key={n.id} className={cx("border-b border-slate-50 px-4 py-2.5", !n.read && "bg-indigo-50/50")}>
                    <div className="text-[13px] font-semibold">{n.title}</div>
                    {n.message ? <div className="text-[12px] text-slate-500">{n.message}</div> : null}
                    <div className="mt-0.5 text-[10.5px] text-slate-400">{timeAgo(n.createdAt)}</div>
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5 text-[12px]">
              <button onClick={ctx.toggleSound} className="font-semibold text-slate-600">
                {ctx.soundOn ? "🔊 Sound ON" : "🔇 Sound OFF"}
              </button>
              {ctx.browserOn ? (
                <span className="text-emerald-600">✓ Browser alerts ON</span>
              ) : (
                <button onClick={ctx.enableBrowser} className="font-semibold text-indigo-600">
                  Turn on browser alerts
                </button>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
