import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
test('reconciliation review displays cleared balance and outstanding items separately',()=>{
 const start=app.indexOf('function ReconciliationView('),end=app.indexOf('\nfunction ',start+5);
 const view=app.slice(start,end);
 assert.match(view,/reconciliationReviewState\(r\)/);
 assert.match(view,/reconciliationBookPresentation\(r, state\)/);
 assert.match(view,/presentation\.statusLabel/);
 assert.match(view,/presentation\.outstandingInfo &&/);
 assert.match(view,/presentation\.outstandingWarning &&/);
 assert.match(view,/reconciliationOutstandingExplanation/);
 assert.match(view,/money\(presentation\.currentDifference\)/);
 assert.match(view,/presentation\.needsReview &&/);
 assert.match(view,/Review transactions/);
});
test('financial statements surface bank and AR variance in exported and on-screen reports',()=>{
 const start=app.indexOf('function ReportsView('),end=app.indexOf('\nfunction ',start+5);
 const view=app.slice(start,end);
 assert.match(view,/bankReconciliationDrift\(reconciliations, postings, accounts, to\)/);
 assert.match(view,/receivableLedgerBridge\(/);
 assert.match(view,/ACCOUNTING VALIDATION REQUIRED/);
 assert.match(view,/Unresolved|UNRESOLVED/);
 assert.match(view,/Invoices outstanding/);
});
