// Shared rules for printing checks on blank stock or bank-preprinted check stock.
// Preprinted stock already includes its own check number and bank MICR data.
// This option changes PRINT OUTPUT only; it does not edit payroll or service records.
export function shouldPrintCheckNumber({ usePreprintedCheck = false, checkNumber = '' } = {}) {
  return !usePreprintedCheck && Boolean(String(checkNumber).trim());
}

export function shouldPrintMicrLine({ usePreprintedCheck = false } = {}) {
  return !usePreprintedCheck;
}

export function validateCheckPrintFields({ usePreprintedCheck = false, routingNumber = '', bankAccountNumber = '', checkNumber = '' } = {}) {
  // Never require or attempt to duplicate bank-printed MICR information.
  if (usePreprintedCheck) return '';
  const digitsOnly = value => String(value || '').replace(/\D/g, '');
  if (digitsOnly(routingNumber).length !== 9) return 'Routing Number must contain exactly 9 digits.';
  if (!digitsOnly(bankAccountNumber)) return 'Enter the bank Account Number.';
  if (!digitsOnly(checkNumber)) return 'Enter the Check Number.';
  return '';
}
