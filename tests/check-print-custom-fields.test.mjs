import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const start=app.indexOf('function CheckPrintModal(');
const end=app.indexOf('\nfunction ',start+1);
const modal=app.slice(start,end);
const customStart=modal.indexOf('<div id="custom-preprinted-fields"');
const customEnd=modal.indexOf('</div>\n            ) : (',customStart);
const overlay=modal.slice(customStart,customEnd);

test('Custom is selectable without removing the older full-check calibration template',()=>{
 assert.match(modal,/custom:\s*\{\s*label: 'Custom — Preprinted/);
 assert.match(modal,/custom_full:\s*\{\s*label: 'Custom \/ Calibrate \(Full Check\)'/);
 assert.match(modal,/const customFieldsOnly = templateId === 'custom'/);
});

test('Only beneficiary, numeric amount, and memo are overlaid on preprinted checks',()=>{
 assert.ok(customStart>=0&&customEnd>customStart,'isolated Custom JSX branch');
 const fields=[...overlay.matchAll(/data-check-field="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(fields,['payee','amount','memo']);
 assert.match(overlay,/\{payee\}/);
 assert.match(overlay,/\{money\(safeAmount\)\}/);
 assert.doesNotMatch(overlay,/amountToWords/);
 assert.match(overlay,/\{memo\}/);
 assert.equal((overlay.match(/borderBottom: '1px solid #111'/g)||[]).length,3);
 for(const forbidden of ['businessName','checkDate','checkNumber','routingNumber','bankAccountNumber','micrPreview','signature','PAY TO THE','DOLLARS','MEMO','checkNumber']){
  assert.equal(overlay.includes(forbidden),false,'Custom must not print '+forbidden);
 }
});

test('Custom never requires MICR or check number and leaves other templates unchanged',()=>{
 assert.match(modal,/const preprintedForPrint = customFieldsOnly \|\| usePreprintedCheck/);
 assert.match(modal,/validateCheckPrintFields\(\{ usePreprintedCheck: preprintedForPrint, routingNumber, bankAccountNumber, checkNumber \}\)/);
 assert.match(modal,/\{!preprintedForPrint && <div/);
 assert.match(modal,/\{customFieldsOnly \? \(/);
 assert.match(modal,/shouldPrintMicrLine\(\{ usePreprintedCheck \}\)/);
});

test('Custom prints on clean paper without outer border and supports positional calibration',()=>{
 assert.match(modal,/id="check-document"/);
 assert.match(modal,/border: 'none'/);
 assert.match(modal,/#check-document \{\s*border: none !important/);
 assert.match(modal,/left: calc\(0\.25in \+ \$\{Number\(offsetX\)/);
 assert.match(modal,/top: calc\(\$\{template\.pageTop\}in \+ \$\{Number\(offsetY\)/);
 assert.match(modal,/pageTop: 0\.04/);
});

test('Payroll and Services share CheckPrintModal and pass calculated net values unchanged',()=>{
 assert.match(app,/<CheckPrintModal[\s\S]*?amount=\{serviceCalc\(s\)\.netPay\}/);
 assert.match(app,/<CheckPrintModal[\s\S]*?amount=\{lineNet\(line\)\}/);
 assert.equal((app.match(/<CheckPrintModal/g)||[]).length,2);
});
