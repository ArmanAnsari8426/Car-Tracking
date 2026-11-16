"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui";
import {
  formatDateLabel,
  isIsoDate,
  shiftDate,
  todayIso,
} from "@/lib/tracking";

export function DateNav({
  basePath,
  extraParams,
}: {
  basePath: string;
  extraParams?: Record<string, string>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const current =
    (params.get("date") && isIsoDate(params.get("date")!)
      ? params.get("date")!
      : null) ?? todayIso();
  const [pending, startTransition] = useTransition();

  const go = (date: string) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(extraParams ?? {})) {
      if (v) q.set(k, v);
    }
    q.set("date", date);
    startTransition(() => router.push(`${basePath}?${q.toString()}`));
  };

  const isToday = current === todayIso();

  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-1">
      <button
        onClick={() => go(shiftDate(current, -1))}
        disabled={pending}
        className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
        aria-label="Previous day"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <div className="min-w-[150px] px-1 text-center">
        <div className="text-[13px] font-semibold text-slate-900">
          {formatDateLabel(current)}
        </div>
        <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
          {isToday ? "Today" : shiftDate(current, 1) === todayIso() ? "Yesterday" : "Selected date"}
        </div>
      </div>
      <button
        onClick={() => go(shiftDate(current, 1))}
        disabled={pending}
        className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
        aria-label="Next day"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
      {!isToday ? (
        <Button size="sm" variant="ghost" onClick={() => go(todayIso())} className="ml-1">
          Today
        </Button>
      ) : null}
    </div>
  );
}
