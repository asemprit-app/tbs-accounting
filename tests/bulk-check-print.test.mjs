import test from 'node:test';
import assert from 'node:assert/strict';
import { PAYROLL_CHECK_TEMPLATE_IDS, selectPayrollChecks, nextPayrollCheckNumber, payrollCheckPrintSheets } from '../src/tbsBulkCheckPrint.js';

test('bulk check style choices mirror individual check style identifiers', () => {
  assert.deepEqual(PAYROLL_CHECK_TEMPLATE_IDS, ['standard_top','office_depot_b7200','three_per_page_style2','laser_top_voucher','checkworks_laser_top','custom']);
});
test('bulk printing selects only the intended employees and keeps payroll ordering', () => {
  const checks = [{id:'a',amount:100},{id:'b',amount:200},{id:'c',amount:300}];
  assert.deepEqual(selectPayrollChecks(checks,['c','a','c']).map(c=>c.id),['a','c']);
  assert.equal(selectPayrollChecks(checks,[]).length,0);
});
test('consecutive check numbers preserve leading zeros and do not alter amounts', () => {
  assert.equal(nextPayrollCheckNumber('00098',0),'00098');
  assert.equal(nextPayrollCheckNumber('00098',2),'00100');
  assert.equal(nextPayrollCheckNumber('',0),'');
  assert.equal(nextPayrollCheckNumber('bad',0),'');
});
test('3-to-a-page style places up to three checks per physical sheet', () => {
  const checks = Array.from({length:7},(_,i)=>({id:String(i)}));
  assert.deepEqual(payrollCheckPrintSheets(checks,'three_per_page_style2').map(x=>x.length),[3,3,1]);
  assert.deepEqual(payrollCheckPrintSheets(checks,'custom').map(x=>x.length),[1,1,1,1,1,1,1]);
});
