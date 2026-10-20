import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const start=source.indexOf('function CheckPrintModal(');
const end=source.indexOf('\nfunction ',start+1);
const modal=source.slice(start,end);

test('Custom preprinted format exists in the common Payroll and Services printer',()=>{
 assert.match(modal,/custom_preprinted:\s*\{/);
 assert.match(modal,/Custom — Preprinted check/);
 assert.match(source,/<CheckPrintModal[\s\S]*?amount=\{lineNet\(line\)\}/);
 assert.match(source,/<CheckPrintModal[\s\S]*?amount=\{serviceCalc\(s\).netPay\}/);
});
test('Custom template contains only payee, numeric amount, amount in words and memo',()=>{
 const segment=modal.slice(modal.indexOf('data-testid="custom-check-print-fields"'),modal.indexOf(') : <>',modal.indexOf('data-testid="custom-check-print-fields"')));
 for(const field of ['{payee}','{money(safeAmount)}','{amountToWords(safeAmount)}','{memo}'])assert.ok(segment.includes(field),field);
 assert.doesNotMatch(segment,/\{businessName\}|\{checkNumber\}|\{checkDate\}|\{micrPreview\(\)\}|AUTHORIZED SIGNATURE|Payroll \/ Services Check/);
});
test('Printing Custom never requires MICR data or check numbers',()=>{
 assert.match(modal,/usePreprintedCheck: usePreprintedCheck \|\| customPreprinted/);
 assert.match(modal,/!usePreprintedCheck && !customPreprinted/);
 assert.match(modal,/\{customPreprinted \? \(/);
});
test('Custom check has only underlines, never an outer border',()=>{
 const segment=modal.slice(modal.indexOf('data-testid="custom-check-print-fields"'),modal.indexOf(') : <>',modal.indexOf('data-testid="custom-check-print-fields"')));
 assert.ok((segment.match(/borderBottom: '1px solid #111'/g)||[]).length>=4);
 assert.doesNotMatch(segment,/border: '1px solid/);
 assert.match(modal,/border: 'none'/);
});
