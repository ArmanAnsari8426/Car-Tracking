"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHeader, Select, TextInput, Toast } from "@/components/ui";
import { cx } from "@/lib/cx";
import type { Driver } from "@/db/schema";
import type { SheetEntry } from "@/lib/data";
import {
  ABSENCE_REASONS,
  ATTENDANCE_STATUSES,
  SHIFT_ICON,
  SHIFT_LABEL,
  STATUS_META,
  computeLateMinutes,
  computeEarlyMinutes,
  computeOvertimeMinutes,
  minutesToLabel,
  type AttendanceStatus,
  type ShiftType,
} from "@/lib/tracking";

type Row = {
  key: string;
  cabId: string;
  cabNumber: string;
  cabColor: string;
  cabModel: string;
  ownerName: string;
  defaultDriverId: string;
  shiftType: ShiftType;
  scheduledIn: string;
  scheduledOut: string;
  status: AttendanceStatus;
  driverId: string;
  actualIn: string;
  actualOut: string;
  reason: string;
  notes: string;
  recordId: string | null;
  source: string;
};

function toRow(e: SheetEntry): Row {
  return {
    key: `${e.cab.id}:${e.shiftType}`,
    cabId: e.cab.id,
    cabNumber: e.cab.cabNumber,
    cabColor: e.cab.color,
    cabModel: e.cab.model,
    ownerName: e.cab.ownerName,
    defaultDriverId: e.defaultDriverId ?? "",
    shiftType: e.shiftType,
    scheduledIn: e.scheduledIn,
    scheduledOut: e.scheduledOut,
    status: e.status,
    driverId: e.driverId ?? "",
    actualIn: e.actualIn ?? "",
    actualOut: e.actualOut ?? "",
    reason: e.reason,
    notes: e.notes,
    recordId: e.recordId,
    source: e.source,
  };
}

function rowDiffers(r: Row, o: SheetEntry): boolean {
  return (
    o.status !== r.status ||
    (o.driverId ?? "") !== r.driverId ||
    (o.actualIn ?? "") !== r.actualIn ||
    (o.actualOut ?? "") !== r.actualOut ||
    o.reason !== r.reason ||
    o.notes !== r.notes ||
    o.scheduledIn !== r.scheduledIn ||
    o.scheduledOut !== r.scheduledOut
  );
}

const STATUS_ORDER: AttendanceStatus[] = [
  "present",
  "absent",
  "half_day",
  "leave",
  "off",
  "pending",
];

