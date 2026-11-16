export const SHIFT_TYPES = ["day", "night"] as const;
export type ShiftType = (typeof SHIFT_TYPES)[number];

export const SHIFT_LABEL: Record<ShiftType, string> = {
  day: "Day",
  night: "Night",
};

export const SHIFT_ICON: Record<ShiftType, string> = {
  day: "☀️",
  night: "🌙",
};

export const ATTENDANCE_STATUSES = [
  "pending",
  "present",
  "absent",
  "leave",
  "half_day",
  "off",
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const STATUS_META: Record<
  AttendanceStatus,
  { label: string; tone: string; dot: string; chip: string }
> = {
  pending: {
    label: "Pending",
    tone: "text-amber-700",
    dot: "bg-amber-400",
    chip: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  present: {
    label: "Present",
    tone: "text-emerald-700",
    dot: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  absent: {
    label: "Absent",
    tone: "text-rose-700",
    dot: "bg-rose-500",
    chip: "bg-rose-50 text-rose-700 ring-rose-200",
  },
  leave: {
    label: "Leave",
    tone: "text-sky-700",
    dot: "bg-sky-500",
    chip: "bg-sky-50 text-sky-700 ring-sky-200",
  },
  half_day: {
    label: "Half Day",
    tone: "text-violet-700",
    dot: "bg-violet-500",
    chip: "bg-violet-50 text-violet-700 ring-violet-200",
  },
  off: {
    label: "Off",
    tone: "text-slate-600",
    dot: "bg-slate-400",
    chip: "bg-slate-100 text-slate-600 ring-slate-200",
  },
};

export const ABSENCE_STATUSES: AttendanceStatus[] = [
  "absent",
  "leave",
  "half_day",
  "off",
];

export const ABSENCE_REASONS = [
  "Driver sick",
  "Cab under repair",
  "Cab servicing",
  "Driver leave",
  "No duty assigned",
  "Traffic / route delay",
  "Personal work",
  "Other",
];

/** "08:00:00" -> "08:00" ; also accepts "08:00" */
export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parts = value.split(":");
  if (parts.length < 2) return value;
  return `${parts[0].padStart(2, "0")}:${parts[1]}`;
}

/** "HH:MM[:SS]" -> minutes since midnight */
export function timeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const parts = value.split(":").map(Number);
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1]))
    return null;
  return parts[0] * 60 + parts[1];
}

export function minutesToTime(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function minutesToLabel(total: number): string {
  const abs = Math.abs(Math.round(total));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const sign = total < 0 ? "-" : "";
  if (h === 0) return `${sign}${m}m`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}m`;
}

/**
 * Late minutes: how late the cab actually arrived vs scheduled in-time.
 * Night shifts cross midnight, so we wrap the difference.
 */
export function computeLateMinutes(
  scheduledIn: string | null | undefined,
  actualIn: string | null | undefined,
): number {
  const s = timeToMinutes(scheduledIn);
  const a = timeToMinutes(actualIn);
  if (s === null || a === null) return 0;
  let diff = a - s;
  if (diff < -(12 * 60)) diff += 1440; // arrived next day (overnight)
  if (diff > 12 * 60) diff -= 1440;
  return Math.max(0, Math.round(diff));
}

/** Overtime minutes: how long the cab stayed beyond scheduled out-time. */
export function computeOvertimeMinutes(
  scheduledOut: string | null | undefined,
  actualOut: string | null | undefined,
): number {
  const s = timeToMinutes(scheduledOut);
  const a = timeToMinutes(actualOut);
  if (s === null || a === null) return 0;
  let diff = a - s;
  if (diff < -(12 * 60)) diff += 1440;
  if (diff > 12 * 60) diff -= 1440;
  return Math.max(0, Math.round(diff));
}

/** Calendar date (YYYY-MM-DD) of a moment in India time. */
export function istDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** "07:00:00" -> "07:00" */
export function hhmm(t: string | null | undefined): string | null {
  if (!t) return null;
  const [h, m] = t.split(":");
  if (h === undefined || m === undefined) return null;
  return `${h.padStart(2, "0")}:${m.slice(0, 2)}`;
}

export function todayIso(now?: Date): string {
  if (!now) return istDate(new Date());
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function shiftDate(dateIso: string, offsetDays: number): string {
  const d = new Date(`${dateIso}T00:00:00`);
  d.setDate(d.getDate() + offsetDays);
  return todayIso(d);
}

export function formatDateLabel(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00`);
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateShort(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00`);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function shiftHours(
  scheduledIn: string | null | undefined,
  scheduledOut: string | null | undefined,
): string {
  const s = timeToMinutes(scheduledIn);
  const e = timeToMinutes(scheduledOut);
  if (s === null || e === null) return "—";
  let diff = e - s;
  if (diff < 0) diff += 1440;
  return minutesToLabel(diff);
}

export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/.test(value);
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00`);
  return !Number.isNaN(d.getTime()) && todayIso(d) === value;
}

/** Minutes the cab left BEFORE its scheduled out-time (0 if on time / late). */
export function computeEarlyMinutes(
  scheduledOut: string | null | undefined,
  actualOut: string | null | undefined,
): number {
  const s = timeToMinutes(scheduledOut);
  const a = timeToMinutes(actualOut);
  if (s === null || a === null) return 0;
  let diff = s - a;
  if (diff < -720) diff += 1440;
  if (diff > 720) diff -= 1440;
  return Math.max(0, Math.round(diff));
}

/** Duty length in minutes (handles night shifts crossing midnight). */
export function dutyMinutes(
  actualIn: string | null | undefined,
  actualOut: string | null | undefined,
): number | null {
  const a = timeToMinutes(actualIn);
  const b = timeToMinutes(actualOut);
  if (a === null || b === null) return null;
  return (b - a + 1440) % 1440;
}

/** Early-off of this many minutes or more raises a dashboard alert. */
export const EARLY_OFF_ALERT_MIN = 5;

/** Current date / time in India. */
export function nowIst(): { date: string; time: string; minutes: number } {
  const d = new Date();
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
  const [h, m] = time.split(":").map(Number);
  return { date: istDate(d), time, minutes: h * 60 + m };
}

export const cabKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
