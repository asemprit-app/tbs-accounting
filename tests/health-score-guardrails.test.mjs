import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const score=readFileSync(new URL('../src/TBSClientHealthScore.jsx',import.meta.url),'utf8');
const close=readFileSync(new URL('../src/TBSControlCenter.jsx',import.meta.url),'utf8');
test('Health Score requires complete checklist before a score',()=>{
 assert.match(score,/const sufficient=!!close&&required\.every/);
 assert.match(score,/const score=sufficient\?/);
});
test('Checklist uses the Supabase DONE status',()=>{
 assert.match(close,/status:done\?'DONE':'PENDING'/);
 assert.match(score,/status==='DONE'/);
});
test('Accounting diagnostics are not used to calculate pilot score',()=>{
 assert.ok(score.indexOf('const score=')<score.indexOf('const [allTx,uncatTx,recs,recTotal]'));
 assert.match(score,/informational only/);
});
test('Close cannot be marked ready with incomplete tasks',()=>{
 assert.match(close,/tasks\.some\(t=>t\.status!=='DONE'\)/);
});
