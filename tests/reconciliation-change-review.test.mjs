import { test } from 'node:test';
import assert from 'node:assert/strict';
import { impactedTransactionReconciliations, impactedJournalReconciliations, impactedAccountReconciliations, uniqueImpactedReconciliations, pendingReviewReconciliations, reconciliationImpactConfirmation } from '../src/tbsReconciliationReview.js';

const recs = [
  {id:'a1', gl:'1000', periodEnd:'2026-09-30', status:'PASS', verifiedIds:['tx1']},
  {id:'a2', gl:'1000', periodEnd:'2026-10-31', status:'PASS', verifiedIds:['tx2']},
  {id:'b1', gl:'2000', periodEnd:'2026-09-30', status:'PASS', verifiedIds:['tx3']},
  {id:'b2', gl:'2000', periodEnd:'2026-10-31', status:'REVIEW', verifiedIds:[]}
];
test('moving a bank transaction between accounts invalidates old and new approved periods', () => {
  const old = {id:'tx1',date:'2026-09-10',sourceGL:'1000',amount:-90};
  const changed = {...old,sourceGL:'2000'};
  assert.deepEqual(impactedTransactionReconciliations(old,changed,recs).map(r=>r.id),['a1','a2','b1']);
});
test('changing category/description alone does not affect bank reconciliation', () => {
  const old={id:'tx1',date:'2026-09-10',sourceGL:'1000',amount:-90,gl:'6050'};
  assert.equal(impactedTransactionReconciliations(old,{...old,gl:'6080',description:'new'},recs).length,0);
});
test('bank amount change, backdated insertion or deletion invalidate the right periods', () => {
  const old={date:'2026-09-01',sourceGL:'1000',amount:1};
  assert.deepEqual(impactedTransactionReconciliations(old,{...old,amount:5},recs).map(x=>x.id),['a1','a2']);
  assert.deepEqual(impactedTransactionReconciliations(null,{date:'2026-10-15',sourceGL:'1000',amount:5},recs).map(x=>x.id),['a2']);
  assert.deepEqual(impactedTransactionReconciliations(old,null,recs).map(x=>x.id),['a1','a2']);
});
test('journal entries alter only previously approved reconciled bank GLs, not memo-only changes', () => {
  const old={date:'2026-09-15',lines:[{gl:'1000',debit:'100',credit:''},{gl:'6000',debit:'',credit:'100'}]};
  assert.equal(impactedJournalReconciliations(old,{...old,memo:'new'},recs).length,0);
  const changed={...old,lines:[{gl:'1000',debit:'120',credit:''},{gl:'6000',debit:'',credit:'120'}]};
  assert.deepEqual(impactedJournalReconciliations(old,changed,recs).map(x=>x.id),['a1','a2']);
  assert.deepEqual(impactedJournalReconciliations(null,old,recs).map(x=>x.id),['a1','a2']);
});
test('changes to reconciled account type require review; renaming does not', () => {
  const old={code:'1000',name:'Old bank',type:'Asset'};
  assert.equal(impactedAccountReconciliations(old,{...old,name:'New bank'},recs).length,0);
  assert.deepEqual(impactedAccountReconciliations(old,{...old,type:'Liability'},recs).map(x=>x.id),['a1','a2']);
});
test('pending review never loses previous checkmarks or alters other reconciliation', () => {
  const affected=uniqueImpactedReconciliations([recs.slice(0,1),recs.slice(0,2)]);
  const next=pendingReviewReconciliations(recs,affected.map(x=>x.id));
  assert.deepEqual(next.map(x=>x.status),['REVIEW','REVIEW','PASS','REVIEW']);
  assert.deepEqual(next[0].verifiedIds,['tx1']);
  assert.match(reconciliationImpactConfirmation(affected),/PENDING REVIEW/);
});
