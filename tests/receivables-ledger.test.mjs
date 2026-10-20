import test from 'node:test';
import assert from 'node:assert/strict';
import {
 invoiceAccrualDetails,invoiceAccrualPostings,invoicePostingDifference,
 bankCategoryNormalAmount,periodActivity,
} from '../src/tbsReceivablesLedger.js';

const accts=[
 ['1100','Asset'],['1350','Asset'],['1150','Asset'],['2030','Liability'],
 ['4000','Revenue'],['4010','Revenue'],['1010','Asset'],['6000','Expense'],
].map(([code,type])=>({code,type}));
const tbs=()=>({
 id:'test-invoice-85',number:'TBS-0085',date:'2026-10-20',
 lines:[{qty:1,rate:'2300',lineType:'service',applyRetention:true,applyIvu:true}],
 retention:true,retentionPct:10,retentionMode:'percent',retentionAmount:0,ivuPct:0,
});

test('New pending TBS invoice creates a nonpersisted 2070 A/R debit, withholding 230 debit and 2300 revenue credit',()=>{
 const p=invoiceAccrualPostings(tbs(),accts);
 assert.deepEqual(Object.fromEntries(p.map(x=>[x.gl,x.amount])),{'1100':2070,'1350':230,'4000':2300});
 assert.equal(invoicePostingDifference(p,accts),0);
 assert.ok(p.every(x=>x.source==='Invoice accrual'));
});
test('Payment classified to A/R is a credit to A/R, not a second debit',()=>{
 const t={date:'2026-10-21',amount:2070,gl:'1100',sourceGL:'1010'};
 assert.equal(bankCategoryNormalAmount(t,{code:'1100',type:'Asset'}),-2070);
 const entries=[...invoiceAccrualPostings(tbs(),accts),
  {date:t.date,gl:'1100',amount:-2070,source:'Transaction'},
  {date:t.date,gl:'1010',amount:2070,source:'Transaction'}];
 assert.equal(invoicePostingDifference(entries,accts),0);
 assert.equal(entries.filter(e=>e.gl==='1100').reduce((s,e)=>s+e.amount,0),0);
 assert.equal(entries.filter(e=>e.gl==='1350').reduce((s,e)=>s+e.amount,0),230);
});
test('Date-scoped A/R accrual is visible only on and after invoice issue date',()=>{
 const all=invoiceAccrualPostings(tbs(),accts);
 assert.equal(periodActivity(all,'1100','1900-01-01','2026-10-19'),0);
 assert.equal(periodActivity(all,'1100','1900-01-01','2026-10-20'),2070);
 assert.equal(periodActivity(all,'4000','2026-10-01','2026-10-31',{excludeInvoiceAccrual:true}),0);
});
test('The P&L can show invoice revenue separately, without duplicating source accrual',()=>{
 const all=[...invoiceAccrualPostings(tbs(),accts),{date:'2026-10-20',gl:'4000',amount:100,source:'Transaction'}];
 assert.equal(periodActivity(all,'4000','2026-10-01','2026-10-31',{excludeInvoiceAccrual:true}),100);
 assert.equal(periodActivity(all,'4000','2026-10-01','2026-10-31'),2400);
});
test('Taxable invoice accrues IVU to tax payable and records net A/R',()=>{
 const inv={...tbs(),retention:false,ivuPct:11.5};
 const amounts=Object.fromEntries(invoiceAccrualPostings(inv,accts).map(x=>[x.gl,x.amount]));
 assert.equal(amounts['1100'],2564.5);
 assert.equal(amounts['2030'],264.5);
 assert.equal(amounts['4000'],2300);
 assert.equal(invoicePostingDifference(invoiceAccrualPostings(inv,accts),accts),0);
});
test('Reimbursables transfer from outstanding reimbursement asset to A/R without P&L revenue',()=>{
 const inv={...tbs(),retention:false,lines:[{qty:2,rate:75,lineType:'reimbursable',applyRetention:false,applyIvu:false}]};
 const amounts=Object.fromEntries(invoiceAccrualPostings(inv,accts).map(x=>[x.gl,x.amount]));
 assert.equal(amounts['1100'],150);
 assert.equal(amounts['1150'],-150);
 assert.equal(amounts['4000'],undefined);
 assert.equal(invoicePostingDifference(invoiceAccrualPostings(inv,accts),accts),0);
});
test('Missing required GL blocks incorrect reports rather than hiding an invoice',()=>{
 const withoutAR=accts.filter(a=>a.code!=='1100');
 assert.throws(()=>invoiceAccrualPostings(tbs(),withoutAR),/missing accounts 1100/);
});
test('No duplicate postings are persisted from the pure projection',()=>{
 const inv=tbs();
 const original=JSON.stringify(inv);
 const first=invoiceAccrualPostings(inv,accts);
 const second=invoiceAccrualPostings(inv,accts);
 assert.deepEqual(first,second);
 assert.equal(JSON.stringify(inv),original);
});
test('Single-account source transaction is never double-counted as two A/R entries',()=>{
 const t={date:'2026-10-21',amount:2070,gl:'1100',sourceGL:'1100'};
 assert.equal(bankCategoryNormalAmount(t,{code:'1100',type:'Asset'}),2070);
});
test('A $25 service line with 10% withholding calculates net 22.50 exactly',()=>{
 const inv={...tbs(),lines:[{qty:1,rate:25,applyRetention:true,applyIvu:false}],ivuPct:0};
 assert.deepEqual(invoiceAccrualDetails(inv),{service:25,products:0,reimbursables:0,withholding:2.5,ivu:0,invoiceTotal:22.5});
});
