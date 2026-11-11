import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUIRED_CLOSE_TASK_KEYS,completedCloseTaskCount,isCloseReadyForReview,statusAfterTaskChange
} from '../src/tbsCloseRules.js';

const full=()=>REQUIRED_CLOSE_TASK_KEYS.map(task_key=>({task_key,status:'DONE'}));

test('Ten distinct required tasks are needed; no partial checklist can pass',()=>{
  assert.equal(REQUIRED_CLOSE_TASK_KEYS.length,10);
  for(let i=0;i<REQUIRED_CLOSE_TASK_KEYS.length;i++){
    const list=full().filter((_,index)=>index!==i);
    assert.equal(isCloseReadyForReview(list),false,REQUIRED_CLOSE_TASK_KEYS[i]);
    assert.equal(completedCloseTaskCount(list),9);
  }
});
test('Every required task done passes once, even if extra tasks are present',()=>{
  assert.equal(isCloseReadyForReview(full()),true);
  assert.equal(isCloseReadyForReview([...full(),{task_key:'not_required',status:'DONE'}]),true);
});
test('Duplicated task rows cannot replace a missing mandatory task',()=>{
  assert.equal(isCloseReadyForReview([...full().slice(0,8),full()[0]]),false);
});
test('Unrecognized or incomplete statuses do not count as completed',()=>{
  for(const status of ['PENDING','IN_PROGRESS','BLOCKED','COMPLETED',undefined]){
    const list=full();list[2]={task_key:list[2].task_key,status};
    assert.equal(isCloseReadyForReview(list),false,String(status));
  }
});
test('N/A is a valid completed status',()=>{
  const tasks=full();tasks[2].status='NOT_APPLICABLE';
  assert.equal(isCloseReadyForReview(tasks),true);
});
test('Missing, malformed or empty task collections fail safely',()=>{
  assert.equal(isCloseReadyForReview(),false);
  assert.equal(isCloseReadyForReview([]),false);
  assert.equal(isCloseReadyForReview(null),false);
});
test('Reopening a task cancels READY_FOR_REVIEW but does not finalize or alter other statuses',()=>{
  assert.equal(statusAfterTaskChange('READY_FOR_REVIEW',false),'IN_PROGRESS');
  assert.equal(statusAfterTaskChange('READY_FOR_REVIEW',true),'READY_FOR_REVIEW');
  assert.equal(statusAfterTaskChange('IN_PROGRESS',false),'IN_PROGRESS');
  assert.equal(statusAfterTaskChange('CLOSED',false),'CLOSED');
});
