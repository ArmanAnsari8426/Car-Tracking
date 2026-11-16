import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { normalizePin, normalizeRecoveryCode } from "./pin";

export async function getSetting(key: string, fallback = ""): Promise<string> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return row?.value ?? fallback;
}

export async function setSetting(key: string, value: string) {
  await db.insert(appSettings).values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}

export async function isDriverFormEnabled() {
  return (await getSetting("driver_form_enabled", "false")) === "true";
}

const randomKey = (n = 10) => randomBytes(16).toString("hex").slice(0, n);

export async function getDriverFormKey(): Promise<string> {
  const k = await getSetting("driver_form_key", "");
  if (k) return k;
  await db.insert(appSettings).values({ key: "driver_form_key", value: randomKey() }).onConflictDoNothing();
  return getSetting("driver_form_key");
}

export async function regenerateDriverFormKey(): Promise<string> {
  const k = randomKey();
  await setSetting("driver_form_key", k);
  return k;
}

export async function getPublicUrl(): Promise<string> {
  return getSetting("public_url", "");
}

/* ----------------------------- admin PIN ----------------------------- */
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const stretch = (pin: string, salt: string): Promise<string> => new Promise((resolve, reject) => {
  scrypt(pin, salt, 32, (error, key) => error ? reject(error) : resolve(key.toString("hex")));
});

async function credentials() {
  const rows = await db.select().from(appSettings).where(inArray(appSettings.key, ["admin_pin_hash", "admin_pin_salt", "admin_recovery_hash"]));
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { hash: s.admin_pin_hash ?? "", salt: s.admin_pin_salt ?? "", recovery: s.admin_recovery_hash ?? "" };
}

export async function hasAdminPin(): Promise<boolean> {
  return (await getSetting("admin_pin_hash", "")) !== "";
}

/** Preserve existing sessions and legacy PINs; PIN changes invalidate old sessions. */
export async function adminSessionToken(): Promise<string> {
  const h = await getSetting("admin_pin_hash", "");
  return h ? sha(`${h}:session`) : "";
}

export async function verifyAdmin(raw: string): Promise<"pin" | "recovery" | null> {
  const { hash, salt, recovery } = await credentials();
  if (!hash) return "pin";
  const pin = normalizePin(raw);
  if (/^\d{4,8}$/.test(pin)) {
    // Old installed PINs remain valid. New PINs use scrypt, not a fast hash.
    const candidate = hash.startsWith("scrypt$") ? `scrypt$${await stretch(pin, salt)}` : sha(`${salt}:${pin}`);
    if (safeEqual(candidate, hash)) return "pin";
  }
  const code = normalizeRecoveryCode(raw);
  return recovery && safeEqual(sha(`${salt}:${code}`), recovery) ? "recovery" : null;
}

/** Recovery code is one-use, but recovery does NOT remove the existing PIN. */
export async function consumeRecoveryCode(raw: string): Promise<boolean> {
  const { salt, recovery } = await credentials();
  if (!recovery) return false;
  const expected = sha(`${salt}:${normalizeRecoveryCode(raw)}`);
  const changed = await db.update(appSettings).set({ value: "", updatedAt: new Date() })
    .where(and(eq(appSettings.key, "admin_recovery_hash"), eq(appSettings.value, expected)))
    .returning({ key: appSettings.key });
  return changed.length === 1;
}

/** Salt, PIN hash and recovery hash commit together; never leave a half-written PIN. */
export async function setAdminPin(raw: string): Promise<string | null> {
  const pin = normalizePin(raw);
  const salt = pin ? randomBytes(16).toString("hex") : "";
  const recovery = pin ? `${randomKey(4)}-${randomKey(4)}`.toUpperCase() : null;
  const hash = pin ? `scrypt$${await stretch(pin, salt)}` : "";
  const values = [
    { key: "admin_pin_salt", value: salt },
    { key: "admin_pin_hash", value: hash },
    { key: "admin_recovery_hash", value: recovery ? sha(`${salt}:${recovery}`) : "" },
  ];
  await db.transaction(async (tx) => {
    for (const value of values) {
      await tx.insert(appSettings).values(value)
        .onConflictDoUpdate({ target: appSettings.key, set: { value: value.value, updatedAt: new Date() } });
    }
  });
  return recovery;
}
