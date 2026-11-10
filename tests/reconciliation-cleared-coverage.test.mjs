import test from 'node:test';
import assert from 'node:assert/strict';
import {clearedReconciliationSnapshot} from '../src/tbsReconciliationCleared.js';
test('CEnergyS July 2026 card can be reconciled despite four outstanding items totaling 709.78',()=>{
 const opening=3951.52, statement=2990.45;
 const postings=[
  {id:'a',amount:-961.07},
  {id:'u1',amount:50.51},
  {id:'u2',amount:75},
  {id:'u3',amount:143.84},
  {id:'u4',amount:440.43},
 ];
 const res=clearedReconciliationSnapshot({openingBalance:opening,statementBalance:statement,postings,verifiedIds:['a']});
 assert.equal(res.clearedBalance,2990.45);
 assert.equal(res.difference,0);
 assert.equal(res.balanced,true);
 assert.equal(res.outstandingCount,4);
 assert.equal(res.outstandingAmount,709.78);
 assert.equal(res.fullLedgerBalance,3700.23);
});
test('approval is not inferred when selected entries do not balance',()=>{
 const result=clearedReconciliationSnapshot({openingBalance:100,statementBalance:50,postings:[{id:'t',amount:-50}],verifiedIds:[]});
 assert.equal(result.balanced,false);
 assert.equal(result.difference,-50);
 assert.equal(result.outstandingCount,1);
});
test('carry forward prior outstanding items when they clear in a later statement',()=>{
 const result=clearedReconciliationSnapshot({openingBalance:100,statementBalance:80,postings:[{id:'prior-pending',amount:-25},{id:'new',amount:5}],verifiedIds:['prior-pending','new']});
 assert.equal(result.clearedBalance,80);
 assert.equal(result.balanced,true);
});
