// Expense posting policy for the Services screen and TBS invoice transfers.
// Use account codes, not mutable Chart of Accounts labels.
export const SERVICE_EXPENSE_GL = Object.freeze({
  professional: '5010',
  employeeWages: '5000',
  employeeReimbursement: '5980',
});

export function serviceExpenseAccountCode(service = {}) {
  // An invoice sent from TBS must always be treated as an outside professional service.
  if (service.sourceInvoiceId || service.source_invoice_id) return SERVICE_EXPENSE_GL.professional;
  const resourceType = service.resourceType || service.resource_type || 'service_provider';
  return resourceType === 'employee'
    ? SERVICE_EXPENSE_GL.employeeWages
    : SERVICE_EXPENSE_GL.professional;
}

export function serviceReimbursementAccountCode(service = {}) {
  return serviceExpenseAccountCode(service) === SERVICE_EXPENSE_GL.employeeWages
    ? SERVICE_EXPENSE_GL.employeeReimbursement
    : SERVICE_EXPENSE_GL.professional;
}
