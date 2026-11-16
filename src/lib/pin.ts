/** Client-safe PIN normalisation; preserve leading zeroes and accept mobile keyboards. */
export function normalizePin(value: string): string {
  return value
    .replace(/[०-९]/g, (c) => String(c.charCodeAt(0) - 0x0966))
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - 0xff10))
    .replace(/\s/g, "");
}

export function isValidPin(value: string): boolean {
  return /^\d{4,8}$/.test(normalizePin(value));
}

export function normalizeRecoveryCode(value: string): string {
  const code = value.trim().toUpperCase().replace(/[\s-]/g, "");
  return /^[A-F0-9]{8}$/.test(code) ? `${code.slice(0, 4)}-${code.slice(4)}` : value.trim().toUpperCase();
}
