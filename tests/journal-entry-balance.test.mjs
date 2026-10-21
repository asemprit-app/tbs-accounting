import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { journalEntryBalance } from '../src/tbsJournalBalance.js';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const start = app.indexOf('function JournalEntriesView(');
const end = app.indexOf('\nfunction ', start + 5);
const editor = app.slice(start, end);

test('an empty journal entry is not marked balanced', () => {
  assert.deepEqual(journalEntryBalance([{ debit:'', credit:'' }, { debit:'', credit:'' }]), {
    totalDebit: 0, totalCredit: 0, remaining: 0, missingSide: null, balanced: false,
  });
});

test('live journal balance shows the amount of Credit needed when debits exceed credits', () => {
  const value = journalEntryBalance([
    { debit:'1000.00', credit:'' }, { debit:'', credit:'350.25' },
  ]);
  assert.equal(value.totalDebit, 1000);
  assert.equal(value.totalCredit, 350.25);
  assert.equal(value.remaining, 649.75);
  assert.equal(value.missingSide, 'credit');
  assert.equal(value.balanced, false);
});

test('live journal balance shows the amount of Debit needed when credits exceed debits', () => {
  const value = journalEntryBalance([
    { debit:100.5, credit:'' }, { debit:'', credit:'450.00' },
    { debit:'0', credit:'50.25' },
  ]);
  assert.equal(value.totalDebit, 100.5);
  assert.equal(value.totalCredit, 500.25);
  assert.equal(value.remaining, 399.75);
  assert.equal(value.missingSide, 'debit');
});

test('the indicator immediately changes to balanced on equal debits and credits', () => {
  const value = journalEntryBalance([
    { debit:'750.13', credit:'' }, { debit:'', credit:'500.03' },
    { debit:'', credit:'250.10' },
  ]);
  assert.equal(value.remaining, 0);
  assert.equal(value.missingSide, null);
  assert.equal(value.balanced, true);
});

test('cents avoid floating-point artifacts and do not round internal journal entries', () => {
  const rows = [
    { debit: '0.10', credit: '' }, { debit: '0.20', credit: '' },
    { debit: '', credit: '0.30' },
  ];
  assert.equal(journalEntryBalance(rows).balanced, true);
  assert.equal(rows[0].debit, '0.10');
  assert.equal(journalEntryBalance([{debit:'10',credit:''}, {debit:'',credit:'9.99'}]).remaining, 0.01);
});

test('new, edit and copied journal entries share one live indicator and save validation', () => {
  assert.ok(start > -1 && end > start);
  assert.match(editor, /journalEntryBalance\(form\.lines\)/);
  assert.match(editor, /role="status" aria-live="polite"/);
  assert.match(editor, /Remaining to balance:/);
  assert.match(editor, /missingSide === 'credit'/);
  assert.match(editor, /missingSide === 'debit'/);
  assert.ok(editor.includes('The entry does not balance.'));
  assert.match(editor, /function editJE\(je\)/);
  assert.match(editor, /function copyJE\(je\)/);
  assert.match(editor, /function saveJE\(\)/);
  assert.match(editor, /if \(!balanced\)/);
  assert.match(editor, /Total debit: <strong>\{money\(totalDebit\)\}/);
  assert.match(editor, /Total credit: <strong>\{money\(totalCredit\)\}/);
});
