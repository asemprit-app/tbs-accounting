import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildPostings} from '../src/ledger.mjs';
const accounts = [{code:'bank',type:'Asset'},{code:'ar',type:'Asset'},{code:'expense',type:'Expense'},{code:'card',type:'Liability'},{code:'sales',type:'Revenue'},{code:'equity',type:'Equity'}];
for (const [name,gl,sourceGL,amount,category,source] of [
 ['receivable collection','ar','bank',100,-100,100],
 ['bank expense','expense','bank',-50,50,-50],
 ['card expense','expense','card',-50,50,50],
 ['card payment','card','bank',-50,-50,-50],
 ['cash sale','sales','bank',100,100,100],
 ['capital contribution','equity','bank',100,100,100],
]) test(name,()=>assert.deepEqual(buildPostings([{date:'2026-01-01',gl,sourceGL,amount}],[],accounts).map(p=>p.amount),[category,source]));
test('journal entries use debit/credit signs',()=>assert.deepEqual(buildPostings([],[{date:'2026-01-01',lines:[{gl:'ar',debit:100},{gl:'sales',credit:100}]}],accounts).map(p=>p.amount),[100,100]));
test('same account appears once and remains visible for reconciliation',()=>assert.equal(buildPostings([{gl:'bank',sourceGL:'bank',amount:100}],[],accounts).length,1));
import {invoicePaidThrough, invoiceOpenThrough} from '../src/ledger.mjs';
test('aging excludes future payments regardless of current invoice status',()=>{
 const inv={date:'2026-01-01',status:'Paid',paid:100,payments:[{date:'2026-01-15',amount:40},{date:'2026-02-01',amount:60}]};
 assert.equal(invoicePaidThrough(inv,'2026-01-31'),40);
 assert.equal(invoiceOpenThrough(inv,'2026-01-31',()=>100),60);
 assert.equal(invoiceOpenThrough(inv,'2026-02-28',()=>100),0);
 assert.equal(invoiceOpenThrough(inv,'2025-12-31',()=>100),0);
});
test('overpayments do not reduce other customers receivables',()=>assert.equal(invoiceOpenThrough({date:'2026-01-01',paid:120},'2026-01-31',()=>100),0));
