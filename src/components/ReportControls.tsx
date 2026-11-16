"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, Select, TextInput } from "@/components/ui";
import { isIsoDate, shiftDate, todayIso } from "@/lib/tracking";

const PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 14 days", days: 14 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

export function ReportControls() {
  const router = useRouter();
  const params = useSearchParams();
  const today = todayIso();
  const from = params.get("from") ?? shiftDate(today, -29);
  const to = params.get("to") ?? today;
  const [draft, setDraft] = useState({ from, to });

  const apply = (f: string, t: string) => {
    const q = new URLSearchParams();
    if (isIsoDate(f)) q.set("from", f);
    if (isIsoDate(t)) q.set("to", t);
    router.push(`/reports?${q.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          From
        </span>
        <TextInput
          type="date"
          value={draft.from}
          max={today}
          onChange={(e) => setDraft({ ...draft, from: e.target.value })}
          className="w-[150px]"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          To
        </span>
        <TextInput
          type="date"
          value={draft.to}
          max={today}
          onChange={(e) => setDraft({ ...draft, to: e.target.value })}
          className="w-[150px]"
        />
      </label>
      <Button variant="primary" onClick={() => apply(draft.from, draft.to)}>
        Apply
      </Button>
      <Select
        value=""
        onChange={(e) => {
          const days = Number(e.target.value);
          if (!days) return;
          const f = shiftDate(today, -(days - 1));
          setDraft({ from: f, to: today });
          apply(f, today);
        }}
        className="w-[150px]"
      >
        <option value="">Quick range…</option>
        {PRESETS.map((p) => (
          <option key={p.days} value={p.days}>
            {p.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
