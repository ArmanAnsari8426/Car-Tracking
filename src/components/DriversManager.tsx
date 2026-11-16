"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Modal,
  Select,
  TextInput,
  Toast,
} from "@/components/ui";
import { cx, initials } from "@/lib/cx";
import type { Driver } from "@/db/schema";
import { isIsoDate, todayIso } from "@/lib/tracking";

type DriverRow = { driver: Driver; duties: number; late: number; absent: number; cabs: string[]; assigned: string[] };

const EMPTY = {
  name: "",
  phone: "",
  licenseNumber: "",
  licenseExpiry: "",
  status: "active",
  notes: "",
  assignCabId: "",
  assignShift: "day",
};

export function DriversManager({ rows, cabs }: { rows: DriverRow[]; cabs: { id: string; cabNumber: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [query, setQuery] = useState("");

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

  const openEdit = (row: DriverRow) => {
    setEditing(row.driver.id);
    setForm({
      name: row.driver.name,
      phone: row.driver.phone,
      licenseNumber: row.driver.licenseNumber,
      licenseExpiry: row.driver.licenseExpiry ?? "",
      status: row.driver.status,
      notes: row.driver.notes,
      assignCabId: "",
      assignShift: "day",
    });
    setError(null);
    setOpen(true);
  };

  const submit = async () => {
    setError(null);
    if (!form.name.trim()) return setError("Driver name is required");
    if (form.licenseExpiry && !isIsoDate(form.licenseExpiry))
      return setError("Licence expiry date is invalid");
    setBusy(true);
    try {
      const res = await fetch(
        editing ? `/api/drivers/${editing}` : "/api/drivers",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Save faileded");
        return;
      }
      setOpen(false);
      notify(editing ? "Driver updated ✅" : "New driver added ✅");
      router.refresh();
    } catch {
      setError("Server error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Delete ${name}?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/drivers/${id}`, { method: "DELETE" });
      notify("Driver deleted");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const filtered = rows.filter((r) =>
    [r.driver.name, r.driver.phone, ...r.assigned].join(" ").toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <>
      <Card>
        <CardHeader
          icon="🧑‍✈️"
          title={`${rows.length} drivers`}
          subtitle="These names appear in the attendance sheet driver dropdown"
          right={
            <>
              <TextInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search driver…"
                className="w-40"
              />
              <Button variant="primary" onClick={openAdd}>
                + Add driver
              </Button>
            </>
          }
        />
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-400">
              No drivers found.
            </div>
          ) : (
            filtered.map((row) => {
              const expiring =
                row.driver.licenseExpiry &&
                row.driver.licenseExpiry < todayIso();
              const soon =
                row.driver.licenseExpiry &&
                !expiring &&
                row.driver.licenseExpiry <=
                  new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
              return (
                <div
                  key={row.driver.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cx(
                        "grid size-11 shrink-0 place-items-center rounded-xl text-[15px] font-bold text-white",
                        row.driver.status === "active"
                          ? "bg-gradient-to-br from-slate-700 to-slate-900"
                          : "bg-slate-400",
                      )}
                    >
                      {initials(row.driver.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-[14px] font-bold text-slate-900">
                          {row.driver.name}
                        </h3>
                        {row.driver.status === "inactive" ? (
                          <Badge className="bg-slate-100 text-slate-500 ring-slate-200">
                            inactive
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-[11.5px] text-slate-500">
                        {row.driver.phone || "no phone"}
                      </p>
                    </div>
                  </div>

                  <dl className="mt-3 space-y-1.5 text-[12px]">
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Licence</dt>
                      <dd className="font-medium text-slate-700">
                        {row.driver.licenseNumber || "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Expiry</dt>
                      <dd
                        className={cx(
                          "font-medium",
                          expiring
                            ? "text-rose-600"
                            : soon
                              ? "text-amber-600"
                              : "text-slate-700",
                        )}
                      >
                        {row.driver.licenseExpiry ?? "—"}
                        {expiring ? " (expired)" : soon ? " (soon)" : ""}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Duties (30d)</dt>
                      <dd className="font-semibold tabular-nums text-slate-900">
                        {row.duties}
                        {row.late > 0 ? (
                          <span className="ml-1.5 text-[11px] font-bold text-rose-500">
                            {row.late} late
                          </span>
                        ) : null}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="shrink-0 text-slate-400">Regular cab</dt>
                      <dd className={cx("truncate text-right font-semibold", row.assigned.length ? "text-indigo-700" : "text-amber-600")}>
                        {row.assigned.length ? row.assigned.join(", ") : "no cab assigned"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Absent (30d)</dt>
                      <dd className={cx("font-semibold tabular-nums", row.absent ? "text-rose-600" : "text-slate-700")}>{row.absent}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="shrink-0 text-slate-400">Cabs driven</dt>
                      <dd className="truncate text-right text-slate-600">
                        {row.cabs.length ? row.cabs.join(", ") : "—"}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-3 flex justify-end gap-1.5 border-t border-slate-100 pt-3">
                    <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-600 hover:bg-rose-50"
                      onClick={() => remove(row.driver.id, row.driver.name)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      <Modal
        open={open}
        title={editing ? `Edit ${form.name}` : "Add new driver"}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={busy}>
              {busy ? "Saving…" : editing ? "Update driver" : "Add driver"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name *">
            <TextInput
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ramesh Kumar"
            />
          </Field>
          <Field label="Phone">
            <TextInput
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="98110 22345"
            />
          </Field>
          <Field label="Licence number">
            <TextInput
              value={form.licenseNumber}
              onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })}
              placeholder="DL-0420110012345"
            />
          </Field>
          <Field label="Licence expiry">
            <TextInput
              type="date"
              value={form.licenseExpiry}
              onChange={(e) =>
                setForm({ ...form, licenseExpiry: e.target.value })
              }
            />
          </Field>
          <Field label="Status">
            <Select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
          <Field label="Notes">
            <TextInput
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="optional"
            />
          </Field>
        </div>
        <div className="mt-4 rounded-xl bg-indigo-50 p-4">
          <p className="text-[12px] font-bold uppercase tracking-wide text-indigo-600">🚕 Set regular cab (optional)</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Field label="Cab">
              <Select value={form.assignCabId} onChange={(e) => setForm({ ...form, assignCabId: e.target.value })}>
                <option value="">— choose cab —</option>
                {cabs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.cabNumber}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Shift">
              <Select value={form.assignShift} onChange={(e) => setForm({ ...form, assignShift: e.target.value })}>
                <option value="day">☀️ Day</option>
                <option value="night">🌙 Night</option>
              </Select>
            </Field>
          </div>
          <p className="mt-1.5 text-[11.5px] text-indigo-800/70">This driver becomes the regular driver for that cab and shift — it appears automatically in the daily sheet and the driver form.</p>
        </div>

        {error ? (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-700">
            {error}
          </p>
        ) : null}
      </Modal>

      {toast ? <Toast message={toast} /> : null}
    </>
  );
}
