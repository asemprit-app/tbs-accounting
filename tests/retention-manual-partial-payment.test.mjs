import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildRetentionMatrix} from '../src/tbsRetentionControlMatrix.js';
const manual=(mode='reference')=>({
 tax_period:'2026-10',mode,gross_pay:2000,
 fica_employee:153,fica_employer:153,
 sinot_employee:6,sinot_employer:6,
 pr_tax:120,services_retention:50,
 planned_fica:200,planned_sinot:5,planned_pr:50,planned_services:20,
});
const input={
 payrollRuns:[{id:'r',payDate:'2026-10-16',status:'FINAL'}],
 payrollLines:[{payrollRunId:'r',gross:1000,socialSecurity:62,medicare:14.5,sinot:3,prIncomeTax:60}],
 services:[],assessments:[],
};
test('reference-only manual basis never duplicates finalized Payroll Gross Pay or retention balances',()=>{
 const original=buildRetentionMatrix(input,[],'month').find(x=>x.period==='2026-10');
 const withManual=buildRetentionMatrix({...input,manualEntries:[manual()]},[],'month').find(x=>x.period==='2026-10');
 assert.deepEqual(withManual,original);
 assert.equal(withManual.gross,1000);
 assert.equal(withManual.fica_pending,153);
});
test('manual additional Gross Pay and retentions add only to the selected month',()=>{
 const withManual=buildRetentionMatrix({...input,manualEntries:[manual('additional')]},[],'month');
 const x=withManual.find(r=>r.period==='2026-10');
 assert.equal(x.gross,3000);
 assert.equal(x.fica_employee,153+76.5);
 assert.equal(x.fica_employer,153+76.5);
 assert.equal(x.sinot_employee,9);
 assert.equal(x.sinot_employer,9);
 assert.equal(x.pr_accrued,180);
 assert.equal(x.services_accrued,50);
 assert.equal(x.fica_pending,459);
});
test('partial actual payments, not payment plans, reduce real pending balances',()=>{
 const entry=manual('additional');
 const before=buildRetentionMatrix({manualEntries:[entry]},[],'month')[0];
 assert.equal(before.fica_paid,0);
 assert.equal(before.fica_pending,306);
 assert.equal(before.pr_pending,120);
 const after=buildRetentionMatrix({manualEntries:[entry]},[
   {category:'fica_remittance',tax_period:'2026-10',amount:200},
   {category:'payroll_pr',tax_period:'2026-10',amount:50},
 ],'month')[0];
 assert.equal(after.fica_paid,200);
 assert.equal(after.fica_pending,106);
 assert.equal(after.pr_pending,70);
});
test('annual aggregation preserves missing liabilities and does not apply overpayment across months',()=>{
 const entries=[manual('additional'),{...manual('additional'),tax_period:'2026-11',gross_pay:1000,fica_employee:50,fica_employer:50}];
 const paid=[{category:'fica_remittance',tax_period:'2026-10',amount:400}];
 const monthly=buildRetentionMatrix({manualEntries:entries},paid,'month');
 const october=monthly.find(x=>x.period==='2026-10');
 assert.equal(october.fica_pending,0);
 assert.equal(october.overpaid,94);
 const annual=buildRetentionMatrix({manualEntries:entries},paid,'year')[0];
 assert.equal(annual.gross,3000);
 assert.equal(annual.fica_pending,100);
 assert.equal(annual.overpaid,94);
});
test('new controls provide form, fiscal month, source mode, intended payments and direct payment prefill',()=>{
 const ui=readFileSync(new URL('../src/TBSRetentionManualBases.jsx',import.meta.url),'utf8');
 const page=readFileSync(new URL('../src/TBSRetentionsView.jsx',import.meta.url),'utf8');
 const matrix=readFileSync(new URL('../src/TBSRetentionMatrix.jsx',import.meta.url),'utf8');
 const ddl=readFileSync(new URL('../docs/sql/tbs_retention_manual_payment_bases.sql',import.meta.url),'utf8');
 assert.ok(ui.includes("mode:'reference'"));
 assert.ok(ui.includes("mode==='additional'"));
 assert.ok(ui.includes("planned_fica"));
 assert.ok(ui.includes("planned_sinot"));
 assert.ok(ui.includes("planned_pr"));
 assert.ok(ui.includes("planned_services"));
 assert.ok(ui.includes('onPreparePayment({'));
 assert.ok(page.includes("from('tbs_retention_manual_bases')"));
 assert.ok(page.includes('onPreparePayment={prepareManualPayment}'));
 assert.ok(matrix.includes('manualEntries=[]'));
 assert.match(ddl,/enable row level security/);
 assert.match(ddl,/created_by=\(select auth.uid\(\)\)/);
 assert.match(ddl,/tbs_is_staff\(\)/);
 assert.ok(!ui.includes("from('journal_entries')"));
});
