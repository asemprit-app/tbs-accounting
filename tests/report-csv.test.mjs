import test from 'node:test';
import assert from 'node:assert/strict';
import {csvCell, financialReportCsv, reportCsvFilename} from '../src/tbsReportCsv.js';
test('preserves numeric signs and two-decimal values without currency strings', () => {
  const csv = financialReportCsv(['Account','Amount'],[['Cash',1234.56],['Expense',-12.5],['Zero',0]]);
  assert.match(csv, /"Cash","1234.56"/);
  assert.match(csv, /"Expense","-12.5"/);
  assert.match(csv, /"Zero","0"/);
});
test('quotes commas, quotes, linebreaks and neutralizes spreadsheet formulas in text', () => {
  const csv = financialReportCsv(['Description'],[['Vendor, "Inc"'],['=HYPERLINK("https://example.com")'],['+SUM(1,2)'],['line\nbreak']]);
  assert.match(csv, /"Vendor, ""Inc"""/);
  assert.match(csv, /"'=HYPERLINK/);
  assert.match(csv, /"'+SUM/);
  assert.match(csv, /"line\nbreak"/);
  assert.equal(csvCell(-12.25), '"-12.25"');
});
test('UTF-8 BOM, stable widths and safe filename', () => {
  const csv=financialReportCsv(['Code','Value'],[['100',5],['200']]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /"200",""/);
  assert.equal(reportCsvFilename('Farmacia / Del Pozo','P&L Oct 2026'),'Farmacia_Del_Pozo_P_L_Oct_2026.csv');
});
