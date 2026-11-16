import * as XLSX from "xlsx";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  attendance,
  cabShifts,
  cabs,
  drivers,
  uploads,
  type Attendance,
  type Cab,
  type CabShift,
  type Driver,
  type NewAttendance,
} from "@/db/schema";
import {
  computeEarlyMinutes,
  computeLateMinutes,
  computeOvertimeMinutes,
  hhmm,
  minutesToTime,
  shiftDate,
  timeToMinutes,
  todayIso,
  type AttendanceStatus,
  type ShiftType,
} from "./tracking";
import {
  DEFAULT_SHIFTS,
  SHIFTS,
  learnAssignments,
  reapplySchedule,
  syncPendingRows,
} from "./data";

/* ================================================================== */
/* Header aliases (English + Hinglish)                                */
/* ================================================================== */

const ALIASES: Record<string, string[]> = {
  date: ["date", "tarikh", "tareekh", "dated", "dt", "dutydate", "tripdate", "attendancedate", "dateofduty"],
  owner: ["owner", "ownername", "vendor", "vendorname", "malik", "maalik", "cabowner", "vehicleowner", "vehicleownername", "agency", "agencyname", "attachedwith", "ownedby"],
  skip: ["ownerphone", "ownermobile", "ownercontact", "ownermobileno", "ownerphoneno", "ownerno", "sno", "srno", "serialno", "sr", "s/no", "sl", "slno"],
  phone: ["phone", "mobile", "contact", "phoneno", "mobileno", "phonenumber", "mobilenumber", "contactno", "contactnumber", "driverphone", "drivermobile", "drivercontact", "drivermobileno", "driverphoneno", "drivermob", "drivermobno", "driverno", "mob", "mobno", "cell"],
  cab: ["cab", "cabs", "cabno", "cabsno", "cabnumber", "cabnum", "vehicle", "vehicleno", "vehiclenumber", "vehicleregno", "vehicleregistrationno", "gadi", "gaadi", "gadino", "gaadino", "gadinumber", "gaadinumber", "gaddi", "gaddino", "taxi", "taxino", "car", "carno", "carnumber", "regno", "registrationno", "registrationnumber", "registration", "rcno", "cabregno", "cabdetails", "cabdetail", "cabdetils", "cabsdetails", "cabsdetils", "vehicledetails", "vno"],
  model: ["model", "carmodel", "vehiclemodel", "make", "cabmodel", "cartype", "vehicletype", "cabtype", "makemodel", "vehiclename", "carname", "gaadimodel"],
  dayDriver: ["daydriver", "daydrivername", "dayshiftdriver", "dindriver", "morningdriver", "driverday", "driver1", "driverdayshift", "daydrivers"],
  nightDriver: ["nightdriver", "nightdrivername", "nightshiftdriver", "raatdriver", "eveningdriver", "drivernight", "driver2", "drivernightshift", "nightdrivers"],
  dayIn: ["dayin", "dayintime", "dayshiftin", "dinin", "morningin", "dayarrival", "daystart", "daystarttime", "daylogin", "dayreporting", "dayreportingtime", "inday", "dayshiftstart"],
  dayOut: ["dayout", "dayouttime", "dayshiftout", "dinout", "morningout", "dayend", "dayendtime", "daylogout", "dayrelease", "outday", "dayshiftend"],
  nightIn: ["nightin", "nightintime", "nightshiftin", "raatin", "eveningin", "nightarrival", "nightstart", "nightstarttime", "nightlogin", "nightreporting", "nightreportingtime", "innight", "nightshiftstart"],
  nightOut: ["nightout", "nightouttime", "nightshiftout", "raatout", "eveningout", "nightend", "nightendtime", "nightlogout", "nightrelease", "outnight", "nightshiftend"],
  dayTime: ["day", "daytime", "daytiming", "daytimings", "dayshift", "dayshifttime", "dayshifttiming", "dayshifttimings", "dinkatime", "morningshift", "dayduty", "daydutytime", "dayhours"],
  nightTime: ["night", "nighttime", "nighttiming", "nighttimings", "nightshift", "nightshifttime", "nightshifttiming", "nightshifttimings", "raatkatime", "eveningshift", "nightduty", "nightdutytime", "nighthours"],
  dayStatus: ["daystatus", "dayattendance", "dayp/a", "daypresent", "dayhazri"],
  nightStatus: ["nightstatus", "nightattendance", "nightp/a", "nightpresent", "nighthazri"],
  runsDay: ["runsday", "dayactive", "dayshiftactive", "dayon"],
  runsNight: ["runsnight", "nightactive", "nightshiftactive", "nighton"],
  schedIn: ["scheduledin", "schedin", "plannedin", "fixedin", "dutyin", "shiftin", "shiftstart", "shiftstarttime", "scheduledintime", "usualin"],
  schedOut: ["scheduledout", "schedout", "plannedout", "fixedout", "dutyout", "shiftout", "shiftend", "shiftendtime", "scheduledouttime", "usualout"],
  shift: ["shift", "shifttype", "daynight", "day/night", "d/n", "dn", "shiftname", "shiftd/n"],
  time: ["timing", "timings", "time", "shifttiming", "shifttimings", "shifttime", "dutytime", "dutytiming", "dutytimings", "workingtime", "workinghours", "workingtiming", "hours", "kabsekabtak", "dutyhours"],
  in: ["in", "intime", "actualin", "actualintime", "arrival", "arrivaltime", "aanekatime", "anekatime", "aaya", "aayakab", "start", "starttime", "reporting", "reportingtime", "login", "logintime", "timein", "entry", "entrytime", "checkin", "checkintime"],
  out: ["out", "outtime", "actualout", "actualouttime", "departure", "departuretime", "jaanekatime", "janekatime", "gaya", "end", "endtime", "logout", "logouttime", "timeout", "exit", "exittime", "checkout", "checkouttime", "release", "releasetime"],
  driver: ["driver", "drivername", "drivers", "chalak", "name", "drivernaam", "naam", "drivernames", "chauffeur", "driverdetails"],
  license: ["license", "licence", "licenseno", "licenceno", "licensenumber", "licencenumber", "dl", "dlno", "dlnumber", "drivinglicense", "drivinglicence", "drivinglicenseno", "drivinglicenceno"],
  expiry: ["expiry", "licenseexpiry", "licenceexpiry", "validtill", "validity", "dlexpiry", "expirydate", "licensevalidity", "licencevalidity", "dlvalidity"],
  status: ["status", "attendance", "present", "hazri", "haziri", "p/a", "pa", "present/absent", "presentabsent"],
  reason: ["reason", "karan", "remark", "remarks", "absentreason", "reasonforabsence"],
  notes: ["notes", "note", "comment", "comments"],
};

