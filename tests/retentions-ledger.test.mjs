import test from 'node:test';
import assert from 'node:assert/strict';
import {retentionBalances,retentionObligations,isRetentionCategory} from '../src/tbsRetentionLedger.js';
const input={
 services:[
  {id:'s1',date:'2026-10-12',status:'FINAL',resourceType:'service_provider',retentionAmount:80.15},
  {id:'s2',date:'2026-10-12',status:'DRAFT',resourceType:'service_provider',retentionAmount:1000},
  {id:'s3',date:'2026-10-18',status:'FINAL',resourceType:'employee',retentionAmount:15}
 ],
 payrollRuns:[
  {id:'r1',payDate:'2026-10-16',status:'FINAL'},
  {id:'r2',payDate:'2026-10-30',status:'DRAFT'}
 ],
 payrollLines:[
  {id:'l1',payrollRunId:'r1',gross:1000,prIncomeTax:80.01,federalIncomeTax:5,socialSecurity:62,medicare:14.5,sinot:2.1},
  {id:'l2',payrollRunId:'r2',prIncomeTax:1000,socialSecurity:999},
 ]};
test('only finalized pay dates generate obligations with separate tax categories',()=>{
 const m=retentionObligations(input);
 assert.equal(m.get('services_contractor|2026-10'),8015);
 assert.equal(m.get('services_employee|2026-10'),1500);
 assert.equal(m.get('payroll_pr|2026-10'),8001);
 assert.equal(m.get('payroll_federal|2026-10'),500);
 assert.equal(m.get('payroll_ss|2026-10'),6200);
 assert.equal(m.get('payroll_medicare|2026-10'),1450);
 assert.equal(m.get('payroll_sinot|2026-10'),210);
 assert.equal(m.get('employer_ss|2026-10'),6200);
 assert.equal(m.get('employer_medicare|2026-10'),1450);
 assert.equal(m.get('employer_sinot|2026-10'),210);
 assert.equal(m.size,10);
});
test('payments allocate to specific tax month, partial payments preserve payable',()=>{
 const report=retentionBalances(input,[
  {category:'services_contractor',tax_period:'2026-10',amount:60.15},
  {category:'services_contractor',tax_period:'2026-10',amount:10},
 ]);
 const row=report.rows.find(x=>x.category==='services_contractor');
 assert.equal(row.accrued,80.15);assert.equal(row.paid,70.15);assert.equal(row.pending,10);
});
test('overpayments stay visible as credit without covering another month silently',()=>{
 const report=retentionBalances(input,[{category:'payroll_pr',tax_period:'2026-10',amount:100},
 {category:'payroll_pr',tax_period:'2026-09',amount:5}]);
 const a=report.rows.find(x=>x.category==='payroll_pr'&&x.period==='2026-10');
 const b=report.rows.find(x=>x.category==='payroll_pr'&&x.period==='2026-09');
 assert.equal(a.pending,0);assert.equal(a.overpaid,19.99);
 assert.equal(b.accrued,0);assert.equal(b.overpaid,5);
});
test('payments do not become new expenses and no employee net pay is modified',()=>{
 const original=JSON.stringify(input);
 retentionBalances(input,[{category:'payroll_ss',tax_period:'2026-10',amount:10}]);
 assert.equal(JSON.stringify(input),original);
 assert.equal(isRetentionCategory('made_up_category'),false);
});

test('unemployment/CFSE depend on explicit assessments, never invent rates from gross pay',()=>{
 const assessment={...input,assessments:[
   {category:'employer_unemployment_pr',tax_period:'2026-09',amount:135.20},
   {category:'employer_cfse',tax_period:'2026-07',amount:950},
 ]};
 const report=retentionBalances(assessment,[{category:'employer_cfse',tax_period:'2026-07',amount:300}]);
 assert.equal(report.rows.find(r=>r.category==='employer_unemployment_pr').pending,135.20);
 const cfse=report.rows.find(r=>r.category==='employer_cfse');
 assert.equal(cfse.accrued,950);assert.equal(cfse.pending,650);
 assert.ok(!report.rows.some(r=>r.category==='employer_unemployment_futa'));
});
