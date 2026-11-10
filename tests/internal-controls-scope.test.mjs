import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const center=readFileSync(new URL('../src/TBSControlCenter.jsx',import.meta.url),'utf8');
test('internal controls require staff guard',()=>{
 assert.match(app,/isStaff && tab === 'monthly-close'/);
 assert.match(app,/isStaff && tab === 'tbs-review'/);
 assert.match(app,/\.\.\.\(isStaff \? \[/);
});
test('Client Requests are included by explicit owner approval; Health Score stays out',()=>{
 assert.match(app,/TBSClientRequests/);
 assert.match(app,/client-requests/);
 assert.doesNotMatch(app,/TBSClientHealthScore/);
 assert.doesNotMatch(center,/TBSClientRequests|TBSClientHealthScore/);
});
test('monthly close approval only locks workflow and does not imply accounting certification',()=>{
 assert.match(center,/Accounting transactions are NOT locked/);
 assert.match(center,/does not lock transactions or certify audited financial statements/);
 assert.match(center,/not an automatic balance validation/);
});
