import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clearedReconciliationSnapshot} from '../src/tbsReconciliationCleared.js';
import {reconciliationBookPresentation,reconciliationOutstandingExplanation} from '../src/tbsReconciliationBookPresentation.js';

const approved2020={
 id:'nsm-2020-oct-2026',gl:'2020',periodEnd:'2026-10-15',status:'PASS',
 statementBalance:4293.17,ledgerBalance:4293.17,difference:0,
};
const snapshot=clearedReconciliationSnapshot({
 openingBalance:1627.87,
 postings:[
  {id:'nsm-current-1',amount:2665.30},
  {id:'nsm-unverified-1',amount:59},
  {id:'nsm-unverified-2',amount:4.25},
 ],
 verifiedIds:['nsm-current-1'],
 statementBalance:4293.17,
});
test('NSM 2020: approved Book 4293.17 is not an error despite two historical unverified items',()=>{
 assert.equal(snapshot.clearedBalance,4293.17);
 assert.equal(snapshot.difference,0);
 assert.equal(snapshot.outstandingCount,2);
 assert.equal(snapshot.outstandingAmount,63.25);
 const view=reconciliationBookPresentation(approved2020,snapshot);
 assert.equal(view.approved,true);
 assert.equal(view.needsReview,false);
 assert.equal(view.statusLabel,'APPROVED');
 assert.equal(view.currentDifference,0);
 assert.equal(view.outstandingInfo,true);
 assert.equal(view.outstandingWarning,false);
 assert.match(reconciliationOutstandingExplanation(view,snapshot.outstandingAmount),/do not change the approved Book Balance/);
});

test('Changed verified balance on approved reconciliation still triggers a real review',()=>{
 const recalculated={...snapshot,clearedBalance:4292.17,difference:1};
 const view=reconciliationBookPresentation(approved2020,recalculated);
 assert.equal(view.approved,false);
 assert.equal(view.needsReview,true);
 assert.equal(view.outstandingWarning,true);
 assert.match(view.statusLabel,/review required/);
 assert.equal(view.currentDifference,1);
});

test('Inconsistent saved approval is not silently treated as approved',()=>{
 const bad={...approved2020,ledgerBalance:4292.17,difference:1};
 const view=reconciliationBookPresentation(bad,snapshot);
 assert.equal(view.approved,false);
 assert.equal(view.needsReview,true);
});

test('Pending reconciliation with 0 difference still requires saving review',()=>{
 const pending={...approved2020,status:'REVIEW'};
 const view=reconciliationBookPresentation(pending,snapshot);
 assert.equal(view.approved,false);
 assert.equal(view.statusLabel,'BALANCED — save review');
 assert.equal(view.needsReview,true);
 assert.equal(view.outstandingWarning,true);
});

test('Book Balance UI does not show red uncleared message for approved snapshots',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const start=app.indexOf('function ReconciliationView(');
 assert.ok(start>-1);
 const view=app.slice(start);
 assert.match(view,/reconciliationBookPresentation\(r, state\)/);
 assert.match(view,/presentation\.outstandingWarning &&/);
 assert.match(view,/presentation\.outstandingInfo &&/);
 assert.match(view,/presentation\.statusLabel/);
 assert.match(view,/reconciliationOutstandingExplanation/);
});
