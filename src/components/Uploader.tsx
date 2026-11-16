"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHeader, Select, TextInput } from "@/components/ui";
import { cx } from "@/lib/cx";
import { FIELD_LABEL, FIELD_OPTIONS, KIND_LABEL } from "@/lib/import-fields";
import type { DriverRow, MasterRow, ParsedRow, SheetColumn } from "@/lib/importer";

type SheetPreview = {
  name: string;
  kind: string;
  headerRow: number;
  columns: SheetColumn[];
  count: number;
  errors: string[];
};

type Preview = {
  fileName: string;
  sheets: SheetPreview[];
  counts: { attendance: number; master: number; drivers: number };
  attendancePreview: ParsedRow[];
  masterPreview: MasterRow[];
  driverPreview: DriverRow[];
  errors: string[];
};

type Result = {
  fileName: string;
  attendanceNew: number;
  attendanceUpdated: number;
  skipped: number;
  cabsCreated: number;
  cabsUpdated: number;
  driversCreated: number;
  driversUpdated: number;
  assigned: number;
  dates: string[];
  errors: string[];
};

export type UploadHistoryRow = {
  id: string;
  fileName: string;
  createdAt: string;
  totalRows: number;
  inserted: number;
  updated: number;
  cabsCreated: number;
  driversCreated: number;
  skipped: number;
  hasFile: boolean;
};

type Source = { type: "file"; file: File } | { type: "stored"; id: string; name: string };
type Overrides = Record<string, Record<string, string>>;

function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const TEMPLATES = {
  master:
    "Cab Number,Model,Owner,Day Driver,Night Driver,Day Timing,Night Timing,Driver Phone\nPB-01-F-6430,Swift Dzire,Gurpreet Travels,Parveer,Tabrez,8 AM - 8 PM,8 PM - 8 AM,9876543210\n",
  daily:
    "Date,Cab Number,Shift,In Time,Out Time,Driver,Status,Reason\n13/11/2026,PB-01-F-6430,Day,08:05,20:10,Parveer,P,\n13/11/2026,PB-01-F-6430,Night,20:15,08:00,Tabrez,P,\n13/11/2026,PB-01-D-6002,Day,,,,A,Driver sick\n",
  wide:
    "Date,Cab Number,Day In,Day Out,Night In,Night Out,Day Driver,Night Driver\n13/11/2026,PB-01-F-6430,8:00 AM,8:00 PM,8:10 PM,8:00 AM,Parveer,Tabrez\n",
};