/** Too generic to be used for "contains" matching. */
const GENERIC = new Set(["time", "start", "end", "present", "name", "make", "entry", "exit", "release", "hours", "drivers", "vehicle", "registration", "contact", "mobile", "night"]);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9/]/g, "");
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());
const pad = (n: number) => String(n).padStart(2, "0");

type FieldMap = Record<string, number>;

function autoMap(headers: string[]): FieldMap {
  const map: FieldMap = {};
  const used = new Set<number>();
  const normed = headers.map(norm);
  for (const [field, aliases] of Object.entries(ALIASES)) {
    const idx = normed.findIndex((n, i) => n !== "" && !used.has(i) && aliases.includes(n));
    if (idx >= 0) {
      map[field] = idx;
      used.add(idx);
    }
  }
  normed.forEach((n, i) => {
    if (!n || used.has(i)) return;
    let best: { field: string; len: number } | null = null;
    for (const [field, aliases] of Object.entries(ALIASES)) {
      if (map[field] !== undefined) continue;
      for (const a of aliases) {
        if (a.length < 4 || GENERIC.has(a) || !n.includes(a)) continue;
        if (!best || a.length > best.len) best = { field, len: a.length };
      }
    }
    if (best) {
      map[best.field] = i;
      used.add(i);
    }
  });
  return map;
}

/* ================================================================== */
/* Value parsers                                                      */
/* ================================================================== */

type TX = { m: number; amb: boolean }; // minutes since midnight, am/pm ambiguous?

function timeX(v: unknown): TX | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v <= 0) return null;
    if (v < 1) return { m: Math.round(v * 1440) % 1440, amb: false }; // Excel time
    if (v < 24) {
      const h = Math.floor(v);
      const min = Math.round((v - h) * 100); // 7.30 -> 07:30
      if (min > 59) return null;
      return { m: h * 60 + min, amb: h >= 1 && h <= 12 };
    }
    if (Number.isInteger(v)) return null;
    return { m: Math.round((v % 1) * 1440) % 1440, amb: false }; // Excel date-time
  }
  const s = String(v)
    .trim()
    .toLowerCase()
    .replace(/\s*(hrs?|hours?|baje|bje)\.?$/, "")
    .trim();
  if (!s || ["-", "--", "na", "n/a", "nil"].includes(s)) return null;
  let h: number;
  let min: number;
  let ap: string | undefined;
  const m = s.match(/^(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?\s*(am|pm|a\.m\.?|p\.m\.?)?$/);
  if (m) {
    h = Number(m[1]);
    min = Number(m[2] ?? 0);
    ap = m[3]?.replace(/\./g, "");
  } else {
    const mm = s.match(/^(\d{2})(\d{2})$/);
    if (!mm) return null;
    h = Number(mm[1]);
    min = Number(mm[2]);
  }
  if (h > 23 || min > 59) return null;
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return { m: h * 60 + min, amb: !ap && h >= 1 && h <= 12 };
}

const TIME_TOKEN = String.raw`(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm|a\.m\.?|p\.m\.?)?)`;
const RANGE_RE = new RegExp(`${TIME_TOKEN}\\s*(?:-|–|—|to|se|till|tak|upto|/)\\s*${TIME_TOKEN}`, "i");

function rangeX(v: unknown): { a: TX; b: TX } | null {
  if (typeof v !== "string") return null;
  const m = v.toLowerCase().match(RANGE_RE);
  if (!m) return null;
  const a = timeX(m[1].trim());
  const b = timeX(m[2].trim());
  if (!a || !b) return null;
  return { a, b };
}

function shiftFromText(text: string): ShiftType | "both" | null {
  const s = text.toLowerCase();
  if (!s.trim()) return null;
  if (/both|24\s*h|d\s*\/\s*n|day\s*(&|and|\+|\/|,)\s*night|din\s*(aur|\/|&)\s*raat/.test(s)) return "both";
  if (/night|raat|\brat\b|evening|^n$|^ns$/.test(s)) return "night";
  if (/day|\bdin\b|morning|general|^d$|^ds$|^g$/.test(s)) return "day";
  return null;
}

function guessShift(a: TX | null): ShiftType {
  if (!a) return "day";
  return a.m >= 4 * 60 && a.m < 16 * 60 ? "day" : "night";
}

/** Resolve "7 - 7" style ambiguity using the shift. */
function fixPair(st: ShiftType, a: TX | null, b: TX | null): { in: string | null; out: string | null } {
  let ai = a ? a.m : null;
  let bo = b ? b.m : null;
  if (st === "night") {
    if (a && a.amb && ai !== null && ai >= 60 && ai < 720) ai += 720; // night "8" = 20:00
  } else if (b && b.amb && bo !== null && bo < 720 && ai !== null && bo <= ai) {
    bo += 720; // day "8 - 8" = 08:00 - 20:00
  }
  return {
    in: ai === null ? null : minutesToTime(ai),
    out: bo === null ? null : minutesToTime(bo),
  };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function validDate(y: number, mo: number, d: number): string | null {
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

function inferYear(mo: number, d: number): number {
  const t = todayIso();
  const y = Number(t.slice(0, 4));
  return `${y}-${pad(mo)}-${pad(d)}` > shiftDate(t, 31) ? y - 1 : y;
}

export function parseDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    if (v > 20000 && v < 80000) {
      const d = XLSX.SSF.parse_date_code(v);
      if (d) return validDate(d.y, d.m, d.d);
    }
    return null;
  }
  const s = String(v).trim().replace(/^[a-z]{3,9},?\s+(?=\d)/i, "");
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?!\d)/);
  if (m) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return +m[2] > 12 ? validDate(y, +m[1], +m[2]) : validDate(y, +m[2], +m[1]); // Indian dd/mm
  }
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-/.]*([a-z]{3,9})\.?(?:[\s\-/.,]+(\d{2,4}))?$/i);
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) {
      const y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : inferYear(mi + 1, +m[1]);
      return validDate(y, mi + 1, +m[1]);
    }
  }
  m = s.match(/^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{2,4}))?$/i);
  if (m) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mi >= 0) {
      const y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : inferYear(mi + 1, +m[2]);
      return validDate(y, mi + 1, +m[2]);
    }
  }
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})$/);
  if (m && +m[2] <= 12) return validDate(inferYear(+m[2], +m[1]), +m[2], +m[1]);
  return null;
}

function statusStrict(v: unknown): AttendanceStatus | null {
  const s = norm(str(v));
  if (!s) return null;
  if (["p", "present", "yes", "y", "aaya", "haan", "ha", "1", "ok", "came", "ontime", "late", "duty", "on"].includes(s)) return "present";
  if (["a", "absent", "no", "n", "nahi", "nahiaaya", "0", "notcame", "ab"].includes(s)) return "absent";
  if (["l", "leave", "chutti", "chhutti", "cl", "sl"].includes(s)) return "leave";
  if (["h", "hd", "half", "halfday", "1/2"].includes(s)) return "half_day";
  if (["off", "o", "weekoff", "wo", "holiday", "band", "repair", "workshop"].includes(s)) return "off";
  if (s === "pending") return "pending";
  return null;
}

