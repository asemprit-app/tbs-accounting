import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CUSTOM_CHECK_FIELDS, defaultCustomCheckPositions, updateCustomCheckPosition,
  normalizeCustomCheckPositions, formatCustomCheckDate,
} from '../src/tbsCustomCheckLayout.js';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const modalStart = app.indexOf('function CheckPrintModal(');
const modalEnd = app.indexOf('\nfunction ', modalStart + 1);
const modal = app.slice(modalStart, modalEnd);

test('Custom check template is shared by Payroll and Services and uses client-scoped calibration', () => {
  assert.match(modal, /label: 'Custom — Name, Amount, Memo & Date'/);
  assert.equal((app.match(/<CheckPrintModal/g) || []).length, 2);
  assert.equal((app.match(/<CheckPrintModal\s+clientId=\{clientId\}/g) || []).length, 2);
  assert.match(app, /amount=\{lineNet\(line\)\}/);
  assert.match(app, /amount=\{serviceCalc\(s\)\.netPay\}/);
  assert.match(modal, /customProfilesStorageKey/);
});

test('Custom renders exactly four separate printable values and underlines', () => {
  const start = modal.indexOf('{isCustomPrint ? (');
  const end = modal.indexOf(') : (', start);
  assert.ok(start > 0 && end > start);
  const custom = modal.slice(start, end);
  for (const field of ['date','payee','amount','memo']) {
    assert.match(custom, new RegExp('id="custom-check-' + field + '"'));
    assert.match(custom, new RegExp('customPositions\\.' + field + '\\.x'));
    assert.match(custom, new RegExp('customPositions\\.' + field + '\\.y'));
  }
  assert.equal((custom.match(/borderBottom: '1px solid #111'/g) || []).length, 4);
  assert.match(custom, /formatCustomCheckDate\(checkDate\)/);
  assert.match(custom, /\{payee\}/);
  assert.match(custom, /\{money\(safeAmount\)\}/);
  assert.match(custom, /\{customMemo\}/);
  for (const excluded of ['businessName','checkNumber','routingNumber','bankAccountNumber','amountToWords','micrPreview','AUTHORIZED SIGNATURE']) {
    assert.ok(!custom.includes(excluded), excluded + ' must not be printed by Custom');
  }
});

test('Custom controls permit moving each field and its line independently in inches', () => {
  assert.deepEqual(Object.keys(CUSTOM_CHECK_FIELDS).sort(), ['amount','date','memo','payee']);
  const original = defaultCustomCheckPositions();
  const moved = updateCustomCheckPosition(original, 'date', 'x', 5.25);
  const movedTwice = updateCustomCheckPosition(moved, 'date', 'y', 0.42);
  assert.equal(movedTwice.date.x, 5.25);
  assert.equal(movedTwice.date.y, 0.42);
  for (const field of ['payee','amount','memo']) assert.deepEqual(movedTwice[field], original[field]);
  assert.deepEqual(original, defaultCustomCheckPositions());
  assert.match(modal, /changeCustomPosition\(field, axis, e\.target\.value\)/);
  assert.match(modal, /Save as new/);
  assert.match(modal, /Update selected/);
  assert.match(modal, /Delete selected/);
});

test('Custom positions validate corrupted saved layouts and stay on check stock', () => {
  assert.deepEqual(normalizeCustomCheckPositions(null), defaultCustomCheckPositions());
  assert.deepEqual(normalizeCustomCheckPositions({ date: { x: NaN, y: 'abc' } }), defaultCustomCheckPositions());
  const adjusted = normalizeCustomCheckPositions({ memo: { x: 99, y: -10 }, date: { x: 5.15, y: 0.35 } });
  assert.equal(adjusted.memo.x, Number((8-CUSTOM_CHECK_FIELDS.memo.width).toFixed(2)));
  assert.equal(adjusted.memo.y, 0);
  assert.equal(adjusted.date.x, 5.15);
  assert.equal(adjusted.date.y, 0.35);
  assert.equal(formatCustomCheckDate('2026-10-20'), '10/20/2026');
});

test('Custom skips MICR validation and preserves other check templates', () => {
  assert.match(modal, /if \(!isCustomPrint && !validateMicrBeforePrint\(\)\) return;/);
  assert.match(modal, /!isCustomPrint && !usePreprintedCheck && <div/);
  assert.match(modal, /shouldPrintMicrLine\(\{ usePreprintedCheck \}\)/);
  assert.match(modal, /amountToWords\(safeAmount\)/);
  assert.match(modal, /setCustomMemo\(e\.target\.value\)/);
  assert.match(modal, /type="date" value=\{checkDate\}/);
  assert.match(modal, /window\.localStorage\.setItem\(customProfilesStorageKey/);
});
