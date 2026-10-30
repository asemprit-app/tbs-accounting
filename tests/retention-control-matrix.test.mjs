import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {buildRetentionMatrix,filterMatrixRows,PAYMENT_FORM_GROUPS,CONTROL_GROUPS,groupPeriod} from '../src/tbsRetentionControlMatrix.js';

const input={
 services:[{id:'s1',status:'FINAL',date:'2026-10-07',resourceType:'service_provider',retentionAmount:50},
           {id:'draft',status:'DRAFT',date:'2026-10-09',resourceType:'service_provider',retentionAmount:999}],
 payrollRuns:[{id:'oct',payDate:'2026-10-16',status:'FINAL'},
              {id:'nov',payDate:'2026-11-16',status:'FINAL'},
              {id:'draft',payDate:'2026-10-24',status:'DRAFT'}],
 payrollLines:[{id:'1',payrollRunId:'oct',gross:2000,socialSecurity:124,medicare:29,sinot:6,prIncomeTax:100},
              {id:'2',payrollRunId:'nov',gross:1000,socialSecurity:62,medicare:14.5,sinot:3,prIncomeTax:20},
              {id:'3',payrollRunId:'draft',gross:10000,socialSecurity:620,medicare:145,prIncomeTax:1000}],
 assessments:[{category:'employer_cfse',tax_period:'2026-10',amount:100},
              {category:'employer_sinot',tax_period:'2026-10',amount:7}],
};
test('month matrix contains Gross Pay, separate FICA/SINOT employee and employer, PR Tax, Services and other',()=>{
 const rows=buildRetentionMatrix(input,[],'month'),r=rows.find(x=>x.period==='2026-10');
 assert.equal(r.gross,2000);
 assert.equal(r.fica_employee,153);
 assert.equal(r.fica_employer,153);
 assert.equal(r.sinot_employee,6);
 assert.equal(r.sinot_employer,7);
 assert.equal(r.pr_accrued,100);
 assert.equal(r.services_accrued,50);
 assert.equal(r.other_accrued,100);
 assert.equal(r.fica_pending,306);
 assert.equal(r.sinot_pending,13);
 assert.equal(r.pr_pending,100);
 assert.equal(r.services_pending,50);
 assert.equal(r.other_pending,100);
});
test('combined payment offsets both FICA employee and employer but does not double-count',()=>{
 const payments=[
 {tax_period:'2026-10',category:'fica_remittance',amount:200},
 {tax_period:'2026-10',category:'payroll_ss',amount:24},
 {tax_period:'2026-10',category:'employer_medicare',amount:29},
 {tax_period:'2026-10',category:'sinot_remittance',amount:8},
 {tax_period:'2026-10',category:'payroll_pr',amount:90},
 {tax_period:'2026-10',category:'services_remittance',amount:30},
 {tax_period:'2026-10',category:'employer_cfse',amount:50},
 ];
 const r=buildRetentionMatrix(input,payments)[0];
 assert.equal(r.fica_paid,253); assert.equal(r.fica_pending,53);
 assert.equal(r.sinot_paid,8); assert.equal(r.sinot_pending,5);
 assert.equal(r.pr_paid,90); assert.equal(r.pr_pending,10);
 assert.equal(r.services_paid,30); assert.equal(r.services_pending,20);
 assert.equal(r.other_paid,50); assert.equal(r.other_pending,50);
});
test('quarter/year sums monthly pending; monthly overpayment is not applied to another month',()=>{
 const payments=[{tax_period:'2026-10',category:'payroll_pr',amount:120}];
 const oct=buildRetentionMatrix(input,payments,'month').find(r=>r.period==='2026-10');
 const nov=buildRetentionMatrix(input,payments,'month').find(r=>r.period==='2026-11');
 assert.equal(oct.pr_pending,0);assert.equal(oct.overpaid,20);assert.equal(nov.pr_pending,20);
 const quarter=buildRetentionMatrix(input,payments,'quarter');
 assert.equal(quarter.length,1);assert.equal(quarter[0].period,'2026-Q4');
 assert.equal(quarter[0].pr_pending,20);assert.equal(quarter[0].pr_paid,120);
 const annual=buildRetentionMatrix(input,payments,'year');
 assert.equal(annual[0].period,'2026');assert.equal(annual[0].pr_pending,20);
 assert.equal(annual[0].gross,3000);assert.equal(annual[0].overpaid,20);
});
test('user-defined other employer amount and payment shows payable without modifying payroll',()=>{
 const base={...input,assessments:[...input.assessments,
  {category:'employer_other',tax_period:'2026-10',amount:77,reference:'Local insurance'}]};
 const copy=JSON.stringify(base);
 const row=buildRetentionMatrix(base,[{category:'employer_other',tax_period:'2026-10',amount:50}])
   .find(r=>r.period==='2026-10');
 assert.equal(row.other_accrued,177);assert.equal(row.other_paid,50);assert.equal(row.other_pending,127);
 assert.equal(JSON.stringify(base),copy);
});
test('filter by each numeric column is dynamic',()=>{
 const rows=buildRetentionMatrix(input,[],'month');
 assert.equal(filterMatrixRows(rows,{services_pending:'positive'}).length,1);
 assert.equal(filterMatrixRows(rows,{services_pending:'zero'}).length,1);
 assert.equal(filterMatrixRows(rows,{gross:'positive'}).length,2);
 assert.equal(groupPeriod('2026-10','quarter'),'2026-Q4');
 assert.equal(PAYMENT_FORM_GROUPS.some(x=>x.id==='fica_remittance'),true);
 assert.equal(PAYMENT_FORM_GROUPS.some(x=>x.id==='sinot_remittance'),true);
 assert.equal(CONTROL_GROUPS.length,5);
});
test('screen embeds matrix and preserves single-page payment and obligation entry',()=>{
 const ui=readFileSync(new URL('../src/TBSRetentionsView.jsx',import.meta.url),'utf8');
 const matrix=readFileSync(new URL('../src/TBSRetentionMatrix.jsx',import.meta.url),'utf8');
 assert.ok(ui.includes('<TBSRetentionMatrix services={services} payrollRuns={payrollRuns}'));
 assert.ok(ui.includes('id="retention-payment-form"'));
 assert.ok(ui.includes('PAYMENT_FORM_GROUPS.map'));
 assert.ok(ui.includes('saveAssessment'));
 assert.ok(ui.includes('savePayment'));
 assert.ok(matrix.includes("['month','Mensual'],['quarter','Trimestral'],['year','Anual']"));
 assert.ok(matrix.includes('aria-label={\'Filtrar \'+c.key}'));
 assert.ok(matrix.includes('Exportar matriz CSV'));
});
