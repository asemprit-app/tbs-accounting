import test from 'node:test';
import assert from 'node:assert/strict';
import { accountRunningBalance } from '../src/tbsAccountRunningBalance.js';

test('period detail begins with prior-period balance, not zero', () => {
 const r = accountRunningBalance([
  {id:'two',date:'2026-08-03',amount:-25},
  {id:'one',date:'2026-08-01',amount:100},
 ],2831.54);
 assert.deepEqual(r.rows.map(x=>x.id),['one','two']);
 assert.deepEqual(r.rows.map(x=>x.runningBalance),[2931.54,2906.54]);
 assert.equal(r.openingBalance,2831.54);
 assert.equal(r.periodActivity,75);
 assert.equal(r.endingBalance,2906.54);
});
test('same-date entries maintain accounting posting order and calculate exact cents', () => {
 const r = accountRunningBalance([
  {id:'a',date:'2026-08-31',amount:0.1},
  {id:'b',date:'2026-08-31',amount:0.2},
  {id:'c',date:'2026-08-31',amount:-0.3},
 ],10.01);
 assert.deepEqual(r.rows.map(x=>x.id),['a','b','c']);
 assert.deepEqual(r.rows.map(x=>x.runningBalance),[10.11,10.31,10.01]);
 assert.equal(r.endingBalance,10.01);
});
test('as-of detail supports entire ledger with opening zero, negative normal balances', () => {
 const r = accountRunningBalance([{date:'2025-12-31',amount:400},{date:'2026-01-02',amount:-600}]);
 assert.equal(r.openingBalance,0);
 assert.equal(r.endingBalance,-200);
});
test('empty period retains prior balance', () => {
 const r=accountRunningBalance([],123.45);
 assert.equal(r.endingBalance,123.45);
 assert.equal(r.rows.length,0);
});