export function AttendanceSheet({
  date,
  entries,
  drivers,
}: {
  date: string;
  entries: SheetEntry[];
  drivers: Driver[];
}) {
  const router = useRouter();
  const driverName = useMemo(() => new Map(drivers.map((d) => [d.id, d.name])), [drivers]);
  const [rows, setRows] = useState<Row[]>(() => entries.map(toRow));
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);
  const [filter, setFilter] = useState<"all" | "day" | "night" | "pending" | "issue">(
    "all",
  );
  const [query, setQuery] = useState("");

  const update = (key: string, patch: Partial<Row>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        if (patch.status && patch.status !== r.status) {
          if (patch.status === "present" && !next.actualIn) {
            next.actualIn = next.scheduledIn;
          }
          if ((patch.status === "present" || patch.status === "half_day") && !next.driverId && next.defaultDriverId) {
            next.driverId = next.defaultDriverId;
          }
          if (patch.status !== "present" && patch.status !== "half_day") {
            next.actualIn = "";
            next.actualOut = "";
          }
        }
        return next;
      }),
    );
    setSaved((prev) => ({ ...prev, [key]: false }));
  };

  const dirtyRows = useMemo(
    () =>
      rows.filter((r) => {
        const original = entries.find((e) => `${e.cab.id}:${e.shiftType}` === r.key);
        return !original || rowDiffers(r, original);
      }),
    [rows, entries],
  );

  // Live updates (driver Duty ON/OFF) refresh the page — keep the owner's unsaved edits.
  const prevEntries = useRef(entries);
  useEffect(() => {
    if (prevEntries.current === entries) return;
    const old = new Map(prevEntries.current.map((e) => [`${e.cab.id}:${e.shiftType}`, e]));
    prevEntries.current = entries;
    setRows((prev) => {
      const byKey = new Map(prev.map((r) => [r.key, r]));
      return entries.map((e) => {
        const key = `${e.cab.id}:${e.shiftType}`;
        const cur = byKey.get(key);
        const o = old.get(key);
        return cur && o && rowDiffers(cur, o) ? cur : toRow(e);
      });
    });
  }, [entries]);

  const visible = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (filter === "day" && r.shiftType !== "day") return false;
      if (filter === "night" && r.shiftType !== "night") return false;
      if (filter === "pending" && r.status !== "pending") return false;
      if (filter === "issue" && !(r.status === "absent" || r.status === "leave" || r.status === "pending")) return false;
      if (query) {
        const hay = [r.cabNumber, r.ownerName, driverName.get(r.driverId) ?? "", driverName.get(r.defaultDriverId) ?? ""].join(" ").toLowerCase();
        if (!hay.includes(query.toLowerCase().trim())) return false;
      }
      return true;
    });
  }, [rows, filter, query, statusFilter, driverName]);

  const save = async (only?: Row[]) => {
    const target = only && only.length ? only : dirtyRows;
    if (!target.length) {
      setToast("Nothing has changed");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: target.map((r) => ({
            cabId: r.cabId,
            date,
            shiftType: r.shiftType,
            status: r.status,
            driverId: r.driverId || null,
            scheduledIn: r.scheduledIn,
            scheduledOut: r.scheduledOut,
            actualIn: r.actualIn || null,
            actualOut: r.actualOut || null,
            reason: r.reason,
            notes: r.notes,
          })),
        }),
      });
      if (!res.ok) throw new Error("save failed");
      setSaved(Object.fromEntries(target.map((r) => [r.key, true])));
      setToast(`${target.length} row(s) saved ✅`);
      router.refresh();
    } catch {
      setToast("Could not save ❌");
    } finally {
      setSaving(false);
    }
  };

  const bulk = async (shiftType: ShiftType, status: AttendanceStatus) => {
    setSaving(true);
    try {
      await fetch("/api/attendance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk", date, shiftType, status }),
      });
      setToast(`${SHIFT_LABEL[shiftType]} shift — all ${STATUS_META[status].label} ✅`);
      router.refresh();
    } catch {
      setToast("Bulk update failed ❌");
    } finally {
      setSaving(false);
    }
  };

  const generate = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/attendance/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const data = await res.json();
      setToast(`Sheet ready — ${data.created ?? 0} new rows created`);
      router.refresh();
    } catch {
      setToast("Generate failed ❌");
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const header = [
      "Date",
      "Cab",
      "Model",
      "Shift",
      "Scheduled In",
      "Scheduled Out",
      "Actual In",
      "Actual Out",
      "Status",
      "Late (min)",
      "OT (min)",
      "Driver",
      "Reason",
      "Notes",
    ];
    const driverMap = new Map(drivers.map((d) => [d.id, d.name]));
    const lines = rows.map((r) => {
      const late = r.status === "present" ? computeLateMinutes(r.scheduledIn, r.actualIn) : 0;
      const ot = r.status === "present" ? computeOvertimeMinutes(r.scheduledOut, r.actualOut) : 0;
      return [
        date,
        r.cabNumber,
        r.cabModel,
        SHIFT_LABEL[r.shiftType],
        r.scheduledIn,
        r.scheduledOut,
        r.actualIn,
        r.actualOut,
        STATUS_META[r.status].label,
        late,
        ot,
        driverMap.get(r.driverId) ?? "",
        r.reason,
        r.notes,
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",");
    });
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cab-attendance-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // group rows by cab so day + night sit together
  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of visible) {
      const list = map.get(r.cabId) ?? [];
      list.push(r);
      map.set(r.cabId, list);
    }
    return [...map.entries()];
  }, [visible]);

  const counts = useMemo(() => {
    const c: Record<AttendanceStatus, number> = {
      pending: 0,
      present: 0,
      absent: 0,
      leave: 0,
      half_day: 0,
      off: 0,
    };
    rows.forEach((r) => {
      c[r.status] += 1;
    });
    return c;
  }, [rows]);

  const lateCount = rows.filter(
    (r) => r.status === "present" && computeLateMinutes(r.scheduledIn, r.actualIn) > 0,
  ).length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="success" onClick={() => save()} disabled={saving || !dirtyRows.length}>
          {saving ? "Saving…" : `💾 Save changes (${dirtyRows.length})`}
        </Button>
        <Button variant="secondary" onClick={generate} disabled={saving}>
          ⚡ Auto-generate sheet
        </Button>
        <Button variant="ghost" onClick={exportCsv}>
          ⬇️ Export CSV
        </Button>
        <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Quick fill
        </span>
        <Button size="sm" variant="secondary" onClick={() => bulk("day", "present")} disabled={saving}>
          ☀️ Day = all present
        </Button>
        <Button size="sm" variant="secondary" onClick={() => bulk("night", "present")} disabled={saving}>
          🌙 Night = all present
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatusFilter(statusFilter === s ? null : s);
              setFilter("all");
            }}
            className={cx(
              "rounded-xl border bg-white px-3 py-2 text-left transition-colors hover:border-slate-300",
              statusFilter === s ? "border-slate-900 ring-2 ring-slate-900/10" : "border-slate-200",
            )}
          >
            <div className="flex items-center gap-1.5">
              <span className={cx("size-2 rounded-full", STATUS_META[s].dot)} />
              <span className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">
                {STATUS_META[s].label}
              </span>
            </div>
            <div className="mt-0.5 text-[19px] font-bold tabular-nums text-slate-900">
              {counts[s]}
            </div>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader
          icon="📝"
          title="Attendance sheet"
          subtitle="Enter status, driver and actual in/out times — late minutes are calculated automatically on save"
          right={
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-xl border border-slate-200 bg-white p-0.5">
                {(["all", "day", "night", "pending", "issue"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cx(
                      "rounded-lg px-2.5 py-1 text-[11.5px] font-semibold capitalize transition-colors",
                      filter === f
                        ? "bg-slate-900 text-white"
                        : "text-slate-500 hover:text-slate-800",
                    )}
                  >
                    {f === "issue" ? "issues" : f}
                  </button>
                ))}
              </div>
              <TextInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search cab / driver / owner…"
                className="w-40"
              />
            </div>
          }
        />

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Cab</th>
                <th className="px-3 py-2.5 font-semibold">Shift</th>
                <th className="px-3 py-2.5 font-semibold">Scheduled</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">Driver</th>
                <th className="px-3 py-2.5 font-semibold">Actual in</th>
                <th className="px-3 py-2.5 font-semibold">Actual out</th>
                <th className="px-3 py-2.5 font-semibold">Late / OT</th>
                <th className="px-3 py-2.5 font-semibold">Reason</th>
                <th className="px-4 py-2.5 font-semibold">Note</th>
                <th className="px-3 py-2.5 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {grouped.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-slate-400">
                    No rows match this filter.
                  </td>
                </tr>
              ) : (
                grouped.map(([cabId, cabRows]) =>
                  cabRows.map((r, idx) => {
                    const late =
                      r.status === "present"
                        ? computeLateMinutes(r.scheduledIn, r.actualIn)
                        : 0;
                    const ot =
                      r.status === "present"
                        ? computeOvertimeMinutes(r.scheduledOut, r.actualOut)
                        : 0;
                    const early = r.status === "present" ? computeEarlyMinutes(r.scheduledOut, r.actualOut) : 0;
                    const isDirty = dirtyRows.some((d) => d.key === r.key);
                    return (
                      <tr
                        key={r.key}
                        className={cx(
                          "border-b border-slate-50 align-middle last:border-0",
                          r.status === "absent" && "bg-rose-50/40",
                          r.status === "leave" && "bg-sky-50/40",
                          r.status === "pending" && "bg-amber-50/30",
                        )}
                      >
                        {idx === 0 ? (
                          <td
                            rowSpan={cabRows.length}
                            className="px-4 py-3 align-top"
                          >
                            <div className="flex items-center gap-2.5">
                              <span
                                className="grid size-8 shrink-0 place-items-center rounded-lg text-sm text-white"
                                style={{ background: r.cabColor }}
                              >
                                🚕
                              </span>
                              <div className="min-w-0">
                                <div className="text-[13px] font-bold text-slate-900">
                                  {r.cabNumber}
                                </div>
                                <div className="max-w-[130px] truncate text-[11px] text-slate-500">
                                  {r.cabModel}</div>
                                {r.ownerName ? <div className="max-w-[130px] truncate text-[10.5px] text-slate-400">👤 {r.ownerName}</div> : null}
                              </div>
                            </div>
                          </td>
                        ) : null}

                        <td className="px-3 py-3">
                          <span
                            className={cx(
                              "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-semibold",
                              r.shiftType === "day"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-indigo-100 text-indigo-700",
                            )}
                          >
                            {SHIFT_ICON[r.shiftType]} {SHIFT_LABEL[r.shiftType]}
                          </span>
                        </td>

                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            <TextInput
                              type="time"
                              value={r.scheduledIn}
                              onChange={(e) =>
                                update(r.key, { scheduledIn: e.target.value })
                              }
                              className="w-[92px] px-2 py-1 text-[12px]"
                            />
                            <TextInput
                              type="time"
                              value={r.scheduledOut}
                              onChange={(e) =>
                                update(r.key, { scheduledOut: e.target.value })
                              }
                              className="w-[92px] px-2 py-1 text-[12px]"
                            />
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            {ATTENDANCE_STATUSES.map((s) => (
                              <button
                                key={s}
                                onClick={() => update(r.key, { status: s })}
                                title={STATUS_META[s].label}
                                className={cx(
                                  "rounded-lg px-1.5 py-1 text-[10.5px] font-bold ring-1 ring-inset transition-all",
                                  r.status === s
                                    ? STATUS_META[s].chip + " ring-2"
                                    : "bg-white text-slate-400 ring-slate-200 hover:text-slate-700",
                                )}
                              >
                                {STATUS_META[s].label}
                              </button>
                            ))}
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          <Select
                            value={r.driverId}
                            onChange={(e) =>
                              update(r.key, { driverId: e.target.value })
                            }
                            className="w-[130px] py-1 text-[12px]"
                          >
                            <option value="">— none —</option>
                            {drivers.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </Select>
                          {r.defaultDriverId && r.driverId && r.driverId !== r.defaultDriverId ? (
                            <div className="mt-1 text-[10.5px] text-amber-600">Regular: {driverName.get(r.defaultDriverId) ?? "—"}</div>
                          ) : r.driverId && r.driverId === r.defaultDriverId ? (
                            <div className="mt-1 text-[10.5px] font-semibold text-emerald-600">✓ regular driver</div>
                          ) : !r.driverId && !r.defaultDriverId ? (
                            <div className="mt-1 text-[10.5px] text-amber-600">regular driver not set</div>
                          ) : null}
                        </td>

                        <td className="px-3 py-3">
                          <TextInput
                            type="time"
                            value={r.actualIn}
                            onChange={(e) => update(r.key, { actualIn: e.target.value })}
                            disabled={r.status !== "present" && r.status !== "half_day"}
                            className="w-[100px] px-2 py-1 text-[12px] disabled:bg-slate-50 disabled:text-slate-300"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <TextInput
                            type="time"
                            value={r.actualOut}
                            onChange={(e) => update(r.key, { actualOut: e.target.value })}
                            disabled={r.status !== "present" && r.status !== "half_day"}
                            className="w-[100px] px-2 py-1 text-[12px] disabled:bg-slate-50 disabled:text-slate-300"
                          />
                        </td>

                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-1">
                            {late > 0 ? (
                              <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[10.5px] font-bold text-rose-700">
                                Late {minutesToLabel(late)}
                              </span>
                            ) : r.status === "present" ? (
                              <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-700">
                                On time
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-300">—</span>
                            )}
                            {ot > 0 ? (
                              <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-[10.5px] font-bold text-sky-700">
                                OT {minutesToLabel(ot)}
                              </span>
                            ) : null}
                            {early >= 5 ? (
                              <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[10.5px] font-bold text-rose-700">
                                Early OFF {minutesToLabel(early)}
                              </span>
                            ) : null}
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          <Select
                            value={r.reason}
                            onChange={(e) => update(r.key, { reason: e.target.value })}
                            className="w-[130px] py-1 text-[12px]"
                          >
                            <option value="">—</option>
                            {ABSENCE_REASONS.map((x) => (
                              <option key={x} value={x}>
                                {x}
                              </option>
                            ))}
                          </Select>
                        </td>

                        <td className="px-4 py-3">
                          <TextInput
                            value={r.notes}
                            onChange={(e) => update(r.key, { notes: e.target.value })}
                            placeholder="optional"
                            title={r.notes}
                            className="w-[160px] px-2 py-1 text-[12px]"
                          />
                          {r.source === "driver" ? (
                            <div className="mt-1 text-[10.5px] font-semibold text-indigo-600">📱 Filled by driver</div>
                          ) : null}
                        </td>

                        <td className="px-3 py-3">
                          {isDirty ? (
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => save([r])}
                              disabled={saving}
                            >
                              Save
                            </Button>
                          ) : saved[r.key] ? (
                            <span className="text-[11px] font-semibold text-emerald-600">
                              ✓ saved
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  }),
                )
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="mt-3 text-[12px] text-slate-500">
        💡 Late minutes are calculated automatically — <b>scheduled in</b> vs <b>actual in</b>. Night shifts that end the next day are also calculated correctly.
      </p>

      {toast ? <Toast message={toast} /> : null}
    </>
  );
}
