// Client-safe constants for the uploader (no server imports here).

export const FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "— Ignore —" },
  { value: "cab", label: "🚕 Cab number" },
  { value: "driver", label: "🧑‍✈️ Driver (both shifts)" },
  { value: "dayDriver", label: "☀️ Day driver" },
  { value: "nightDriver", label: "🌙 Night driver" },
  { value: "owner", label: "👤 Owner / Vendor" },
  { value: "phone", label: "📞 Driver phone" },
  { value: "model", label: "Car model" },
  { value: "date", label: "📅 Date" },
  { value: "shift", label: "Shift (Day / Night)" },
  { value: "time", label: "⏰ Timing (7am - 7pm)" },
  { value: "dayTime", label: "☀️ Day timing (7am - 7pm)" },
  { value: "nightTime", label: "🌙 Night timing (7pm - 7am)" },
  { value: "in", label: "In time (arrived)" },
  { value: "out", label: "Out time (left)" },
  { value: "dayIn", label: "☀️ Day in" },
  { value: "dayOut", label: "☀️ Day out" },
  { value: "nightIn", label: "🌙 Night in" },
  { value: "nightOut", label: "🌙 Night out" },
  { value: "schedIn", label: "Fixed / scheduled in" },
  { value: "schedOut", label: "Fixed / scheduled out" },
  { value: "status", label: "Status (P / A / L)" },
  { value: "dayStatus", label: "☀️ Day status" },
  { value: "nightStatus", label: "🌙 Night status" },
  { value: "reason", label: "Reason / remark" },
  { value: "notes", label: "Notes" },
  { value: "license", label: "Licence number" },
  { value: "expiry", label: "Licence expiry" },
  { value: "runsDay", label: "Runs day shift? (Yes/No)" },
  { value: "runsNight", label: "Runs night shift? (Yes/No)" },
];

export const FIELD_LABEL: Record<string, string> = Object.fromEntries(
  FIELD_OPTIONS.map((o) => [o.value, o.label]),
);

export const KIND_LABEL: Record<string, string> = {
  attendance: "📝 Daily record (date wise)",
  register: "🗓️ Register (dates across columns)",
  master: "🚕 Cab list (cab + driver + timing)",
  drivers: "🧑‍✈️ Driver list",
  empty: "⏭️ Skipped — no cab or driver column found",
};
