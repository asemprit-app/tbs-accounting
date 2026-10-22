// One email address per Services payment, with a fallback for existing employees.
export function normalizeReceiptEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function isValidReceiptEmail(value) {
  const email = normalizeReceiptEmail(value);
  return !email || (email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

export function resolveReceiptEmail(service, employee) {
  return normalizeReceiptEmail(service?.email || employee?.email || '');
}
