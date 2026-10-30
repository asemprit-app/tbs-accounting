import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {retentionBalances,retentionDisplayRows,retentionPivot,FICA_DETAIL_GROUPS} from '../src/tbsRetentionLedger.js';

const input={
  services:[],
  payrollRuns:[{id:'run1',status:'FINAL',payDate:'2026-10-16'}],
  payrollLines:[{
    id:'l1',payrollRunId:'run1',gross:2000,prIncomeTax:100,
    socialSecurity:124,medicare:29,sinot:6,
  }],
};

test('FICA withheld = employee Social Security + Medicare, without additional payroll liability',()=>{
  const book=retentionBalances(input,[]);
  const summary=retentionDisplayRows(book.rows);
  const employee=summary.find(r=>r.category==='payroll_fica');
  const employer=summary.find(r=>r.category==='employer_fica');
  assert.deepEqual(FICA_DETAIL_GROUPS.payroll_fica,['payroll_ss','payroll_medicare']);
  assert.equal(employee.accrued,153);
  assert.equal(employer.accrued,153);
  assert.equal(employee.components.length,2);
  assert.equal(employer.components.length,2);
  assert.ok(!book.rows.some(r=>r.category==='payroll_fica'));
  assert.equal(book.rows.reduce((sum,r)=>sum+r.accrued,0),
    summary.reduce((sum,r)=>sum+r.accrued,0));
});
test('FICA total equals both shares, with distinct quarterly pivot component subtotals',()=>{
  const x=retentionBalances(input,[]);
  const q=retentionPivot(x,new Map([['2026-10',2000]]),'quarter');
  assert.equal(q.length,1);
  assert.equal(q[0].ficaEmployee,153);
  assert.equal(q[0].ficaEmployer,153);
  assert.equal(q[0].ficaTotal,306);
  assert.equal(q[0].period,'2026-Q4');
  assert.equal(q[0].retained,259); // PR 100 + FICA retained 153 + SINOT 6
  assert.equal(q[0].employer,159); // FICA employer 153 + SINOT employer 6
});
test('FICA row aggregates component payments without duplicating gross amount',()=>{
  const x=retentionBalances(input,[
    {category:'payroll_ss',tax_period:'2026-10',amount:100},
    {category:'payroll_medicare',tax_period:'2026-10',amount:29},
    {category:'employer_ss',tax_period:'2026-10',amount:124},
    {category:'employer_medicare',tax_period:'2026-10',amount:10},
  ]);
  const display=retentionDisplayRows(x.rows);
  const e=display.find(r=>r.category==='payroll_fica');
  const p=display.find(r=>r.category==='employer_fica');
  assert.deepEqual([e.paid,e.pending,p.paid,p.pending],[129,24,134,19]);
  assert.equal(display.filter(r=>r.category==='payroll_fica').length,1);
  assert.equal(display.filter(r=>r.category==='employer_fica').length,1);
});
test('FICA details in the UI are display only, and source payment categories remain available',()=>{
  const source=readFileSync(new URL('../src/TBSRetentionsView.jsx',import.meta.url),'utf8');
  assert.ok(source.includes('retentionDisplayRows(rawSummaryRows)'));
  assert.ok(source.includes("'FICA total (retenido + patronal)'"));
  assert.ok(source.includes("'ficaEmployee','ficaEmployer','ficaTotal'"));
  assert.ok(source.includes('Ver desglose de Seguro Social y Medicare'));
  assert.ok(source.includes('{RETENTION_CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}'));
});
