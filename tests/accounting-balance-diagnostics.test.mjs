import test from 'node:test';
import assert from 'node:assert/strict';
import {bankReconciliationDrift,receivableLedgerBridge} from '../src/tbsAccountingDiagnostics.js';
test('approved bank reconciliation is flagged if current ledger changed',()=>{
 const r=bankReconciliationDrift([{gl:'1010',status:'PASS',periodEnd:'2026-08-31',statementBalance:2831.54}],
 [{gl:'1010',date:'2026-08-31',amount:112940.46}],
 [{code:'1010',name:'BPPR Commercial',type:'Asset'}],'2026-08-31');
 assert.equal(r.length,1);assert.equal(r[0].variance,110108.92);
});
test('different statement cutoff does not flag an unrelated period',()=>{
 assert.deepEqual(bankReconciliationDrift([{gl:'1010',status:'PASS',periodEnd:'2026-07-31',statementBalance:50}],
 [{gl:'1010',date:'2026-08-31',amount:100}],[{code:'1010',type:'Asset'}],'2026-08-31'),[]);
});
test('receivables compares invoice balances to GL and flags unlinked deposits',()=>{
 const invoices=[{date:'2026-08-01',paid:0,payments:[],total:100},{date:'2026-08-15',paid:20,payments:[{date:'2026-08-20',amount:20,transactionId:'linked'}],total:50}];
 const p=[{gl:'1100',date:'2026-08-01',amount:150},{gl:'1100',date:'2026-08-20',amount:-20},{gl:'1100',date:'2026-08-25',amount:-90}];
 const v=receivableLedgerBridge({invoices,invoiceTotal:i=>i.total,postings:p,transactions:[{id:'linked',date:'2026-08-20',sourceGL:'1010',gl:'1100',amount:20},{id:'orphan',date:'2026-08-25',sourceGL:'1010',gl:'1100',amount:90}],arCode:'1100',asOf:'2026-08-31'});
 assert.equal(v.subledger,130);assert.equal(v.generalLedger,40);assert.equal(v.variance,-90);assert.equal(v.unmatchedCount,1);
});
