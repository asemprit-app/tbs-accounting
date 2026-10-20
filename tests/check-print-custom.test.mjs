import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const modalStart = app.indexOf('function CheckPrintModal(');
const modalEnd = app.indexOf('\nfunction ', modalStart + 1);
const modal = app.slice(modalStart, modalEnd);

test('Custom template is selectable for both Payroll and Services check printing', () => {
  assert.match(modal, /custom:\s*\{\s*label: 'Custom — Name, Amount & Memo Only'/);
  assert.equal((app.match(/<CheckPrintModal/g) || []).length, 2);
  assert.match(app, /amount=\{lineNet\(line\)\}/);
  assert.match(app, /amount=\{serviceCalc\(s\)\.netPay\}/);
});

test('Custom mode prints exactly payee, numeric amount, and memo with separate underlines', () => {
  const start = modal.indexOf('{isCustomPrint ? (');
  const end = modal.indexOf(') : (', start);
  assert.ok(start > 0 && end > start);
  const custom = modal.slice(start, end);
  for (const id of ['custom-check-payee','custom-check-amount','custom-check-memo']) {
    assert.match(custom, new RegExp('id="' + id + '"'));
  }
  assert.equal((custom.match(/borderBottom: '1px solid #111'/g) || []).length, 3);
  assert.match(custom, /\{payee\}/);
  assert.match(custom, /\{money\(safeAmount\)\}/);
  assert.match(custom, /\{customMemo\}/);
  for (const excluded of ['businessName','checkDate','checkNumber','routingNumber','bankAccountNumber','amountToWords','micrPreview','AUTHORIZED SIGNATURE']) {
    assert.ok(!custom.includes(excluded), excluded + ' must not be printed by Custom');
  }
});

test('Custom prints without MICR validation and keeps original templates unaffected', () => {
  assert.match(modal, /if \(!isCustomPrint && !validateMicrBeforePrint\(\)\) return;/);
  assert.match(modal, /!isCustomPrint && !usePreprintedCheck && <div/);
  assert.match(modal, /\{isCustomPrint \? \(/);
  assert.match(modal, /shouldPrintMicrLine\(\{ usePreprintedCheck \}\)/);
  assert.match(modal, /amountToWords\(safeAmount\)/);
  assert.match(modal, /setCustomMemo\(e\.target\.value\)/);
});
