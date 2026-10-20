// Payment advice is generated only from recorded Payroll / Services values.
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;
function breakdownRow(label, value, sign = 1) {
  return { label, amount: numeric(value) * sign };
}
export function payrollCheckVoucher(line, run, totalHours) {
  const rows = [breakdownRow('Gross Pay', line.gross)];
  for (const [label, key] of [
    ['Federal Income Tax', 'federalIncomeTax'],
    ['Puerto Rico Income Tax', 'prIncomeTax'],
    ['Social Security', 'socialSecurity'],
    ['Medicare', 'medicare'],
    ['SINOT', 'sinot'],
    ['Other Deductions', 'otherDeductions'],
  ]) {
    if (numeric(line[key])) rows.push(breakdownRow(label, line[key], -1));
  }
  if (numeric(line.reimbursement)) rows.push(breakdownRow('Reimbursement', line.reimbursement));
  return {
    kind: 'Payroll',
    period: [run?.periodStart, run?.periodEnd].filter(Boolean).join(' to '),
    reference: '',
    info: Number.isFinite(Number(totalHours)) ? `Hours: ${Number(totalHours).toFixed(2)}` : '',
    rows,
  };
}
export function serviceCheckVoucher(service, calculated) {
  const rows = [breakdownRow('Gross Services', calculated?.gross)];
  if (numeric(service.retentionAmount)) rows.push(breakdownRow('Withholding / Retention', service.retentionAmount, -1));
  if (numeric(calculated?.ivuAmount)) rows.push(breakdownRow('IVU', calculated.ivuAmount));
  if (numeric(service.reimbursement)) rows.push(breakdownRow('Reimbursement', service.reimbursement));
  return {
    kind: 'Services',
    period: service.date || '',
    reference: service.invoiceNumber ? `Invoice: ${service.invoiceNumber}` : '',
    info: numeric(service.hours) ? `Hours: ${numeric(service.hours).toFixed(2)}` : '',
    rows,
  };
}
export function customCheckStubSlots(sheetParts) {
  // Letter sheet with check at top, followed by one or two detachable payment-advice regions.
  return sheetParts === 2
    ? [{ top: 3.55, height: 7.30, label: 'Payment Copy' }]
    : [
      { top: 3.55, height: 3.45, label: 'Recipient Copy' },
      { top: 7.02, height: 3.83, label: 'Accounting Copy' },
    ];
}
