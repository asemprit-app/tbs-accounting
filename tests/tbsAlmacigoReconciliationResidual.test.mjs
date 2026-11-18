import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconciliationResidualGuidance} from '../src/tbsReconciliationResidualGuidance.js';
import {clearedReconciliationSnapshot} from '../src/tbsReconciliationCleared.js';
import {reconciliationBookPresentation} from '../src/tbsReconciliationBookPresentation.js';

test('Hacienda Almácigo 2026-05-13: fully marked 2020 still has a real $250.33 residual',()=>{
 const entries=[
   {id:'payment-1',amount:-1000},
   {id:'payment-2',amount:-1000},
   {id:'card-charges',amount:888.70},
 ];
 const snapshot=clearedReconciliationSnapshot({
  openingBalance:15558.99,postings:entries,verifiedIds:entries.map(e=>e.id),
  statementBalance:14698.02
 });
 assert.equal(snapshot.checkedCount,3);
 assert.equal(snapshot.outstandingCount,0);
 assert.equal(snapshot.clearedBalance,14447.69);
 assert.equal(snapshot.difference,250.33);
 assert.equal(snapshot.balanced,false);
 const diagnosis=reconciliationResidualGuidance({
  ...snapshot,statementBalance:14698.02,
  periodCount:entries.length,accountType:'Liability'
 });
 assert.equal(diagnosis.amount,250.33);
 assert.equal(diagnosis.expectedMovement,-860.97);
 assert.equal(diagnosis.actualMovement,-1111.30);
 assert.match(diagnosis.hint,/cargos omitidos/);
 const approval=reconciliationBookPresentation({
  status:'REVIEW',statementBalance:14698.02,ledgerBalance:14447.69,difference:250.33
 },snapshot);
 assert.equal(approval.approved,false,'a mismatch cannot be silently approved');
});
test('do not show a misleading missing-transaction diagnosis while entries are unchecked',()=>{
 assert.equal(reconciliationResidualGuidance({
  openingBalance:100,clearedBalance:80,statementBalance:105,
  checkedCount:2,outstandingCount:1,periodCount:3
 }),null);
});
test('no warning for balanced statements including a genuine $0 statement',()=>{
 const sample={openingBalance:100,clearedBalance:0,statementBalance:0,
  checkedCount:2,outstandingCount:0,periodCount:2,accountType:'Liability'};
 assert.equal(reconciliationResidualGuidance(sample),null);
});
test('opposite mismatch suggests checking payments instead of missing charges',()=>{
 const finding=reconciliationResidualGuidance({
  openingBalance:1000,clearedBalance:1200,statementBalance:1100,
  checkedCount:2,outstandingCount:0,periodCount:2,accountType:'Liability'
 });
 assert.equal(finding.amount,100);
 assert.match(finding.hint,/pagos omitidos/);
});
test('bank account residual suggests deposits or withdrawals according to its sign',()=>{
 const d=reconciliationResidualGuidance({
  openingBalance:10,clearedBalance:8,statementBalance:10,
  checkedCount:1,outstandingCount:0,periodCount:1,accountType:'Asset'
 });
 assert.match(d.hint,/depósitos omitidos/);
});
test('Reconciliation screen explains all-marked variance and permits zero statement amounts',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const start=app.indexOf('function ReconciliationView(');
 assert.ok(start>=0);
 const view=app.slice(start);
 assert.match(view,/reconciliationResidualGuidance\(\{/);
 assert.match(view,/Todos los movimientos disponibles están marcados/);
 assert.match(view,/reviewState\.previous && <span>Opening balance:/);
 assert.match(view,/form\.statementBalance === ''/);
 assert.match(view,/No agregue un ajuste solo para forzar el balance/);
 assert.match(view,/Save pending review/);
});
