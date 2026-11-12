import test from 'node:test';
import assert from 'node:assert/strict';
import { SERVICE_EXPENSE_GL, serviceExpenseAccountCode, serviceReimbursementAccountCode } from '../src/tbsServiceExpenseAccount.js';

test('Invoices transferred from TBS always debit 5010 Professional Services', () => {
  assert.equal(serviceExpenseAccountCode({ resourceType: 'service_provider', sourceInvoiceId: 'invoice-001' }), '5010');
  assert.equal(serviceExpenseAccountCode({ resource_type: 'employee', source_invoice_id: 'invoice-001' }), '5010');
  assert.equal(serviceReimbursementAccountCode({ sourceInvoiceId: 'invoice-001' }), '5010');
});

test('External providers debit 5010; employees debit wages 5000 instead of 6250', () => {
  assert.equal(serviceExpenseAccountCode({ resourceType: 'service_provider' }), '5010');
  assert.equal(serviceExpenseAccountCode({ resourceType: 'employee' }), '5000');
  assert.equal(serviceReimbursementAccountCode({ resourceType: 'employee' }), '5980');
  assert.equal(serviceReimbursementAccountCode({ resourceType: 'service_provider' }), '5010');
  assert.ok(!Object.values(SERVICE_EXPENSE_GL).includes('6250'));
});
