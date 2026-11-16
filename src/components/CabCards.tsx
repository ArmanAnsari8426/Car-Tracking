import Link from "next/link";
import { cx } from "@/lib/cx";
import type { Driver } from "@/db/schema";
import type { SheetEntry } from "@/lib/data";
import { SHIFT_ICON, SHIFT_LABEL, STATUS_META, formatTime, minutesToLabel } from "@/lib/tracking";

function ShiftRow({ entry, driverMap }: { entry: SheetEntry; driverMap: Map<string, Driver> }) {
  const meta = STATUS_META[entry.status];
  const working = entry.status === "present" || entry.status === "half_day";
  const driver = entry.driverId ? driverMap.get(entry.driverId) : undefined;
  const regular = entry.defaultDriverId ? driverMap.get(entry.defaultDriverId) : undefined;
  const shown = driver ?? regular;
  const isSub = Boolean(driver && regular && driver.id !== regular.id);
  return (
    <div
      className={cx(
        "rounded-xl px-3 py-2.5 ring-1 ring-inset",
        entry.shiftType === "day" ? "bg-amber-50/60 ring-amber-100" : "bg-indigo-50/60 ring-indigo-100",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700">
          <span>{SHIFT_ICON[entry.shiftType]}</span>
          {SHIFT_LABEL[entry.shiftType]}
          <span className="font-normal text-slate-400">
            {formatTime(entry.scheduledIn)} → {formatTime(entry.scheduledOut)}
          </span>
        </div>
        <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", meta.chip)}>
          <span className={cx("size-1.5 rounded-full", meta.dot)} />
          {meta.label}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-600">
        {working ? (
          <>
            <span>
              <span className="text-slate-400">In </span>
              <b className="tabular-nums text-slate-800">{formatTime(entry.actualIn)}</b>
            </span>
            <span>
              <span className="text-slate-400">Out </span>
              <b className="tabular-nums text-slate-800">{formatTime(entry.actualOut)}</b>
            </span>
            {entry.lateMinutes > 0 ? (
              <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[10.5px] font-bold text-rose-700">
                LATE {minutesToLabel(entry.lateMinutes)}
              </span>
            ) : (
              <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-700">ON TIME</span>
            )}
          </>
        ) : (
          <span className="text-slate-500">{entry.reason || (entry.status === "pending" ? "Time not entered yet" : "—")}</span>
        )}
      </div>
      <div className="mt-1.5 text-[11.5px]">
        {shown ? (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span className="grid size-4 place-items-center rounded-full bg-slate-200 text-[8px] font-bold text-slate-600">
              {shown.name.slice(0, 1)}
            </span>
            <span className="font-semibold text-slate-700">{shown.name}</span>
            {shown.phone ? <span className="text-slate-400">{shown.phone}</span> : null}
            {isSub ? <span className="text-[10.5px] text-amber-600">(regular: {regular?.name})</span> : null}
            {!driver && regular ? <span className="text-[10.5px] text-slate-400">· regular</span> : null}
          </span>
        ) : (
          <span className="text-amber-600">⚠️ Driver not set</span>
        )}
      </div>
    </div>
  );
}

export function CabCard({
  cabNumber,
  model,
  owner,
  color,
  entries,
  drivers,
  presentCount,
  slotCount,
}: {
  cabNumber: string;
  model: string;
  owner?: string;
  color: string;
  entries: SheetEntry[];
  drivers: Driver[];
  presentCount: number;
  slotCount: number;
}) {
  const driverMap = new Map(drivers.map((d) => [d.id, d]));
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_28px_-18px_rgba(15,23,42,0.16)]">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl text-lg text-white shadow-sm" style={{ background: color }}>
          🚕
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[14px] font-bold tracking-tight text-slate-900">{cabNumber}</h3>
            <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
              {presentCount}/{slotCount} present
            </span>
          </div>
          <p className="truncate text-[11.5px] text-slate-500">
            {[model, owner ? `👤 ${owner}` : ""].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {entries.map((e) => (
          <ShiftRow key={e.shiftType} entry={e} driverMap={driverMap} />
        ))}
      </div>
      <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
        <Link href="/attendance" className="text-[11.5px] font-semibold text-indigo-600 hover:text-indigo-500">
          Fill details →
        </Link>
      </div>
    </div>
  );
}