function yesNo(v: unknown): boolean | null {
  const s = norm(str(v));
  if (!s) return null;
  if (["yes", "y", "haan", "ha", "1", "true", "on", "chalti", "active"].includes(s)) return true;
  if (["no", "n", "nahi", "0", "false", "off", "band", "inactive"].includes(s)) return false;
  return null;
}

function cabStatus(v: unknown): string {
  const s = norm(str(v));
  if (["active", "chalu", "running"].includes(s)) return "active";
  if (["inactive", "band", "closed", "sold"].includes(s)) return "inactive";
  if (["maintenance", "repair", "workshop", "service"].includes(s)) return "maintenance";
  return "";
}

const JUNK_NAME = /^(pending|na|n\/a|nil|null|none|no|-+|—|0|vacant|khali|not assigned|unassigned|no driver|tbd|tba|\?+|x+|new|driver|left|resigned)$/i;

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s.'-])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
}

/** "Parveer 98765 43210" -> name + phone, junk -> "" */
function splitPerson(raw: string): { name: string; phone: string } {
  let s = raw.replace(/\s+/g, " ").trim();
  let phone = "";
  const pm = s.match(/(\+?91[\s-]?)?([6-9]\d{4}[\s-]?\d{5})/);
  if (pm) {
    phone = pm[2].replace(/[\s-]/g, "");
    s = s.replace(pm[0], " ");
  }
  s = s.replace(/[()]/g, " ").replace(/\s+/g, " ").replace(/^[\s.,;:\-–]+|[\s.,;:\-–]+$/g, "").trim();
  if (!s || JUNK_NAME.test(s) || !/[a-z]/i.test(s)) return { name: "", phone };
  if (s === s.toUpperCase() || s === s.toLowerCase()) s = titleCase(s);
  return { name: s, phone };
}

/** "Raja / Sahil" -> ["Raja", "Sahil"] */
function splitTwo(raw: string): string[] {
  return raw
    .split(/\s*(?:\/|,|&|\+|\band\b|\baur\b)\s*/i)
    .map((x) => x.trim())
    .filter(Boolean);
}

export const cabKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const cleanCab = (raw: string) => raw.toUpperCase().replace(/\s+/g, " ").trim();
const JUNK_CAB = /^(TOTAL|GRAND TOTAL|SUM|CAB NO\.?|CAB NUMBER|VEHICLE NO\.?|S\.? ?NO\.?)$/;
const isJunkCab = (s: string) => !cabKey(s) || JUNK_CAB.test(s);
const REG_RE = /^[A-Z]{2}[\s.-]*\d{1,2}[\s.-]*[A-Z]{0,3}[\s.-]*\d{3,4}$/i;

