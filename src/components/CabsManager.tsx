"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHeader, Field, Modal, Select, TextInput, Toast } from "@/components/ui";
import { cx } from "@/lib/cx";
import type { Cab } from "@/db/schema";
import { isValidTime } from "@/lib/tracking";

type ShiftInfo = {
  in: string;
  out: string;
  enabled: boolean;
  driverId: string;
  driverName: string;
  isDefault: boolean;
};

export type CabRow = {
  cab: Cab;
  day: ShiftInfo;
  night: ShiftInfo;
  present: number;
  slots: number;
  late: number;
};

const EMPTY = {
  cabNumber: "",
  model: "",
  ownerName: "",
  color: "#6366f1",
  capacity: 4,
  fuelType: "CNG",
  status: "active",
  notes: "",
  dayIn: "08:00",
  dayOut: "20:00",
  nightIn: "20:00",
  nightOut: "08:00",
  dayEnabled: true,
  nightEnabled: true,
  dayDriverId: "",
  nightDriverId: "",
  dayDriverName: "",
  dayDriverPhone: "",
  nightDriverName: "",
  nightDriverPhone: "",
  applyPast: false,
};

export function CabsManager({
  rows,
  drivers,
}: {
  rows: CabRow[];
  drivers: { id: string; name: string; phone: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [quick, setQuick] = useState(false);
  const [quickMap, setQuickMap] = useState<Record<string, { day: string; night: string }>>({});

  const phoneOf = (id: string) => drivers.find((d) => d.id === id)?.phone ?? "";
  const drvId = (st: "day" | "night") => (st === "day" ? form.dayDriverId : form.nightDriverId);
  const drvName = (st: "day" | "night") => (st === "day" ? form.dayDriverName : form.nightDriverName);
  const drvPhone = (st: "day" | "night") => (st === "day" ? form.dayDriverPhone : form.nightDriverPhone);
  const setDrv = (st: "day" | "night", patch: { id?: string; name?: string; phone?: string }) =>
    setForm((f) =>
      st === "day"
        ? { ...f, dayDriverId: patch.id ?? f.dayDriverId, dayDriverName: patch.name ?? f.dayDriverName, dayDriverPhone: patch.phone ?? f.dayDriverPhone }
        : { ...f, nightDriverId: patch.id ?? f.nightDriverId, nightDriverName: patch.name ?? f.nightDriverName, nightDriverPhone: patch.phone ?? f.nightDriverPhone },
    );

  const startQuick = () => {
    setQuickMap(Object.fromEntries(rows.map((r) => [r.cab.id, { day: r.day.driverId, night: r.night.driverId }])));
    setQuick(true);
  };
  const quickChanges = rows.filter((r) => {
    const q = quickMap[r.cab.id];
    return q && (q.day !== r.day.driverId || q.night !== r.night.driverId);
  });
  const saveQuick = async () => {
    setBusy(true);
    try {
      for (const r of quickChanges) {
        const q = quickMap[r.cab.id];
        await fetch(`/api/cabs/${r.cab.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dayDriverId: q.day, nightDriverId: q.night }),
        });
      }
      notify(`${quickChanges.length} cabs' drivers saved ✅`);
      setQuick(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  };

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setOpen(true);
  };

  const openEdit = (row: CabRow) => {
    setEditing(row.cab.id);
    setForm({
      cabNumber: row.cab.cabNumber,
      model: row.cab.model,
      ownerName: row.cab.ownerName,
      color: row.cab.color,
      capacity: row.cab.capacity,
      fuelType: row.cab.fuelType,
      status: row.cab.status,
      notes: row.cab.notes,
      dayIn: row.day.in,
      dayOut: row.day.out,
      nightIn: row.night.in,
      nightOut: row.night.out,
      dayEnabled: row.day.enabled,
      nightEnabled: row.night.enabled,
      dayDriverId: row.day.driverId,
      nightDriverId: row.night.driverId,
      dayDriverName: "",
      dayDriverPhone: phoneOf(row.day.driverId),
      nightDriverName: "",
      nightDriverPhone: phoneOf(row.night.driverId),
      applyPast: row.day.isDefault && row.night.isDefault,
    });
    setError(null);
    setOpen(true);
  };

  const submit = async () => {
    setError(null);
    if (!form.cabNumber.trim()) return setError("Cab number is required");
    if ((form.dayEnabled && form.dayDriverId === "new" && !form.dayDriverName.trim()) || (form.nightEnabled && form.nightDriverId === "new" && !form.nightDriverName.trim())) return setError("New driver's name likho");
    for (const t of [form.dayIn, form.dayOut, form.nightIn, form.nightOut]) {
      if (!isValidTime(t)) return setError("Enter shift times in HH:MM format");
    }
    setBusy(true);
    try {
      const res = await fetch(editing ? `/api/cabs/${editing}` : "/api/cabs", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Save faileded");
        return;
      }
      setOpen(false);
      notify(editing ? "Cab updated ✅" : "New cab added ✅");
      router.refresh();
    } catch {
      setError("Server error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Delete ${name}? All of its attendance records will also be removed.`)) return;
    setBusy(true);
    try {
      await fetch(`/api/cabs/${id}`, { method: "DELETE" });
      notify("Cab deleted");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const bulkShift = async (shiftType: "day" | "night", enabled: boolean) => {
    const label = shiftType === "day" ? "Day" : "Night";
    if (!window.confirm(`Turn the ${label} shift ${enabled ? "ON" : "OFF"} for all cabs?`)) return;
    setBusy(true);
    try {
      await fetch("/api/cabs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shiftType, enabled }),
      });
      notify(`All cabs: ${label} shift ${enabled ? "ON" : "OFF"} ✅`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.cab.cabNumber, r.cab.ownerName, r.cab.model, r.day.driverName, r.night.driverName]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, query]);

  const missing = rows.filter(
    (r) => (r.day.enabled && !r.day.driverId) || (r.night.enabled && !r.night.driverId),
  ).length;

  const statusTone: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    inactive: "bg-slate-100 text-slate-600 ring-slate-200",
    maintenance: "bg-amber-50 text-amber-700 ring-amber-200",
  };

  return (
    <>
      <Card>
        <CardHeader
          icon="🚕"
          title={`${rows.length} cabs`}
          subtitle={
            missing
              ? `⚠️ ${missing} cabs have no regular driver — edit them or upload a cab list`
              : "All cabs have a regular driver ✅"
          }
          right={
            <>
              <TextInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search cab / driver / owner…"
                className="w-52"
              />
              <Button variant="secondary" onClick={startQuick}>
                ⚡ Quick driver set
              </Button>
              <Button variant="primary" onClick={openAdd}>
                + Add cab
              </Button>
            </>
          }
        />
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-2.5 text-[12px] text-slate-500">
          <span className="font-semibold">All cabs at once:</span>
          <Button size="sm" variant="ghost" onClick={() => bulkShift("night", false)} disabled={busy}>
            🌙 Night shift OFF
          </Button>
          <Button size="sm" variant="ghost" onClick={() => bulkShift("night", true)} disabled={busy}>
            🌙 Night shift ON
          </Button>
          <Button size="sm" variant="ghost" onClick={() => bulkShift("day", false)} disabled={busy}>
            ☀️ Day shift OFF
          </Button>
          <Button size="sm" variant="ghost" onClick={() => bulkShift("day", true)} disabled={busy}>
            ☀️ Day shift ON
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2.5 font-semibold">Cab</th>
                <th className="px-3 py-2.5 font-semibold">☀️ Day shift</th>
                <th className="px-3 py-2.5 font-semibold">🌙 Night shift</th>
                <th className="px-3 py-2.5 font-semibold">30-day record</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-5 py-2.5 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                    No cabs found.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.cab.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="grid size-9 shrink-0 place-items-center rounded-xl text-base text-white"
                          style={{ background: row.cab.color }}
                        >
                          🚕
                        </span>
                        <div>
                          <div className="font-bold text-slate-900">{row.cab.cabNumber}</div>
                          <div className="text-[11px] text-slate-500">
                            {[row.cab.model, row.cab.ownerName ? `👤 ${row.cab.ownerName}` : ""].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <ShiftCell info={row.day} />
                    </td>
                    <td className="px-3 py-3">
                      <ShiftCell info={row.night} />
                    </td>
                    <td className="px-3 py-3">
                      {row.slots ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-semibold tabular-nums text-slate-900">
                            {row.present}/{row.slots}
                          </span>
                          {row.late > 0 ? (
                            <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10.5px] font-bold text-rose-600">
                              {row.late} late
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">no records yet</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cx(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ring-1 ring-inset",
                          statusTone[row.cab.status] ?? statusTone.inactive,
                        )}
                      >
                        {row.cab.status}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-rose-600 hover:bg-rose-50"
                          onClick={() => remove(row.cab.id, row.cab.cabNumber)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {quick ? (
        <Card className="mt-4">
          <CardHeader
            icon="⚡"
            title="Quick driver set — all cabs at once"
            subtitle="Choose the Day / Night driver for each cab, then Save all"
            right={
              <>
                <Button variant="ghost" onClick={() => setQuick(false)}>
                  Cancel
                </Button>
                <Button variant="success" onClick={saveQuick} disabled={busy || quickChanges.length === 0}>
                  {busy ? "Saving…" : `💾 Save all (${quickChanges.length})`}
                </Button>
              </>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5">Cab</th>
                  <th className="px-3 py-2.5">☀️ Day driver</th>
                  <th className="px-3 py-2.5">🌙 Night driver</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const q = quickMap[r.cab.id] ?? { day: "", night: "" };
                  const changed = q.day !== r.day.driverId || q.night !== r.night.driverId;
                  return (
                    <tr key={r.cab.id} className={cx("border-b border-slate-50 last:border-0", changed && "bg-emerald-50/60")}>
                      <td className="px-5 py-2 font-bold text-slate-900">{r.cab.cabNumber}</td>
                      {(["day", "night"] as const).map((st) => (
                        <td key={st} className="px-3 py-2">
                          {(st === "day" ? r.day.enabled : r.night.enabled) ? (
                            <Select
                              value={q[st]}
                              onChange={(e) => setQuickMap((m) => ({ ...m, [r.cab.id]: { ...q, [st]: e.target.value } }))}
                              className="w-[200px] py-1 text-[12.5px]"
                            >
                              <option value="">— choose —</option>
                              {drivers.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                            </Select>
                          ) : (
                            <span className="text-[11px] font-semibold text-slate-400">shift OFF</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-[12px] text-slate-500">Need a new driver? Add one on the Drivers page or choose &quot;+ Add new driver&quot; in the cab's Edit form.</p>
        </Card>
      ) : null}

      <Modal
        open={open}
        title={editing ? `Edit ${form.cabNumber}` : "Add new cab"}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={busy}>
              {busy ? "Saving…" : editing ? "Update cab" : "Add cab"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cab number *">
            <TextInput
              value={form.cabNumber}
              onChange={(e) => setForm({ ...form, cabNumber: e.target.value })}
              placeholder="PB-01-F-6430"
            />
          </Field>
          <Field label="Owner / Vendor (whose cab)">
            <TextInput
              value={form.ownerName}
              onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
              placeholder="Owner's name"
            />
          </Field>
          <Field label="Model">
            <TextInput
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              placeholder="Swift Dzire"
            />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="maintenance">Maintenance</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
        </div>

        {(["day", "night"] as const).map((st) => {
          const on = st === "day" ? form.dayEnabled : form.nightEnabled;
          return (
            <div key={st} className={cx("mt-4 rounded-xl p-4", st === "day" ? "bg-amber-50" : "bg-indigo-50")}>
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-bold uppercase tracking-wide text-slate-600">
                  {st === "day" ? "☀️ Day shift" : "🌙 Night shift"}
                </p>
                <label className="flex items-center gap-2 text-[12px] font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) =>
                      setForm(st === "day" ? { ...form, dayEnabled: e.target.checked } : { ...form, nightEnabled: e.target.checked })
                    }
                  />
                  This shift runs
                </label>
              </div>
              {on ? (
                <>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label="Regular driver">
                    <Select value={drvId(st)} onChange={(e) => setDrv(st, { id: e.target.value, name: "", phone: phoneOf(e.target.value) })}>
                      <option value="">— choose —</option>
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                      <option value="new">+ Add new driver</option>
                    </Select>
                  </Field>
                  <Field label="In time">
                    <TextInput
                      type="time"
                      value={st === "day" ? form.dayIn : form.nightIn}
                      onChange={(e) => setForm(st === "day" ? { ...form, dayIn: e.target.value } : { ...form, nightIn: e.target.value })}
                    />
                  </Field>
                  <Field label="Out time">
                    <TextInput
                      type="time"
                      value={st === "day" ? form.dayOut : form.nightOut}
                      onChange={(e) => setForm(st === "day" ? { ...form, dayOut: e.target.value } : { ...form, nightOut: e.target.value })}
                    />
                  </Field>
                </div>
                {drvId(st) ? (
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    {drvId(st) === "new" ? (
                      <Field label="New driver's name">
                        <TextInput value={drvName(st)} onChange={(e) => setDrv(st, { name: e.target.value })} placeholder="Driver's name" />
                      </Field>
                    ) : null}
                    <Field label="Driver's phone">
                      <TextInput value={drvPhone(st)} onChange={(e) => setDrv(st, { phone: e.target.value })} placeholder="98xxxxxxxx" inputMode="tel" />
                    </Field>
                  </div>
                ) : null}
                </>
              ) : (
                <p className="mt-2 text-[12px] text-slate-500">Off — this shift will not appear in the daily sheet.</p>
              )}
            </div>
          );
        })}

        {editing ? (
          <label className="mt-4 flex items-start gap-2 text-[12.5px] text-slate-600">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.applyPast}
              onChange={(e) => setForm({ ...form, applyPast: e.target.checked })}
            />
            <span>
              Apply the new timing to <b>past records</b> too (late / overtime will be recalculated)
            </span>
          </label>
        ) : null}

        <div className="mt-4">
          <Field label="Notes">
            <TextInput
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="optional"
            />
          </Field>
        </div>

        {error ? (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-700">{error}</p>
        ) : null}
      </Modal>

      {toast ? <Toast message={toast} /> : null}
    </>
  );
}

function ShiftCell({ info }: { info: ShiftInfo }) {
  if (!info.enabled) {
    return <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-400">OFF</span>;
  }
  return (
    <div>
      <div className="text-[13px] font-semibold tabular-nums text-slate-800">
        {info.in} → {info.out}
      </div>
      <div className={cx("text-[11.5px]", info.driverName ? "font-medium text-indigo-700" : "text-amber-600")}>
        {info.driverName ? `🧑‍✈️ ${info.driverName}` : "⚠️ driver not set"}
      </div>
    </div>
  );
}
