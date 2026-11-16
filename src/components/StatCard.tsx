import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

export function StatCard({
  label,
  value,
  sub,
  icon,
  accent = "indigo",
  trend,
}: {
  label: string;
  value: string | number;
  sub?: ReactNode;
  icon?: string;
  accent?: "indigo" | "emerald" | "rose" | "amber" | "sky" | "violet" | "slate";
  trend?: ReactNode;
}) {
  const accents: Record<string, string> = {
    indigo: "from-indigo-500 to-violet-500",
    emerald: "from-emerald-500 to-teal-500",
    rose: "from-rose-500 to-pink-500",
    amber: "from-amber-500 to-orange-500",
    sky: "from-sky-500 to-cyan-500",
    violet: "from-violet-500 to-fuchsia-500",
    slate: "from-slate-600 to-slate-800",
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_28px_-16px_rgba(15,23,42,0.16)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </p>
        {icon ? (
          <span
            className={cx(
              "grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-[15px] text-white shadow-sm",
              accents[accent],
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-[28px] font-bold leading-none tracking-tight text-slate-900 tabular-nums">
          {value}
        </span>
        {trend ? <span className="mb-0.5">{trend}</span> : null}
      </div>
      {sub ? (
        <div className="mt-2 text-[12px] leading-snug text-slate-500">{sub}</div>
      ) : null}
    </div>
  );
}