function colLetter(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function displayCell(v: unknown): string {
  if (typeof v === "number") {
    if (v > 0 && v < 1) return minutesToTime(Math.round(v * 1440));
    if (v > 20000 && v < 80000) return parseDate(v) ?? String(v);
    return String(v);
  }
  return str(v).slice(0, 40);
}

/* ================================================================== */
/* Sheet parsing                                                      */
/* ================================================================== */

export type ParsedRow = {
  sheet: string;
  line: number;
  date: string;
  cabNumber: string;
  model: string;
  owner: string;
  shiftType: ShiftType;
  status: AttendanceStatus;
  driverName: string;
  phone: string;
  actualIn: string | null;
  actualOut: string | null;
  schedIn: string | null;
  schedOut: string | null;
  reason: string;
  notes: string;
};

export type MasterRow = {
  cabNumber: string;
  model: string;
  owner: string;
  phone: string;
  status: string;
  dayIn: string | null;
  dayOut: string | null;
  nightIn: string | null;
  nightOut: string | null;
  dayDriver: string;
  nightDriver: string;
  runsDay: boolean | null;
  runsNight: boolean | null;
  hasShiftInfo: boolean;
};

export type DriverRow = { name: string; phone: string; license: string; expiry: string | null; status: string };

export type SheetColumn = { index: number; header: string; samples: string[]; field: string };

export type SheetKind = "attendance" | "register" | "master" | "drivers" | "empty";

export type SheetResult = {
  name: string;
  kind: SheetKind;
  headerRow: number;
  columns: SheetColumn[];
  rows: ParsedRow[];
  master: MasterRow[];
  driverRows: DriverRow[];
  errors: string[];
  totalRows: number;
};

export type ParseResult = {
  sheets: SheetResult[];
  rows: ParsedRow[];
  master: MasterRow[];
  driverRows: DriverRow[];
  errors: string[];
  totalRows: number;
};

export type Overrides = Record<string, Record<string, string>>;
export type ParseOptions = { forceDate?: string; overrides?: Overrides };

type Body = { r: unknown[]; line: number }[];

function combineHeaders(top: unknown[], bottom: unknown[]): string[] {
  const len = Math.max(top.length, bottom.length);
  const out: string[] = [];
  let carry = "";
  for (let i = 0; i < len; i += 1) {
    const t = str(top[i]);
    const b = str(bottom[i]);
    if (t) carry = t;
    else if (!b) carry = "";
    const label = t || (b ? carry : "");
    out.push(b ? (label && label !== b ? `${label} ${b}` : b) : label);
  }
  return out;
}

function pickHeader(matrix: unknown[][]): { hIdx: number; headers: string[] } {
  let best = { score: -1, hIdx: 0, headers: (matrix[0] ?? []).map(str) };
  const limit = Math.min(matrix.length, 15);
  for (let i = 0; i < limit; i += 1) {
    const cands: string[][] = [(matrix[i] ?? []).map(str)];
    if (i > 0) cands.push(combineHeaders(matrix[i - 1] ?? [], matrix[i] ?? []));
    for (const h of cands) {
      const m = autoMap(h);
      const keys = Object.keys(m).filter((k) => k !== "skip");
      if (!keys.some((k) => k === "cab" || k === "driver" || k === "dayDriver")) continue;
      const score = keys.length + (keys.includes("cab") ? 2 : 0);
      if (score > best.score) best = { score, hIdx: i, headers: h };
    }
  }
  return best;
}

function contentDetect(rows: unknown[][], headers: string[], map: FieldMap, dateCols: Set<number>) {
  const ncol = Math.max(headers.length, ...rows.slice(0, 60).map((r) => r.length), 0);
  const used = new Set(Object.values(map));
  const sample = rows.slice(0, 60);
  const ratio = (i: number, test: (v: unknown) => boolean) => {
    let n = 0;
    let ok = 0;
    for (const r of sample) {
      const v = r[i];
      if (str(v) === "") continue;
      n += 1;
      if (test(v)) ok += 1;
    }
    return n >= 2 ? ok / n : 0;
  };
  if (map.cab === undefined) {
    for (let i = 0; i < ncol; i += 1) {
      if (!used.has(i) && ratio(i, (v) => REG_RE.test(str(v))) >= 0.6) {
        map.cab = i;
        used.add(i);
        break;
      }
    }
  }
  const looksTime = (v: unknown) =>
    typeof v === "number" ? v > 0 && v < 1 : /\d[:.]\d{2}|\d\s*(am|pm)/i.test(str(v)) && timeX(v) !== null;
  const rangeCols: number[] = [];
  const timeCols: number[] = [];
  for (let i = 0; i < ncol; i += 1) {
    if (used.has(i) || dateCols.has(i)) continue;
    if (ratio(i, (v) => rangeX(v) !== null) >= 0.6) rangeCols.push(i);
    else if (ratio(i, looksTime) >= 0.6) timeCols.push(i);
  }
  const hasTimeField = ["time", "dayTime", "nightTime", "in", "dayIn", "nightIn", "schedIn"].some((f) => map[f] !== undefined);
  if (!hasTimeField && rangeCols.length) {
    if (rangeCols.length === 1) {
      const s = shiftFromText(headers[rangeCols[0]] ?? "");
      map[s === "night" ? "nightTime" : s === "day" ? "dayTime" : "time"] = rangeCols[0];
    } else {
      const n = rangeCols.find((i) => shiftFromText(headers[i] ?? "") === "night");
      const nightCol = n ?? rangeCols[1];
      map.nightTime = nightCol;
      map.dayTime = rangeCols.find((i) => i !== nightCol) as number;
    }
  } else if (!hasTimeField && timeCols.length) {
    if (timeCols.length >= 4) {
      [map.dayIn, map.dayOut, map.nightIn, map.nightOut] = timeCols;
    } else if (timeCols.length >= 2) {
      [map.in, map.out] = timeCols;
    } else map.in = timeCols[0];
  }
}

const get = (r: unknown[], m: FieldMap, f: string): unknown => (m[f] === undefined ? "" : r[m[f]]);

function pairRaw(r: unknown[], m: FieldMap, inF: string, outF: string, rangeF?: string): { a: TX | null; b: TX | null } {
  let a = m[inF] !== undefined ? timeX(r[m[inF]]) : null;
  let b = m[outF] !== undefined ? timeX(r[m[outF]]) : null;
  if (!a && m[inF] !== undefined) {
    const rg = rangeX(r[m[inF]]);
    if (rg) {
      a = rg.a;
      b = b ?? rg.b;
    }
  }
  if ((!a || !b) && rangeF && m[rangeF] !== undefined) {
    const v = r[m[rangeF]];
    const rg = rangeX(v);
    if (rg) {
      a = a ?? rg.a;
      b = b ?? rg.b;
    } else if (!a) a = timeX(v);
  }
  return { a, b };
}

function rowHasData(r: unknown[], m: FieldMap, fields: string[]): boolean {
  return fields.some((f) => m[f] !== undefined && str(r[m[f]]) !== "");
}

const SHIFT_DATA_FIELDS = ["shift", "time", "dayTime", "nightTime", "in", "out", "dayIn", "dayOut", "nightIn", "nightOut", "driver", "dayDriver", "nightDriver", "status"];

function parseAttendance(sheet: string, body: Body, m: FieldMap, sheetDate: string | null, errors: string[]): ParsedRow[] {
  const out: ParsedRow[] = [];
  const wide = ["dayIn", "dayOut", "nightIn", "nightOut", "dayTime", "nightTime", "dayDriver", "nightDriver", "dayStatus", "nightStatus"].some((f) => m[f] !== undefined);
  const nightCabs = new Set<string>();
  if (wide) {
    for (const { r } of body) {
      if (rowHasData(r, m, ["nightIn", "nightOut", "nightTime", "nightDriver", "nightStatus"])) nightCabs.add(cabKey(str(get(r, m, "cab"))));
    }
  }
  let lastDate: string | null = null;
  let lastCab = "";
  for (const { r, line } of body) {
    let cab = cleanCab(str(get(r, m, "cab")));
    if (!cab && lastCab && rowHasData(r, m, SHIFT_DATA_FIELDS)) cab = lastCab;
    if (!cab || isJunkCab(cab)) continue;
    lastCab = cab;

    let date: string | null = sheetDate;
    if (m.date !== undefined) {
      const raw = get(r, m, "date");
      date = parseDate(raw) ?? (str(raw) === "" ? lastDate : null);
      if (!date) {
        errors.push(`${sheet} row ${line}: date not recognised ("${str(raw)}")`);
        continue;
      }
      lastDate = date;
    }
    if (!date) continue;

    const person = splitPerson(splitTwo(str(get(r, m, "driver")))[0] ?? "");
    const base = {
      sheet,
      line,
      date,
      cabNumber: cab,
      model: str(get(r, m, "model")),
      owner: splitPerson(str(get(r, m, "owner"))).name,
      phone: str(get(r, m, "phone")) || person.phone,
      reason: str(get(r, m, "reason")),
      notes: str(get(r, m, "notes")),
      schedIn: null as string | null,
      schedOut: null as string | null,
    };

    if (wide) {
      for (const st of SHIFTS) {
        const raw = pairRaw(r, m, st === "day" ? "dayIn" : "nightIn", st === "day" ? "dayOut" : "nightOut", st === "day" ? "dayTime" : "nightTime");
        const pair = fixPair(st, raw.a, raw.b);
        const drvCol = st === "day" ? "dayDriver" : "nightDriver";
        const drv = m[drvCol] !== undefined ? splitPerson(str(get(r, m, drvCol))).name : person.name;
        const own = statusStrict(get(r, m, st === "day" ? "dayStatus" : "nightStatus"));
        const gen = statusStrict(get(r, m, "status"));
        const hasTimes = Boolean(pair.in || pair.out);
        let status: AttendanceStatus | null = own ?? (hasTimes ? "present" : null);
        if (!status && gen && (st === "day" || nightCabs.has(cabKey(cab)))) status = gen;
        if (!status) continue;
        out.push({ ...base, shiftType: st, status, driverName: drv, actualIn: pair.in, actualOut: pair.out });
      }
      continue;
    }

    const raw = pairRaw(r, m, "in", "out", "time");
    const shiftText = str(get(r, m, "shift"));
    const fromText = shiftFromText(shiftText);
    const shiftType: ShiftType = fromText === "day" || fromText === "night" ? fromText : guessShift(raw.a);
    const pair = fixPair(shiftType, raw.a, raw.b);
    const sched = fixPair(shiftType, timeX(get(r, m, "schedIn")), timeX(get(r, m, "schedOut")));
    const st = statusStrict(get(r, m, "status"));
    const status: AttendanceStatus = st && !(st === "absent" && pair.in) ? st : pair.in || pair.out ? "present" : "pending";
    out.push({
      ...base,
      schedIn: sched.in,
      schedOut: sched.out,
      shiftType,
      status,
      driverName: person.name,
      actualIn: pair.in,
      actualOut: pair.out,
    });
  }
  return out;
}

function parseRegister(sheet: string, body: Body, m: FieldMap, dateCols: Map<number, string>): ParsedRow[] {
  const out: ParsedRow[] = [];
  let lastCab = "";
  for (const { r, line } of body) {
    let cab = cleanCab(str(get(r, m, "cab")));
    if (!cab && lastCab) cab = lastCab;
    if (!cab || isJunkCab(cab)) continue;
    lastCab = cab;
    const person = splitPerson(splitTwo(str(get(r, m, "driver")))[0] ?? "");
    const fixedShift = shiftFromText(str(get(r, m, "shift")));
    for (const [col, date] of dateCols) {
      const v = r[col];
      if (str(v) === "") continue;
      const rg = rangeX(v);
      const single = rg ? null : timeX(v);
      const st = statusStrict(v);
      if (!rg && !single && !st) continue;
      const shiftType: ShiftType = fixedShift === "night" || fixedShift === "day" ? fixedShift : guessShift(rg?.a ?? single);
      const pair = fixPair(shiftType, rg?.a ?? single, rg?.b ?? null);
      out.push({
        sheet,
        line,
        date,
        cabNumber: cab,
        model: str(get(r, m, "model")),
        owner: splitPerson(str(get(r, m, "owner"))).name,
        shiftType,
        status: st ?? "present",
        driverName: person.name,
        phone: str(get(r, m, "phone")) || person.phone,
        actualIn: pair.in,
        actualOut: pair.out,
        schedIn: null,
        schedOut: null,
        reason: "",
        notes: "",
      });
    }
  }
  return out;
}

function parseMaster(body: Body, m: FieldMap): MasterRow[] {
  const merged = new Map<string, MasterRow>();
  const shiftCols = ["shift", "time", "dayTime", "nightTime", "in", "dayIn", "dayOut", "nightIn", "nightOut", "dayDriver", "nightDriver", "runsDay", "runsNight", "schedIn"];
  const hasShiftInfo = shiftCols.some((f) => m[f] !== undefined);
  const longFormat = m.shift !== undefined && !["dayIn", "nightIn", "dayTime", "nightTime", "dayDriver", "nightDriver"].some((f) => m[f] !== undefined);
  let lastCab = "";

  for (const { r } of body) {
    let cab = cleanCab(str(get(r, m, "cab")));
    if (!cab && lastCab && rowHasData(r, m, SHIFT_DATA_FIELDS)) cab = lastCab;
    if (!cab || isJunkCab(cab)) continue;
    lastCab = cab;
    const key = cabKey(cab);
    const row: MasterRow = merged.get(key) ?? {
      cabNumber: cab, model: "", owner: "", phone: "", status: "",
      dayIn: null, dayOut: null, nightIn: null, nightOut: null,
      dayDriver: "", nightDriver: "", runsDay: null, runsNight: null, hasShiftInfo,
    };
    row.model ||= str(get(r, m, "model"));
    row.owner ||= splitPerson(str(get(r, m, "owner"))).name;
    row.status ||= cabStatus(get(r, m, "status"));
    const rd = yesNo(get(r, m, "runsDay"));
    const rn = yesNo(get(r, m, "runsNight"));
    if (rd !== null) row.runsDay = rd;
    if (rn !== null) row.runsNight = rn;

    const driverCell = str(get(r, m, "driver"));
    const names = splitTwo(driverCell).map((x) => splitPerson(x));
    const phoneCell = str(get(r, m, "phone"));
    row.phone ||= phoneCell || names[0]?.phone || "";

    const setShift = (st: ShiftType, inT: string | null, outT: string | null) => {
      if (st === "day") {
        row.dayIn ??= inT;
        row.dayOut ??= outT;
      } else {
        row.nightIn ??= inT;
        row.nightOut ??= outT;
      }
    };

    if (longFormat) {
      let raw = pairRaw(r, m, "in", "out", "time");
      if (!raw.a && !raw.b) raw = pairRaw(r, m, "schedIn", "schedOut");
      const shiftText = str(get(r, m, "shift"));
      if (!raw.a && !raw.b) {
        const rg = rangeX(shiftText);
        if (rg) raw = { a: rg.a, b: rg.b };
      }
      const t = shiftFromText(shiftText);
      const targets: ShiftType[] = t === "both" ? ["day", "night"] : t ? [t] : [guessShift(raw.a)];
      targets.forEach((st, i) => {
        const p = fixPair(st, raw.a, raw.b);
        if (targets.length === 1 || st === "day") setShift(st, p.in, p.out);
        const nm = names[i]?.name ?? names[0]?.name ?? "";
        if (st === "day") row.dayDriver ||= nm;
        else row.nightDriver ||= nm;
        if (st === "day") row.runsDay ??= true;
        else row.runsNight ??= true;
      });
    } else {
      for (const st of SHIFTS) {
        const raw = pairRaw(r, m, st === "day" ? "dayIn" : "nightIn", st === "day" ? "dayOut" : "nightOut", st === "day" ? "dayTime" : "nightTime");
        const p = fixPair(st, raw.a, raw.b);
        setShift(st, p.in, p.out);
        const col = st === "day" ? "dayDriver" : "nightDriver";
        const d = splitPerson(str(get(r, m, col)));
        if (d.name) {
          if (st === "day") row.dayDriver ||= d.name;
          else row.nightDriver ||= d.name;
          if (!row.phone && d.phone) row.phone = d.phone;
        }
      }
      if (m.time !== undefined || m.in !== undefined || m.schedIn !== undefined) {
        let raw = pairRaw(r, m, "in", "out", "time");
        if (!raw.a && !raw.b) raw = pairRaw(r, m, "schedIn", "schedOut");
        const t = shiftFromText(str(get(r, m, "time")));
        const st: ShiftType = t === "night" || t === "day" ? t : guessShift(raw.a);
        const p = fixPair(st, raw.a, raw.b);
        setShift(st, p.in, p.out);
      }
      if (names.length) {
        const hasDay = Boolean(row.dayIn || row.dayOut);
        const hasNight = Boolean(row.nightIn || row.nightOut);
        if (names.length >= 2 && m.dayDriver === undefined && m.nightDriver === undefined) {
          row.dayDriver ||= names[0].name;
          row.nightDriver ||= names[1].name;
        } else {
          const nm = names[0].name;
          if (m.dayDriver === undefined && (hasDay || !hasNight)) row.dayDriver ||= nm;
          if (m.nightDriver === undefined && (hasNight || !hasDay)) row.nightDriver ||= nm;
        }
      }
    }
    merged.set(key, row);
  }
  return [...merged.values()];
}

function parseDrivers(body: Body, m: FieldMap): DriverRow[] {
  const out: DriverRow[] = [];
  for (const { r } of body) {
    for (const f of ["driver", "dayDriver", "nightDriver"]) {
      if (m[f] === undefined) continue;
      const p = splitPerson(str(get(r, m, f)));
      if (!p.name) continue;
      const st = norm(str(get(r, m, "status")));
      out.push({
        name: p.name,
        phone: str(get(r, m, "phone")) || p.phone,
        license: str(get(r, m, "license")),
        expiry: parseDate(get(r, m, "expiry")),
        status: st === "inactive" || st === "left" ? "inactive" : st === "active" ? "active" : "",
      });
    }
  }
  return out;
}

function parseSheet(name: string, matrix: unknown[][], opts: ParseOptions): SheetResult {
  const { hIdx, headers } = pickHeader(matrix);
  const body: Body = [];
  for (let i = hIdx + 1; i < matrix.length; i += 1) {
    const r = matrix[i] ?? [];
    if (r.some((c) => str(c) !== "")) body.push({ r, line: i + 1 });
  }
  const rawHeader = matrix[hIdx] ?? [];
  const map = autoMap(headers);

  const dateCols = new Map<number, string>();
  if (map.date === undefined) {
    const usedIdx = new Set(Object.values(map));
    rawHeader.forEach((c, i) => {
      if (usedIdx.has(i)) return;
      const d = parseDate(c);
      if (d) dateCols.set(i, d);
    });
  }
  contentDetect(body.map((b) => b.r), headers, map, new Set(dateCols.keys()));

  const ov = opts.overrides?.[name];
  if (ov) {
    for (const [idxStr, field] of Object.entries(ov)) {
      const idx = Number(idxStr);
      for (const [f, i] of Object.entries(map)) if (i === idx) delete map[f];
      if (field) map[field] = idx;
      dateCols.delete(idx);
    }
  }
  delete map.skip;

  const sheetDate = opts.forceDate ?? parseDate(name);
  let kind: SheetKind = "empty";
  if (map.cab !== undefined && map.date === undefined && dateCols.size >= 3) kind = "register";
  else if (map.cab !== undefined && (map.date !== undefined || sheetDate)) kind = "attendance";
  else if (map.cab !== undefined) kind = "master";
  else if (map.driver !== undefined || map.dayDriver !== undefined || map.nightDriver !== undefined) kind = "drivers";

  const errors: string[] = [];
  const rows =
    kind === "attendance" ? parseAttendance(name, body, map, sheetDate, errors)
    : kind === "register" ? parseRegister(name, body, map, dateCols)
    : [];
  const master = kind === "master" ? parseMaster(body, map) : [];
  const driverRows = kind === "drivers" ? parseDrivers(body, map) : [];

  const ncol = Math.max(headers.length, ...body.slice(0, 100).map((b) => b.r.length), 0);
  const fieldOf = new Map<number, string>();
  for (const [f, i] of Object.entries(map)) fieldOf.set(i, f);
  const columns: SheetColumn[] = [];
  for (let i = 0; i < ncol; i += 1) {
    const samples: string[] = [];
    for (const b of body) {
      const v = displayCell(b.r[i]);
      if (v && !samples.includes(v)) samples.push(v);
      if (samples.length >= 3) break;
    }
    if (!headers[i] && !samples.length) continue;
    columns.push({
      index: i,
      header: headers[i] || `Column ${colLetter(i)}`,
      samples,
      field: fieldOf.get(i) ?? (kind === "register" && dateCols.has(i) ? "dateColumn" : ""),
    });
  }

  return { name, kind, headerRow: hIdx + 1, columns, rows, master, driverRows, errors, totalRows: body.length };
}

export function parseWorkbook(buf: Buffer, opts: ParseOptions = {}): ParseResult {
  const wb = XLSX.read(buf, { type: "buffer", raw: true, cellDates: false });
  const sheets: SheetResult[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws || !ws["!ref"]) continue;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "" });
    if (!matrix.length) continue;
    sheets.push(parseSheet(name, matrix, opts));
  }
  const errors = sheets.flatMap((s) => s.errors);
  if (!sheets.some((s) => s.kind !== "empty")) {
    errors.unshift("Could not find a cab number or driver column — use the dropdown next to each column to say what it is.");
  }
  return {
    sheets,
    rows: sheets.flatMap((s) => s.rows),
    master: sheets.flatMap((s) => s.master),
    driverRows: sheets.flatMap((s) => s.driverRows),
    errors,
    totalRows: sheets.reduce((n, s) => n + s.totalRows, 0),
  };
}

