import test from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOM_CHECK_FIELDS, defaultCustomCheckPositions } from '../src/tbsCustomCheckLayout.js';
import { payrollCheckVoucher, serviceCheckVoucher, customCheckStubSlots } from '../src/tbsCheckVoucher.js';
import { emptyCustomCheckSettings, normalizeCustomCheckSettings, saveNamedCustomCheckProfile, normalizeCustomCheckProfileLibrary } from '../src/tbsCustomCheckProfiles.js';

test('New amount-in-words field is separate and positioned beneath payee', () => {
  const fields = defaultCustomCheckPositions();
  assert.ok(fields.words.y > fields.payee.y);
  assert.ok(fields.words.y < fields.memo.y);
  assert.equal(CUSTOM_CHECK_FIELDS.words.label, 'Amount in words (English)');
  assert.equal(CUSTOM_CHECK_FIELDS.memo.width, 3.00);
});

test('Two-part stock has one advice stub; three-part stock has two after top check', () => {
  const two = customCheckStubSlots(2), three = customCheckStubSlots(3);
  assert.equal(two.length, 1);
  assert.equal(three.length, 2);
  assert.ok(two[0].top >= 3.5);
  assert.ok(three[0].top >= 3.5);
  assert.ok(three[1].top > three[0].top + three[0].height);
  for (const slots of [two,three]) {
    assert.ok(slots.every(v => v.top + v.height < 11));
  }
});

test('Saved client template remembers paper parts without destroying older profiles', () => {
  assert.equal(emptyCustomCheckSettings().sheetParts, 3);
  assert.equal(normalizeCustomCheckSettings({ sheetParts: 2 }).sheetParts, 2);
  assert.equal(normalizeCustomCheckSettings({ sheetParts: 9 }).sheetParts, 3);
  assert.equal(normalizeCustomCheckSettings(null).sheetParts, 3);
  const saved = saveNamedCustomCheckProfile({presets: [], selectedName: ''},'Three-part', { sheetParts:3, positions:defaultCustomCheckPositions() }).library;
  const saved2 = saveNamedCustomCheckProfile(saved,'Two-part',{ sheetParts:2, positions:defaultCustomCheckPositions() }).library;
  const reloaded = normalizeCustomCheckProfileLibrary(JSON.parse(JSON.stringify(saved2)));
  assert.equal(reloaded.presets[0].sheetParts, 3);
  assert.equal(reloaded.presets[1].sheetParts, 2);
  const older = normalizeCustomCheckProfileLibrary({ presets: [{ name:'Old format', positions:defaultCustomCheckPositions() }], selectedName:'Old format' });
  assert.equal(older.presets[0].sheetParts,3);
  assert.deepEqual(older.presets[0].positions.words,defaultCustomCheckPositions().words);
});

test('Payroll payment advice contains only actual gross deductions and reimbursement', () => {
  const line = { gross:1000, prIncomeTax:50, socialSecurity:62, medicare:14.50, sinot:0, otherDeductions:0, federalIncomeTax:0, reimbursement:25 };
  const voucher = payrollCheckVoucher(line,{periodStart:'2026-10-01',periodEnd:'2026-10-15'},80);
  assert.equal(voucher.kind,'Payroll');
  assert.equal(voucher.period,'2026-10-01 to 2026-10-15');
  assert.equal(voucher.info,'Hours: 80.00');
  assert.deepEqual(voucher.rows.map(r=>r.label),['Gross Pay','Puerto Rico Income Tax','Social Security','Medicare','Reimbursement']);
  assert.deepEqual(voucher.rows.map(r=>r.amount),[1000,-50,-62,-14.5,25]);
});

test('Service advice follows recorded gross retention IVU and reimbursement, not fictional data', () => {
  const voucher=serviceCheckVoucher({date:'2026-10-20',invoiceNumber:'INV-5',retentionAmount:90, reimbursement:10, hours:0},{gross:900,ivuAmount:15});
  assert.equal(voucher.kind,'Services');
  assert.equal(voucher.reference,'Invoice: INV-5');
  assert.deepEqual(voucher.rows.map(r=>r.amount),[900,-90,15,10]);
  assert.equal(voucher.info,'');
});
