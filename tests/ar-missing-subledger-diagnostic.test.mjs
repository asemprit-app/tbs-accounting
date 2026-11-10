import test from 'node:test';
import assert from 'node:assert/strict';
import {receivableLedgerBridge} from '../src/tbsAccountingDiagnostics.js';

test('CEnergyS: A/R in manual JEs with no invoices cannot be compared to a fictitious $0 invoice ledger',()=>{
 const result=receivableLedgerBridge({
   invoices:[], invoiceTotal:()=>0, arCode:'1100', asOf:'2026-10-31',
   postings:[{gl:'1100',date:'2025-12-31',amount:25999},{gl:'1100',date:'2026-08-31',amount:-1486.50}],
   transactions:[]
 });
 assert.equal(result,null);
});
test('invoices created after cutoff do not form an earlier-period subledger',()=>{
 assert.equal(receivableLedgerBridge({
  invoices:[{date:'2026-11-01',total:500,payments:[]}],
  invoiceTotal:i=>i.total,postings:[{gl:'1100',date:'2026-08-31',amount:200}],
  arCode:'1100',asOf:'2026-08-31'
 }),null);
});
test('when invoices exist, a real $50 subledger variance remains flagged',()=>{
 const result=receivableLedgerBridge({
  invoices:[{date:'2026-08-01',paid:0,payments:[],total:100}],
  invoiceTotal:i=>i.total,postings:[{gl:'1100',date:'2026-08-01',amount:150}],
  arCode:'1100',asOf:'2026-08-31',transactions:[]
 });
 assert.equal(result.subledger,100);
 assert.equal(result.generalLedger,150);
 assert.equal(result.variance,50);
});
