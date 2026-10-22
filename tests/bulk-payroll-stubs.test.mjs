import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bulkPayrollSelection,bulkMissingRecipients} from '../src/tbsBulkPayroll.js';

test('bulk selects only the requested lines and does not duplicate',()=>{
  const lines=[{id:'a',employeeId:'e1'},{id:'b',employeeId:'e2'}];
  assert.deepEqual(bulkPayrollSelection(lines,['a','a','absent']).map(x=>x.id),['a']);
});
test('bulk identifies employees without valid email separately',()=>{
  const lines=[{id:'a',employeeId:'e1'},{id:'b',employeeId:'e2'},{id:'c',employeeId:'e3'}];
  const employees=[{id:'e1',email:'valid@example.com'},{id:'e2',email:'bad@email'}];
  assert.deepEqual(bulkMissingRecipients(lines,employees).map(x=>x.id),['b','c']);
});
test('server does not send unauthenticated payroll',async()=>{
  const {default:handler}=await import('../api/send-paystub.js');
  const res={setHeader(){},status(code){this.code=code;return this;},json(data){this.body=data;return this;}};
  await handler({method:'POST',headers:{},body:{}},res);
  assert.equal(res.code,401);
});