/* ================================================================== */
/* Saving — merge only, never deletes real data                       */
/* ================================================================== */

export type ImportSummary = {
  attendanceNew: number;
  attendanceUpdated: number;
  skipped: number;
  cabsCreated: number;
  cabsUpdated: number;
  driversCreated: number;
  driversUpdated: number;
  assigned: number;
  dates: string[];
};

const PALETTE = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#ef4444", "#14b8a6", "#f97316", "#84cc16"];

const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

class DriverIndex {
  private list: Driver[];
  constructor(list: Driver[]) {
    this.list = [...list];
  }
  find(name: string): Driver | null {
    const k = nameKey(name);
    if (!k) return null;
    const exact = this.list.find((d) => nameKey(d.name) === k);
    if (exact) return exact;
    const tokens = k.split(" ");
    const matches =
      tokens.length === 1
        ? this.list.filter((d) => nameKey(d.name).split(" ")[0] === k)
        : this.list.filter((d) => nameKey(d.name) === tokens[0]);
    return matches.length === 1 ? matches[0] : null;
  }
  add(d: Driver) {
    this.list.push(d);
  }
  replace(id: string, d: Driver) {
    this.list = this.list.map((x) => (x.id === id ? d : x));
  }
}

function medianTime(values: number[]): number | null {
  if (!values.length) return null;
  const ref = values[0];
  const adj = values
    .map((v) => {
      let d = v - ref;
      if (d > 720) d -= 1440;
      if (d < -720) d += 1440;
      return ref + d;
    })
    .sort((a, b) => a - b);
  const mid = adj[Math.floor(adj.length / 2)];
  return (((Math.round(mid / 15) * 15) % 1440) + 1440) % 1440;
}

