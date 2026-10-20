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
test('Client Requests and Health Score stay outside initial release',()=>{
 assert.doesNotMatch(app,/TBSClientRequests|TBSClientHealthScore|client-requests/);
 assert.doesNotMatch(center,/TBSClientRequests|TBSClientHealthScore/);
});
test('no final close or accounting certification is implied',()=>{
 assert.match(center,/Final period locking and approval are not enabled/);
 assert.match(center,/does not automatically validate accounting balances/);
});
