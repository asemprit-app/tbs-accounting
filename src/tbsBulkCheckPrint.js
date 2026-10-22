// Pure helpers for selecting and numbering Payroll checks without changing accounting.
export const PAYROLL_CHECK_TEMPLATE_IDS = Object.freeze([
  'standard_top',
  'office_depot_b7200',
  'three_per_page_style2',
  'laser_top_voucher',
  'checkworks_laser_top',
  'custom',
]);
export function selectPayrollChecks(checks, selectedIds) {
  const ids = new Set(selectedIds);
  return checks.filter(item => ids.has(item.id));
}
export function nextPayrollCheckNumber(firstNumber, index) {
  const raw = String(firstNumber ?? '').trim();
  if (!/^\d+$/.test(raw)) return '';
  const value = BigInt(raw) + BigInt(index);
  return String(value).padStart(raw.length, '0');
}
export function payrollCheckPrintSheets(checks, templateId) {
  const size = templateId === 'three_per_page_style2' ? 3 : 1;
  const pages = [];
  for (let i = 0; i < checks.length; i += size) pages.push(checks.slice(i, i + size));
  return pages;
}
