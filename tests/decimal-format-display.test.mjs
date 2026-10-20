import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatDecimal, formatDecimalInput, formatPercentage } from '../src/tbsNumberFormatting.js';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('all displayed decimals are rounded to exactly two places', () => {
  assert.equal(formatDecimal(1.239), '1.24');
  assert.equal(formatDecimal(7), '7.00');
  assert.equal(formatDecimal(0), '0.00');
  assert.equal(formatDecimal(-12.345), '-12.35');
  assert.equal(formatDecimal(12345.555), '12,345.56');
  assert.equal(formatDecimal(null), '0.00');
  assert.equal(formatDecimal('', '—'), '—');
});

test('percentage values have two decimals and one percent sign', () => {
  assert.equal(formatPercentage(10.5), '10.50%');
  assert.equal(formatPercentage(4), '4.00%');
  assert.equal(formatPercentage(0), '0.00%');
  assert.equal(formatPercentage(1.236), '1.24%');
  assert.equal(formatPercentage('bad'), '0.00%');
});

test('numeric inputs format idle display without altering source precision', () => {
  const raw = 12.345678;
  assert.equal(formatDecimalInput(raw), '12.35');
  assert.equal(raw, 12.345678);
  assert.equal(formatDecimalInput(0), '0.00');
  assert.equal(formatDecimalInput(''), '');
  assert.equal(formatDecimalInput(1000.5), '1000.50');
  assert.equal(formatDecimalInput(-2.567), '-2.57');
  assert.ok(app.includes('const rawValue = isControlled ? value : uncontrolledValue'));
  assert.ok(app.includes("value={editing ? (rawValue ?? '') : formatDecimalInput(rawValue)}"));
  assert.ok(app.includes('if (onBlur) onBlur(e)'));
});

test('decimal numeric fields throughout App use shared two-digit presentation', () => {
  const decimalInputs = app.match(/<DecimalInput\b[\s\S]*?\/>/g) || [];
  assert.ok(decimalInputs.length >= 50);
  assert.ok(decimalInputs.every(item => item.includes('step="0.01"')));
  assert.equal((app.match(/<input\b[\s\S]*?\/>/g) || []).filter(x => /\btype="number"/.test(x) && /\bstep="0\.01"/.test(x)).length, 0);
});

test('financial, hours, tax, service, invoice, chart formatting and integer counts stay correctly typed', () => {
  assert.match(app, /minimumFractionDigits: 2, maximumFractionDigits: 2/);
  assert.match(app, /const moneyPdf = n =>[\s\S]*?maximumFractionDigits: 2/);
  assert.match(app, /formatDecimal\(service\.hours\)/);
  assert.match(app, /formatDecimal\(l\.qty\)/);
  assert.match(app, /formatDecimal\(hrs\)/);
  assert.match(app, /formatDecimal\(lineTotalHours\(l\)\)/);
  assert.match(app, /formatPercentage\(s\.tipsRetentionPct\)/);
  assert.match(app, /formatPercentage\(c\.ivuPct\)/);
  assert.match(app, /formatPercentage\(e\.prTaxPct\)/);
  assert.match(app, /formatPercentage\(e\.sinotPct\)/);
  assert.match(app, /<YAxis fontSize=\{12\} tickFormatter=\{formatDecimal\}/);
  assert.ok(app.includes('{ label: \'Transactions in Review\', value: summary.review }'));
  assert.ok(app.includes('const [selectedClientId, setSelectedClientId] = useState(null)'));
});