export function Uploader({
  history,
  needsReupload,
}: {
  history: UploadHistoryRow[];
  needsReupload: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [forceDate, setForceDate] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "save" | null>(null);
  const [drag, setDrag] = useState(false);

  const send = async (
    mode: "preview" | "save",
    src: Source | null = source,
    ov: Overrides = overrides,
    fd: string = forceDate,
  ) => {
    if (!src) return;
    setBusy(mode);
    setError(null);
    try {
      const form = new FormData();
      if (src.type === "file") form.append("file", src.file);
      else form.append("uploadId", src.id);
      form.append("mode", mode);
      form.append("overrides", JSON.stringify(ov));
      if (fd) form.append("forceDate", fd);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload fail");
      if (mode === "preview") setPreview(data as Preview);
      else {
        setResult(data as Result);
        setPreview(null);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload fail");
    } finally {
      setBusy(null);
    }
  };

  const start = (src: Source) => {
    setSource(src);
    setOverrides({});
    setForceDate("");
    setResult(null);
    setPreview(null);
    void send("preview", src, {}, "");
  };

  const reset = () => {
    setSource(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setOverrides({});
    setForceDate("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const changeField = (sheet: string, index: number, field: string) => {
    const next: Overrides = { ...overrides, [sheet]: { ...(overrides[sheet] ?? {}), [String(index)]: field } };
    setOverrides(next);
    void send("preview", source, next, forceDate);
  };

  const total = preview ? preview.counts.attendance + preview.counts.master + preview.counts.drivers : 0;
  const hasMasterSheet = preview?.sheets.some((s) => s.kind === "master");

  return (
    <div className="space-y-4">
      {needsReupload ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-[13px] leading-relaxed text-amber-900">
          <b>⚠️ Please upload the same cab list file once more.</b> Your previous upload created cabs and drivers, but
          <b> which driver belongs to which cab</b> and their timings were not saved (a bug in the older version). Uploading again will
          attach the driver and timing to every cab — no duplicates will be created.
        </div>
      ) : null}

      <Card>
        <CardHeader
          icon="📤"
          title="Upload your sheet"
          subtitle="Excel (.xlsx / .xls) or CSV — all sheets are read and the data is merged into the database (nothing is deleted)"
          right={
            <a
              href="/api/export"
              className="rounded-xl bg-slate-900 px-3 py-2 text-[12px] font-semibold text-white hover:bg-slate-800"
            >
              ⬇️ Full backup (Excel)
            </a>
          }
        />
        <div className="space-y-4 p-5">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files[0];
              if (f) start({ type: "file", file: f });
            }}
            onClick={() => inputRef.current?.click()}
            className={cx(
              "cursor-pointer rounded-2xl border-2 border-dashed px-6 py-9 text-center transition-colors",
              drag ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-slate-50 hover:border-slate-400",
            )}
          >
            <div className="text-4xl">📊</div>
            <p className="mt-2 text-[14px] font-semibold text-slate-800">
              {source ? (source.type === "file" ? source.file.name : source.name) : "Drag a file here or click to choose one"}
            </p>
            <p className="mt-1 text-[12px] text-slate-500">
              Cab list (cab + driver + timing) or daily record (date + cab + in/out) — both work
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.ods"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) start({ type: "file", file: f });
              }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
            <span className="font-semibold">Template:</span>
            <button className="font-semibold text-indigo-600 hover:underline" onClick={() => download("cab-list-template.csv", TEMPLATES.master)}>
              Cab list
            </button>
            ·
            <button className="font-semibold text-indigo-600 hover:underline" onClick={() => download("daily-record-template.csv", TEMPLATES.daily)}>
              Daily record
            </button>
            ·
            <button className="font-semibold text-indigo-600 hover:underline" onClick={() => download("day-night-template.csv", TEMPLATES.wide)}>
              Day/Night in one row
            </button>
          </div>

          {busy === "preview" ? <p className="text-[13px] text-slate-500">⏳ Reading file…</p> : null}
          {error ? <p className="rounded-xl bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-700">❌ {error}</p> : null}

          {preview ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-indigo-50 px-4 py-3 text-[13px] text-indigo-900">
                <b>{preview.fileName}</b>
                {preview.counts.master ? <span>🚕 {preview.counts.master} cabs</span> : null}
                {preview.counts.attendance ? <span>📝 {preview.counts.attendance} daily rows</span> : null}
                {preview.counts.drivers ? <span>🧑‍✈️ {preview.counts.drivers} drivers</span> : null}
                {preview.errors.length ? <span className="text-rose-600">⚠️ {preview.errors.length} rows with problems</span> : null}
              </div>

              {preview.sheets.map((s) => (
                <div key={s.name} className="rounded-2xl border border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
                    <div className="text-[13px] font-semibold text-slate-800">
                      Sheet: {s.name} <span className="font-normal text-slate-400">· header row {s.headerRow}</span>
                    </div>
                    <span className={cx("rounded-full px-2.5 py-1 text-[11px] font-bold", s.kind === "empty" ? "bg-slate-200 text-slate-600" : "bg-emerald-100 text-emerald-800")}>
                      {KIND_LABEL[s.kind] ?? s.kind} {s.kind !== "empty" ? `· ${s.count}` : ""}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[12px]">
                      <thead className="text-[10.5px] uppercase text-slate-500">
                        <tr>
                          <th className="px-4 py-2">Your column</th>
                          <th className="px-3 py-2">Sample values</th>
                          <th className="px-4 py-2">What is it?</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.columns.map((c) => (
                          <tr key={c.index} className="border-t border-slate-100">
                            <td className="px-4 py-1.5 font-semibold text-slate-800">{c.header}</td>
                            <td className="max-w-[320px] truncate px-3 py-1.5 text-slate-500">{c.samples.join(" · ") || "—"}</td>
                            <td className="px-4 py-1.5">
                              {c.field === "dateColumn" ? (
                                <span className="text-[11.5px] font-semibold text-emerald-700">📅 Date column</span>
                              ) : (
                                <Select
                                  value={c.field}
                                  onChange={(e) => changeField(s.name, c.index, e.target.value)}
                                  className={cx("w-[210px] py-1 text-[12px]", c.field ? "border-emerald-300 bg-emerald-50/60" : "")}
                                  disabled={busy !== null}
                                >
                                  {FIELD_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </Select>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {s.errors.length ? (
                    <details className="border-t border-slate-100 px-4 py-2 text-[12px] text-amber-800">
                      <summary className="cursor-pointer font-semibold">{s.errors.length} rows skip honge (kyun?)</summary>
                      <ul className="mt-1 list-disc pl-5">
                        {s.errors.map((e) => (
                          <li key={e}>{e}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              ))}

              {hasMasterSheet ? (
                <div className="flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 px-4 py-3 text-[12.5px] text-slate-600">
                  <div className="max-w-md">
                    This sheet has no date column, so it is treated as a <b>cab list</b>. If it is one day's
                    <b> daily record</b>, choose the date:
                  </div>
                  <TextInput type="date" value={forceDate} onChange={(e) => setForceDate(e.target.value)} className="w-[160px]" />
                  <Button size="sm" variant="secondary" onClick={() => send("preview", source, overrides, forceDate)} disabled={busy !== null}>
                    Preview again
                  </Button>
                </div>
              ) : null}

              {preview.masterPreview.length ? (
                <PreviewTable
                  title={`🚕 Cab list — ${preview.counts.master} cabs (this applies everywhere)`}
                  head={["Cab", "Owner", "☀️ Day timing", "☀️ Day driver", "🌙 Night timing", "🌙 Night driver"]}
                  rows={preview.masterPreview.map((m) => [
                    m.cabNumber,
                    m.owner || "—",
                    m.dayIn || m.dayOut ? `${m.dayIn ?? "?"} → ${m.dayOut ?? "?"}` : "—",
                    m.dayDriver || "—",
                    m.nightIn || m.nightOut ? `${m.nightIn ?? "?"} → ${m.nightOut ?? "?"}` : "—",
                    m.nightDriver || "—",
                  ])}
                />
              ) : null}
              {preview.attendancePreview.length ? (
                <PreviewTable
                  title={`📝 Daily records — ${preview.counts.attendance} rows`}
                  head={["Date", "Cab", "Shift", "In", "Out", "Driver", "Status"]}
                  rows={preview.attendancePreview.map((r) => [
                    r.date,
                    r.cabNumber,
                    r.shiftType === "day" ? "☀️ Day" : "🌙 Night",
                    r.actualIn ?? "—",
                    r.actualOut ?? "—",
                    r.driverName || "(regular driver)",
                    r.status,
                  ])}
                />
              ) : null}
              {preview.driverPreview.length ? (
                <PreviewTable
                  title={`🧑‍✈️ Drivers — ${preview.counts.drivers}`}
                  head={["Name", "Phone", "Licence"]}
                  rows={preview.driverPreview.map((d) => [d.name, d.phone || "—", d.license || "—"])}
                />
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button variant="success" onClick={() => send("save")} disabled={busy !== null || total === 0}>
                  {busy === "save" ? "Saving…" : `💾 Save to database (${total})`}
                </Button>
                <Button variant="ghost" onClick={reset}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          {result ? (
            <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
              <p className="text-[14px] font-bold text-emerald-800">✅ Data saved — {result.fileName}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[12.5px] text-emerald-900 sm:grid-cols-4">
                <span>🚕 New cabs: <b>{result.cabsCreated}</b></span>
                <span>🔄 Cabs updated: <b>{result.cabsUpdated}</b></span>
                <span>🧑‍✈️ New drivers: <b>{result.driversCreated}</b></span>
                <span>🔗 Driver ↔ cab links: <b>{result.assigned}</b></span>
                <span>📝 New records: <b>{result.attendanceNew}</b></span>
                <span>✏️ Records updated: <b>{result.attendanceUpdated}</b></span>
                <span>⚠️ Skipped: <b>{result.skipped}</b></span>
              </div>
              {result.dates.length ? (
                <p className="mt-2 text-[12px] text-emerald-800">
                  Dates: {result.dates[0]} → {result.dates[result.dates.length - 1]} ({result.dates.length} din)
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="primary" onClick={() => router.push(result.dates.length ? `/?date=${result.dates[result.dates.length - 1]}` : "/")}>
                  📊 View dashboard
                </Button>
                <Button size="sm" variant="secondary" onClick={() => router.push("/cabs")}>
                  🚕 View cabs & drivers
                </Button>
                <Button size="sm" variant="ghost" onClick={reset}>
                  Upload another file
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader icon="🕘" title="Upload history" subtitle="Each upload's file is saved, so you can process it again if needed" />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] uppercase tracking-wide text-slate-500">
                {["When", "File", "Rows", "New", "Updated", "New cabs", "New drivers", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    No uploads yet
                  </td>
                </tr>
              ) : (
                history.map((u) => (
                  <tr key={u.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2.5 text-slate-500">{u.createdAt}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{u.fileName}</td>
                    <td className="px-4 py-2.5 tabular-nums">{u.totalRows}</td>
                    <td className="px-4 py-2.5 tabular-nums text-emerald-700">{u.inserted}</td>
                    <td className="px-4 py-2.5 tabular-nums text-sky-700">{u.updated}</td>
                    <td className="px-4 py-2.5 tabular-nums">{u.cabsCreated}</td>
                    <td className="px-4 py-2.5 tabular-nums">{u.driversCreated}</td>
                    <td className="px-4 py-2.5">
                      {u.hasFile ? (
                        <Button size="sm" variant="secondary" onClick={() => start({ type: "stored", id: u.id, name: u.fileName })} disabled={busy !== null}>
                          🔁 Process again
                        </Button>
                      ) : (
                        <span className="text-[11px] text-slate-400">file not saved</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function PreviewTable({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-bold text-slate-700">{title}</p>
      <div className="max-h-[340px] overflow-auto rounded-xl border border-slate-200">
        <table className="w-full text-left text-[12px]">
          <thead className="sticky top-0 bg-slate-50 text-[10.5px] uppercase text-slate-500">
            <tr>
              {head.map((h) => (
                <th key={h} className="px-3 py-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                {r.map((c, j) => (
                  <td key={j} className={cx("px-3 py-1.5", j === 0 && "font-semibold text-slate-900", c === "—" && "text-slate-300")}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { FIELD_LABEL };
