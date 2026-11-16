"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHeader, Field, TextInput } from "@/components/ui";
import { todayIso } from "@/lib/tracking";

export function AutomationPanel() {
  const router = useRouter();
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const push = (msg: string) =>
    setLog((prev) => [`${new Date().toLocaleTimeString("en-IN")} — ${msg}`, ...prev].slice(0, 6));

  const run = async (
    key: string,
    url: string,
    init: RequestInit,
    success: string,
  ) => {
    setBusy(key);
    try {
      const res = await fetch(url, init);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        push(`❌ ${data.error ?? "failed"}`);
        return;
      }
      push(`✅ ${success}`);
      router.refresh();
    } catch {
      push("❌ server error");
    } finally {
      setBusy(null);
    }
  };

  const backfill = () =>
    run(
      "backfill",
      "/api/attendance/generate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: todayIso(), days }),
      },
      `Sheets generated for ${days} days`,
    );

  const clear = () =>
    run(
      "clear",
      "/api/maintenance",
      { method: "DELETE" },
      "All attendance data was cleared",
    );


  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader
          icon="⚙️"
          title="Daily automation"
          subtitle="The sheet is generated automatically — you only need to enter the actual times"
        />
        <div className="space-y-4 px-5 py-4">
          <div className="rounded-xl bg-slate-50 p-4 text-[13px] leading-relaxed text-slate-600">
            <p className="font-semibold text-slate-800">How it works now</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>
                Whenever you open the <b>Daily Attendance</b> page, that date's sheet is created automatically (each cab × day + night = 2 rows).
              </li>
              <li>
                Each row's <b>scheduled in / out</b> time comes from that cab's page — nothing needs to be typed manually here.
              </li>
              <li>
                You only enter the <b>status</b>, the <b>driver</b> and the
                <b>actual in/out time</b>. Late minutes &amp; overtime are calculated automatically.
              </li>
              <li>
                The dashboard and reports update live from this data.
              </li>
            </ol>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <Field label="Backfill last N days" className="w-32">
              <TextInput
                type="number"
                min={1}
                max={90}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              />
            </Field>
            <Button variant="primary" onClick={backfill} disabled={busy !== null}>
              {busy === "backfill" ? "Generating…" : "⚡ Generate sheets"}
            </Button>
          </div>
          <p className="text-[12px] text-slate-500">
            Backfill only creates missing rows — rows that are already filled are left untouched.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader
          icon="🧪"
          title="Data tools"
          subtitle="Data maintenance"
        />
        <div className="space-y-3 px-5 py-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              className="text-rose-600 hover:bg-rose-50"
              onClick={() => {
                if (
                  window.confirm(
                    "All attendance records will be deleted. Cabs and drivers stay safe. Are you sure?",
                  )
                )
                  clear();
              }}
              disabled={busy !== null}
            >
              🗑️ Clear attendance only
            </Button>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-[12.5px] leading-relaxed text-amber-800">
            <b>Next step (full automation):</b> ek cron job ya server action
            can be added: a cron job or server action that runs every night at 12{" "}
            <code className="rounded bg-amber-100 px-1">/api/attendance/generate</code>{" "}
            call — the new day's sheet would be created without opening the page. For now, it is generated when the page opens.
          </div>

          {log.length ? (
            <ul className="space-y-1 rounded-xl bg-slate-900 p-3 font-mono text-[11.5px] text-slate-200">
              {log.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
