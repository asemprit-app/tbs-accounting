import test from 'node:test';
import assert from 'node:assert/strict';
import {incomeThroughDate} from '../src/tbsBalanceSheetIncome.js';
const accounts=[{code:'revenue',type:'Revenue'},{code:'expense',type:'Expense'},{code:'bank',type:'Asset'}];
test('balance sheet includes prior-period profits and excludes future activity',()=>{
 const p=[{date:'2026-01-01',gl:'revenue',amount:1000},{date:'2026-02-01',gl:'expense',amount:200},{date:'2026-03-01',gl:'revenue',amount:500},{date:'2026-02-01',gl:'bank',amount:2000}];
 assert.equal(incomeThroughDate(p,accounts,[],()=>0,'2026-02-28'),800);
 assert.equal(incomeThroughDate(p,accounts,[],()=>0,'2026-03-31'),1300);
});
test('invoice revenue follows cutoff and supplied revenue calculation',()=>{
 assert.equal(incomeThroughDate([],accounts,[{date:'2026-01-01',revenue:100},{date:'2026-03-01',revenue:500}],i=>i.revenue,'2026-02-28'),100);
});
test('closing entries offset ledger income rather than counting it again',()=>{
 const p=[{date:'2025-12-01',gl:'revenue',amount:100},{date:'2025-12-31',gl:'revenue',amount:-100},{date:'2026-01-01',gl:'revenue',amount:50}];
 assert.equal(incomeThroughDate(p,accounts,[],()=>0,'2026-01-31'),50);
});
