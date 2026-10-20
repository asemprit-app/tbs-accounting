import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  shouldPrintCheckNumber, shouldPrintMicrLine, validateCheckPrintFields,
} from '../src/tbsCheckPrintOptions.js';

test('Preprinted checks hide check number and bank MICR line even when a reference number was typed', () => {
  const settings = { usePreprintedCheck: true, checkNumber: '005814', routingNumber: '', bankAccountNumber: '' };
  assert.equal(shouldPrintCheckNumber(settings), false);
  assert.equal(shouldPrintMicrLine(settings), false);
  assert.equal(validateCheckPrintFields(settings), '');
});
test('Preprinted checks can be printed without check, routing or account numbers', () => {
  assert.equal(validateCheckPrintFields({ usePreprintedCheck: true }), '');
  assert.equal(shouldPrintCheckNumber({ usePreprintedCheck: true }), false);
});
test('Blank check printing retains its existing MICR validation', () => {
  assert.equal(shouldPrintMicrLine({ usePreprintedCheck: false }), true);
  assert.match(validateCheckPrintFields({ usePreprintedCheck: false }), /Routing Number/);
  assert.match(validateCheckPrintFields({ usePreprintedCheck: false, routingNumber: '123456789' }), /Account Number/);
  assert.match(validateCheckPrintFields({ usePreprintedCheck: false, routingNumber: '123456789', bankAccountNumber: '001234567' }), /Check Number/);
  const config = {usePreprintedCheck: false,routingNumber: '123456789',bankAccountNumber: '001234567',checkNumber: '0042'};
  assert.equal(validateCheckPrintFields(config),'');
  assert.equal(shouldPrintCheckNumber(config),true);
});
test('Check header stays absent when the check number field is blank',()=>{
  assert.equal(shouldPrintCheckNumber({usePreprintedCheck:false,checkNumber:''}),false);
});
test('Print mode only affects presentation, not input monetary amounts',()=>{
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url),'utf8');
  assert.match(app,/<input type="checkbox" checked=\{usePreprintedCheck\}/);
  assert.match(app,/shouldPrintCheckNumber\(\{ usePreprintedCheck, checkNumber \}\)/);
  assert.match(app,/shouldPrintMicrLine\(\{ usePreprintedCheck \}\)/);
  assert.match(app,/validateCheckPrintFields\(\{ usePreprintedCheck: preprintedForPrint, routingNumber, bankAccountNumber, checkNumber \}\)/);
  assert.match(app,/<CheckPrintModal[\s\S]*?amount=\{lineNet\(line\)\}/);
  assert.match(app,/<CheckPrintModal[\s\S]*?amount=\{serviceCalc\(s\).netPay\}/);
});

test('Check stock has no outer printed frame to interfere with preprinted numbers', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const start = app.indexOf('function CheckPrintModal(');
  const end = app.indexOf('\nfunction ', start + 1);
  assert.ok(start >= 0 && end > start);
  const modal = app.slice(start, end);
  const checkBlock = modal.slice(modal.indexOf('id="check-document"'), modal.indexOf('id="check-document"') + 400);
  assert.match(checkBlock, /border: 'none'/);
  assert.doesNotMatch(checkBlock, /border: '1px solid #9CA3AF'/);
  assert.match(modal, /#check-document \{\s*border: none !important;\s*outline: none !important;/);
  // Payee, amount and monetary formatting must remain intact.
  assert.match(modal, /\{money\(safeAmount\)\}/);
  assert.match(modal, /\{payee\}/);
});
