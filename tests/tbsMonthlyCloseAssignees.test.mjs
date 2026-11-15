import test from 'node:test';
import assert from 'node:assert/strict';
import {CLOSE_TASKS} from '../src/tbsCloseRules.js';
import {defaultCloseTaskAssigneeEmail,resolveCloseTaskAssignees,defaultCloseTaskAssigneeId} from '../src/tbsMonthlyCloseAssignees.js';

const staff=[
 {id:'admin-uuid',email:'ADMIN@twelvestrategies.com'},
 {id:'asemprit-uuid',email:'asemprit@twelvestrategies.com'},
];
test('all monthly close tasks except report go to admin',()=>{
 const assignees=resolveCloseTaskAssignees(staff);
 assert.equal(CLOSE_TASKS.length,10);
 for(const task of CLOSE_TASKS){
  const isReport=task.key==='report';
  assert.equal(defaultCloseTaskAssigneeEmail(task.key),isReport?'asemprit@twelvestrategies.com':'admin@twelvestrategies.com');
  assert.equal(defaultCloseTaskAssigneeId(task.key,assignees),isReport?'asemprit-uuid':'admin-uuid');
 }
});
test('directory matching is case insensitive and fails safely for missing responsible',()=>{
 assert.deepEqual(resolveCloseTaskAssignees(staff),{adminId:'admin-uuid',reportId:'asemprit-uuid'});
 assert.throws(()=>resolveCloseTaskAssignees([{id:'admin-uuid',email:'admin@twelvestrategies.com'}]),/asemprit@twelvestrategies.com/);
 assert.throws(()=>resolveCloseTaskAssignees([]),/No se pudo asignar/);
});
