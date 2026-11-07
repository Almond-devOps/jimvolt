export function normalizeNigerianPhone(value) {
  const digits = String(value || '').replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.startsWith('234')) return `+${digits}`;
  if (digits.startsWith('0')) return `+234${digits.slice(1)}`;
  if (/^[789]\d{9}$/.test(digits)) return `+234${digits}`;
  return `+${digits}`;
}

export function isValidNigerianPhone(value) {
  return /^\+234[789]\d{9}$/.test(normalizeNigerianPhone(value));
}
