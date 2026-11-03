import test from 'node:test';
import assert from 'node:assert/strict';
import {reportMonthOptions} from '../src/tbsReportMonthOptions.js';
const now=new Date(2026,10,2);
test('report selector includes a period with Journal Entries only',()=>{
 const options=reportMonthOptions({journalEntries:[{date:'2026-02-18'}]},now);
 assert.equal(options.find(x=>x.value==='2026-02')?.last,'2026-02-28');
 assert.ok(options.some(x=>x.value==='2026-11'));
 assert.ok(options.some(x=>x.value==='2026-07'));
});
test('preserves prior transactions and invoices, including leap-year dates',()=>{
 const options=reportMonthOptions({transactions:[{date:'2024-02-29'}],invoices:[{date:'2025-06-01'}]},now);
 assert.equal(options.find(x=>x.value==='2024-02')?.last,'2024-02-29');
 assert.ok(options.some(x=>x.value==='2025-06'));
});
test('invalid dates do not introduce invalid choices',()=>{
 const options=reportMonthOptions({journalEntries:[{date:null},{date:'n/a'},{date:'2026-19-01'}]},now);
 assert.deepEqual(options.map(x=>x.value),['2026-11']);
});