type Tpl = Partial<Record<ShiftType, { in: string | null; out: string | null; explicit: boolean }>>;

export async function saveImport(parsed: ParseResult, fileName: string, fileData: string | null): Promise<ImportSummary> {
  const summary: ImportSummary = {
    attendanceNew: 0, attendanceUpdated: 0, skipped: parsed.errors.length,
    cabsCreated: 0, cabsUpdated: 0, driversCreated: 0, driversUpdated: 0, assigned: 0, dates: [],
  };
  const cabCache = new Map<string, Cab>((await db.select().from(cabs)).map((c) => [cabKey(c.cabNumber), c]));
  const dIndex = new DriverIndex(await db.select().from(drivers));
  const shiftMap = new Map<string, CabShift>((await db.select().from(cabShifts)).map((s) => [`${s.cabId}:${s.shiftType}`, s]));

  const ensureDriver = async (raw: string, phone = "", extra: { license?: string; expiry?: string | null; status?: string } = {}): Promise<string | null> => {
    const p = splitPerson(raw);
    if (!p.name) return null;
    const ph = phone || p.phone;
    const found = dIndex.find(p.name);
    if (found) {
      const upd: Partial<typeof drivers.$inferInsert> = {};
      if (ph && !found.phone) upd.phone = ph;
      if (extra.license && !found.licenseNumber) upd.licenseNumber = extra.license;
      if (extra.expiry && extra.expiry !== found.licenseExpiry) upd.licenseExpiry = extra.expiry;
      if (extra.status && extra.status !== found.status) upd.status = extra.status;
      const fk = nameKey(found.name);
      const nk = nameKey(p.name);
      const shouty = found.name === found.name.toUpperCase() && /[A-Z]/.test(found.name);
      if ((fk !== nk && nk.startsWith(`${fk} `)) || (fk === nk && found.name !== p.name && shouty)) upd.name = p.name;
      if (Object.keys(upd).length) {
        const [u] = await db.update(drivers).set(upd).where(eq(drivers.id, found.id)).returning();
        dIndex.replace(found.id, u);
        summary.driversUpdated += 1;
      }
      return found.id;
    }
    const [row] = await db
      .insert(drivers)
      .values({ name: p.name, phone: ph, licenseNumber: extra.license ?? "", licenseExpiry: extra.expiry ?? null, status: extra.status === "inactive" ? "inactive" : "active" })
      .returning();
    dIndex.add(row);
    summary.driversCreated += 1;
    return row.id;
  };

  const ensureCab = async (display: string, info: { model?: string; owner?: string; status?: string }, tpl?: Tpl, runs?: Record<ShiftType, boolean>) => {
    const key = cabKey(display);
    const hit = cabCache.get(key);
    if (hit) return { cab: hit, created: false };
    const [row] = await db
      .insert(cabs)
      .values({ cabNumber: display, model: info.model ?? "", ownerName: info.owner ?? "", status: info.status || "active", color: PALETTE[cabCache.size % PALETTE.length] })
      .returning();
    for (const st of SHIFTS) {
      const t = tpl?.[st];
      const [s] = await db
        .insert(cabShifts)
        .values({
          cabId: row.id,
          shiftType: st,
          scheduledIn: t?.in ?? DEFAULT_SHIFTS[st].in,
          scheduledOut: t?.out ?? DEFAULT_SHIFTS[st].out,
          isDefault: !(t?.explicit && (t.in || t.out)),
          enabled: runs ? runs[st] : true,
        })
        .returning();
      shiftMap.set(`${row.id}:${st}`, s);
    }
    cabCache.set(key, row);
    summary.cabsCreated += 1;
    return { cab: row, created: true };
  };

  const setTemplate = async (cabId: string, st: ShiftType, inT: string | null, outT: string | null, enabled: boolean | null) => {
    const key = `${cabId}:${st}`;
    const s = shiftMap.get(key);
    const explicit = Boolean(inT || outT);
    const newIn = inT ?? hhmm(s?.scheduledIn) ?? DEFAULT_SHIFTS[st].in;
    const newOut = outT ?? hhmm(s?.scheduledOut) ?? DEFAULT_SHIFTS[st].out;
    if (!s) {
      const [n] = await db.insert(cabShifts).values({ cabId, shiftType: st, scheduledIn: newIn, scheduledOut: newOut, isDefault: !explicit, enabled: enabled ?? true }).returning();
      shiftMap.set(key, n);
      return;
    }
    if (explicit && s.isDefault && (hhmm(s.scheduledIn) !== newIn || hhmm(s.scheduledOut) !== newOut)) {
      await reapplySchedule(cabId, st, s.scheduledIn, s.scheduledOut, newIn, newOut);
    }
    const nextEnabled = enabled ?? s.enabled;
    const [u] = await db
      .update(cabShifts)
      .set({ scheduledIn: newIn, scheduledOut: newOut, isDefault: explicit ? false : s.isDefault, enabled: nextEnabled })
      .where(eq(cabShifts.id, s.id))
      .returning();
    shiftMap.set(key, u);
    if (s.enabled && !nextEnabled) {
      await db.delete(attendance).where(and(eq(attendance.cabId, cabId), eq(attendance.shiftType, st), eq(attendance.status, "pending"), eq(attendance.source, "auto")));
    }
  };

  const setDefaultDriver = async (cabId: string, st: ShiftType, driverId: string) => {
    const key = `${cabId}:${st}`;
    const s = shiftMap.get(key);
    if (!s || s.defaultDriverId === driverId) return;
    const [u] = await db.update(cabShifts).set({ defaultDriverId: driverId }).where(eq(cabShifts.id, s.id)).returning();
    shiftMap.set(key, u);
    summary.assigned += 1;
  };

  /* 1) driver lists */
  for (const d of parsed.driverRows) {
    await ensureDriver(d.name, d.phone, { license: d.license, expiry: d.expiry, status: d.status });
  }

  /* 2) cab lists (authoritative for timing, drivers, running shifts) */
  for (const mr of parsed.master) {
    const hasDay = Boolean(mr.dayIn || mr.dayOut || mr.dayDriver);
    const hasNight = Boolean(mr.nightIn || mr.nightOut || mr.nightDriver);
    const runs: Record<ShiftType, boolean> = {
      day: mr.runsDay ?? (mr.hasShiftInfo ? hasDay || !hasNight : true),
      night: mr.runsNight ?? (mr.hasShiftInfo ? hasNight : true),
    };
    const { cab, created } = await ensureCab(
      mr.cabNumber,
      { model: mr.model, owner: mr.owner, status: mr.status },
      { day: { in: mr.dayIn, out: mr.dayOut, explicit: true }, night: { in: mr.nightIn, out: mr.nightOut, explicit: true } },
      runs,
    );
    if (!created) {
      const upd: Partial<typeof cabs.$inferInsert> = {};
      if (mr.model && mr.model !== cab.model) upd.model = mr.model;
      if (mr.owner && mr.owner !== cab.ownerName) upd.ownerName = mr.owner;
      if (mr.status && mr.status !== cab.status) upd.status = mr.status;
      if (Object.keys(upd).length) {
        const [u] = await db.update(cabs).set(upd).where(eq(cabs.id, cab.id)).returning();
        cabCache.set(cabKey(u.cabNumber), u);
      }
      await setTemplate(cab.id, "day", mr.dayIn, mr.dayOut, mr.hasShiftInfo || mr.runsDay !== null ? runs.day : null);
      await setTemplate(cab.id, "night", mr.nightIn, mr.nightOut, mr.hasShiftInfo || mr.runsNight !== null ? runs.night : null);
      summary.cabsUpdated += 1;
    }
    const dd = await ensureDriver(mr.dayDriver, mr.phone);
    const nd = await ensureDriver(mr.nightDriver, mr.dayDriver ? "" : mr.phone);
    if (dd) await setDefaultDriver(cab.id, "day", dd);
    if (nd) await setDefaultDriver(cab.id, "night", nd);
  }

  /* 3) daily records */
  if (parsed.rows.length) {
    type Sample = { ins: number[]; outs: number[]; schedIn: string | null; schedOut: string | null; seen: boolean };
    const emptySample = (): Sample => ({ ins: [], outs: [], schedIn: null, schedOut: null, seen: false });
    const fresh = new Map<string, { display: string; model: string; owner: string; s: Record<ShiftType, Sample> }>();
    for (const r of parsed.rows) {
      const key = cabKey(r.cabNumber);
      if (cabCache.has(key)) continue;
      let e = fresh.get(key);
      if (!e) {
        e = { display: r.cabNumber, model: "", owner: "", s: { day: emptySample(), night: emptySample() } };
        fresh.set(key, e);
      }
      e.model ||= r.model;
      e.owner ||= r.owner;
      const s = e.s[r.shiftType];
      s.seen = true;
      if (r.schedIn) s.schedIn = r.schedIn;
      if (r.schedOut) s.schedOut = r.schedOut;
      if (r.status === "present" || r.status === "half_day") {
        const a = timeToMinutes(r.actualIn);
        const b = timeToMinutes(r.actualOut);
        if (a !== null) s.ins.push(a);
        if (b !== null) s.outs.push(b);
      }
    }
    for (const e of fresh.values()) {
      const tpl: Tpl = {};
      for (const st of SHIFTS) {
        const s = e.s[st];
        if (s.schedIn || s.schedOut) tpl[st] = { in: s.schedIn, out: s.schedOut, explicit: true };
        else {
          const a = medianTime(s.ins);
          const b = medianTime(s.outs);
          tpl[st] = { in: a === null ? null : minutesToTime(a), out: b === null ? null : minutesToTime(b), explicit: false };
        }
      }
      await ensureCab(e.display, { model: e.model, owner: e.owner }, tpl, { day: e.s.day.seen, night: e.s.night.seen });
    }

    const allDates = parsed.rows.map((r) => r.date).sort();
    const existingList = await db
      .select()
      .from(attendance)
      .where(and(gte(attendance.date, allDates[0]), lte(attendance.date, allDates[allDates.length - 1])));
    const existing = new Map<string, Attendance>(existingList.map((a) => [`${a.cabId}:${a.date}:${a.shiftType}`, a]));
    const inserts = new Map<string, NewAttendance>();
    const dates = new Set<string>();

    for (const r of parsed.rows) {
      try {
        let { cab } = await ensureCab(r.cabNumber, { model: r.model, owner: r.owner });
        if ((r.model && !cab.model) || (r.owner && !cab.ownerName)) {
          const [u] = await db
            .update(cabs)
            .set({ model: cab.model || r.model, ownerName: cab.ownerName || r.owner })
            .where(eq(cabs.id, cab.id))
            .returning();
          cabCache.set(cabKey(u.cabNumber), u);
          cab = u;
        }
        const tKey = `${cab.id}:${r.shiftType}`;
        let tpl = shiftMap.get(tKey);
        if (tpl && !tpl.enabled) {
          const [u] = await db.update(cabShifts).set({ enabled: true }).where(eq(cabShifts.id, tpl.id)).returning();
          shiftMap.set(tKey, u);
          tpl = u;
        }
        const key = `${cab.id}:${r.date}:${r.shiftType}`;
        const prev = (inserts.get(key) ?? existing.get(key)) as Partial<Attendance> | undefined;
        const status: AttendanceStatus = r.status === "pending" && prev?.status ? (prev.status as AttendanceStatus) : r.status;
        const working = status === "present" || status === "half_day";
        const schedIn = r.schedIn ?? hhmm(prev?.scheduledIn) ?? hhmm(tpl?.scheduledIn) ?? DEFAULT_SHIFTS[r.shiftType].in;
        const schedOut = r.schedOut ?? hhmm(prev?.scheduledOut) ?? hhmm(tpl?.scheduledOut) ?? DEFAULT_SHIFTS[r.shiftType].out;
        const actualIn = r.actualIn ?? hhmm(prev?.actualIn) ?? null;
        const actualOut = r.actualOut ?? hhmm(prev?.actualOut) ?? null;
        let driverId = await ensureDriver(r.driverName, r.phone);
        if (!driverId) driverId = prev?.driverId ?? (working || status === "pending" ? (tpl?.defaultDriverId ?? null) : null);
        const values = {
          status,
          driverId: status === "off" ? null : driverId,
          scheduledIn: schedIn,
          scheduledOut: schedOut,
          actualIn: working ? actualIn : null,
          actualOut: working ? actualOut : null,
          lateMinutes: working ? computeLateMinutes(schedIn, actualIn) : 0,
          overtimeMinutes: working ? computeOvertimeMinutes(schedOut, actualOut) : 0,
          earlyOffMinutes: status === "present" ? computeEarlyMinutes(schedOut, actualOut) : 0,
          reason: r.reason || prev?.reason || "",
          notes: r.notes || prev?.notes || "",
          source: "upload",
          updatedAt: new Date(),
        };
        const pend = inserts.get(key);
        const ex = existing.get(key);
        if (pend) Object.assign(pend, values);
        else if (ex) {
          await db.update(attendance).set(values).where(eq(attendance.id, ex.id));
          existing.set(key, { ...ex, ...values });
          summary.attendanceUpdated += 1;
        } else inserts.set(key, { cabId: cab.id, date: r.date, shiftType: r.shiftType, ...values });
        dates.add(r.date);
      } catch (e) {
        console.error("import row failed", r.sheet, r.line, e);
        summary.skipped += 1;
      }
    }
    const list = [...inserts.values()];
    for (let i = 0; i < list.length; i += 500) {
      await db.insert(attendance).values(list.slice(i, i + 500)).onConflictDoNothing();
    }
    summary.attendanceNew = list.length;
    summary.dates = [...dates].sort();
  }

  /* 4) learn regular drivers from records + refresh today's pending rows */
  summary.assigned += await learnAssignments();
  await syncPendingRows();

  await db.insert(uploads).values({
    fileName,
    totalRows: parsed.totalRows,
    inserted: summary.attendanceNew + summary.cabsCreated,
    updated: summary.attendanceUpdated + summary.cabsUpdated,
    skipped: summary.skipped,
    cabsCreated: summary.cabsCreated,
    driversCreated: summary.driversCreated,
    errors: parsed.errors.slice(0, 50).join("\n"),
    fileData,
  });

  return summary;
}
