import test from 'node:test';
import assert from 'node:assert/strict';
import {payrollGrossByPeriod,retentionPivot,retentionBalances} from '../src/tbsRetentionLedger.js';
const runs=[
{id:'j',status:'FINAL',payDate:'2026-01-15'},
{id:'f',status:'FINAL',payDate:'2026-02-15'},
{id:'m',status:'FINAL',payDate:'2026-03-15'},
{id:'draft',status:'DRAFT',payDate:'2026-03-20'}];
const lines=[
{id:'1',payrollRunId:'j',gross:2500,prIncomeTax:70,socialSecurity:155,medicare:36.25,sinot:7.5},
{id:'2',payrollRunId:'f',gross:1000,prIncomeTax:15,socialSecurity:62,medicare:14.5,sinot:3},
{id:'3',payrollRunId:'m',gross:700,prIncomeTax:0,socialSecurity:43.4,medicare:10.15,sinot:2.1},
{id:'4',payrollRunId:'draft',gross:9000,socialSecurity:558,medicare:130.5}];
test('dynamic gross pay pivot calculates monthly and quarterly totals from FINAL payroll only',()=>{
 const gross=payrollGrossByPeriod(runs,lines);
 assert.equal(gross.get('2026-01'),2500);
 assert.equal(gross.get('2026-02'),1000);
 assert.equal(gross.get('2026-03'),700);
 const x=retentionBalances({payrollRuns:runs,payrollLines:lines},[]);
 const q=retentionPivot(x,gross,'quarter');
 assert.equal(q.length,1);
 assert.equal(q[0].period,'2026-Q1');
 assert.equal(q[0].gross,4200);
 assert.equal(q[0].retained,70+15+155+62+43.4+36.25+14.5+10.15+7.5+3+2.1);
 assert.equal(q[0].employer,155+62+43.4+36.25+14.5+10.15+7.5+3+2.1);
});
test('agency obligations and payments reduce only selected quarter balance',()=>{
 const gross=payrollGrossByPeriod(runs,lines);
 const balances=retentionBalances({payrollRuns:runs,payrollLines:lines,assessments:[
 {category:'employer_cfse',tax_period:'2026-01',amount:1500},
 {category:'employer_unemployment_pr',tax_period:'2026-03',amount:40}]},
 [{category:'employer_cfse',tax_period:'2026-01',amount:600}]);
 const q=retentionPivot(balances,gross,'quarter');
 assert.equal(q[0].paid,600);
 assert.ok(q[0].employer>=1540);
 assert.equal(q[0].pending,Number((q[0].retained+q[0].employer-600).toFixed(2)));
});
