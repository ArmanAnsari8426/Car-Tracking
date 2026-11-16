"use client";

import { cx } from "@/lib/cx";

/* ------------------------------------------------------------------ */
/* Stacked column chart                                                */
/* ------------------------------------------------------------------ */

export type BarSegment = { value: number; color: string; label: string };

export function StackedBarChart({
  data,
  height = 190,
  highlightIndex,
}: {
  data: { label: string; sublabel?: string; segments: BarSegment[] }[];
  height?: number;
  highlightIndex?: number;
}) {
  const max = Math.max(
    1,
    ...data.map((d) => d.segments.reduce((s, x) => s + x.value, 0)),
  );

  return (
    <div className="w-full">
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d, i) => {
          const total = d.segments.reduce((s, x) => s + x.value, 0);
          return (
            <div
              key={d.label}
              className="group relative flex h-full flex-1 flex-col justify-end"
              title={`${d.sublabel ?? d.label}: ${total}`}
            >
              <div className="flex w-full flex-col-reverse gap-[2px] overflow-hidden rounded-md">
                {d.segments.map((seg) => (
                  <div
                    key={seg.label}
                    className={cx(
                      "w-full transition-all",
                      seg.color,
                      i === highlightIndex && "brightness-110",
                    )}
                    style={{
                      height: `${(seg.value / max) * 100}%`,
                      minHeight: seg.value > 0 ? 3 : 0,
                    }}
                  />
                ))}
              </div>
              {/* tooltip */}
              <div className="pointer-events-none absolute -top-1 left-1/2 z-20 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium text-white shadow-xl group-hover:block">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">
                  {d.sublabel ?? d.label}
                </div>
                {d.segments.map((s) => (
                  <div key={s.label} className="flex items-center gap-1.5">
                    <span className={cx("size-1.5 rounded-full", s.color)} />
                    {s.label}: <span className="font-semibold">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1.5">
        {data.map((d, i) => (
          <div
            key={d.label}
            className={cx(
              "flex-1 text-center text-[10px] font-medium tabular-nums",
              i === highlightIndex ? "text-slate-900" : "text-slate-400",
            )}
          >
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Donut chart                                                        */
/* ------------------------------------------------------------------ */

export function DonutChart({
  data,
  size = 168,
  thickness = 22,
  centerLabel,
  centerValue,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#f1f5f9"
            strokeWidth={thickness}
          />
          {total > 0 &&
            data.map((d) => {
              const frac = d.value / total;
              const dash = frac * circumference;
              const el = (
                <circle
                  key={d.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={d.color}
                  strokeWidth={thickness}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                />
              );
              offset += dash;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-2xl font-bold tabular-nums text-slate-900">
              {centerValue ?? total}
            </div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              {centerLabel ?? "Total"}
            </div>
          </div>
        </div>
      </div>
      <ul className="flex-1 space-y-2.5">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2.5 text-[13px]">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: d.color }}
            />
            <span className="flex-1 text-slate-600">{d.label}</span>
            <span className="font-semibold tabular-nums text-slate-900">
              {d.value}
            </span>
            <span className="w-10 text-right text-[11px] tabular-nums text-slate-400">
              {total ? Math.round((d.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Horizontal bars                                                    */
/* ------------------------------------------------------------------ */

export function HorizontalBars({
  data,
  valueSuffix = "%",
}: {
  data: {
    label: string;
    sublabel?: string;
    value: number;
    display?: string;
    color?: string;
  }[];
  valueSuffix?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-3.5">
      {data.map((d) => (
        <li key={d.label}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="truncate text-[13px] font-medium text-slate-700">
              {d.label}
              {d.sublabel ? (
                <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                  {d.sublabel}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 text-[13px] font-semibold tabular-nums text-slate-900">
              {d.display ?? `${d.value}${valueSuffix}`}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.max(1.5, (d.value / max) * 100)}%`,
                background: d.color ?? "#6366f1",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Sparkline / area chart                                             */
/* ------------------------------------------------------------------ */

export function AreaTrend({
  data,
  color = "#6366f1",
  height = 64,
}: {
  data: number[];
  color?: string;
  height?: number;
}) {
  if (data.length < 2) return null;
  const w = 100;
  const h = 30;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 2) - 1;
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  const gid = `grad-${color.replace("#", "")}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Legend                                                             */
/* ------------------------------------------------------------------ */

export function Legend({
  items,
}: {
  items: { label: string; color: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((i) => (
        <span
          key={i.label}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500"
        >
          <span
            className="size-2 rounded-full"
            style={{ background: i.color }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}
