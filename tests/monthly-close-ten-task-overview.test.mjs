import test from 'node:test';
import assert from 'node:assert/strict';
import {CLOSE_TASKS,closeTaskCounts,completedCloseTaskCount,isCloseReadyForReview} from '../src/tbsCloseRules.js';
import {canRequestCloseReview} from '../src/tbsCloseReviewWorkflow.js';
import {buildCloseOverviewRows,closeOverviewTotals} from '../src/tbsCloseOverview.js';

const expected=['statements','cards','reconciliation','sales_expenses','payroll','uncategorized','journal','income','balance','report'];
test('ten monthly close activities are ordered exactly for every client',()=>{
  assert.deepEqual(CLOSE_TASKS.map(t=>t.key),expected);
  assert.equal(CLOSE_TASKS[3].title,'Sales and Expenses report verified');
});
test('NOT_APPLICABLE satisfies a task, but not an unresolved critical review item',()=>{
  const tasks=expected.map((task_key,i)=>({task_key,status:i===3?'NOT_APPLICABLE':'DONE'}));
  assert.equal(completedCloseTaskCount(tasks),10);
  assert.equal(isCloseReadyForReview(tasks),true);
  assert.equal(closeTaskCounts(tasks).notApplicable,1);
  assert.equal(canRequestCloseReview(tasks,[]),true);
  assert.equal(canRequestCloseReview(tasks,[{priority:'HIGH',status:'OPEN'}]),false);
  assert.equal(canRequestCloseReview(tasks,[{priority:'HIGH',status:'RESOLVED'}]),true);
});
test('missing new Sales/Expenses task blocks review until DONE or N/A',()=>{
  const tasks=expected.filter(k=>k!=='sales_expenses').map(task_key=>({task_key,status:'DONE'}));
  assert.equal(closeTaskCounts(tasks).pending,1);
  assert.equal(canRequestCloseReview(tasks,[]),false);
  assert.equal(closeTaskCounts([...tasks,{task_key:'sales_expenses',status:'NOT_APPLICABLE'}]).completed,10);
});
test('oversight includes clients without close and honors N/A, critical issues and status',()=>{
 const rows=buildCloseOverviewRows(
 [{id:'a',name:'Alpha'},{id:'b',name:'Beta'}],
 [{id:'c',client_id:'a',status:'IN_PROGRESS',assigned_to:'owner'}],
 expected.map((task_key,i)=>({close_id:'c',task_key,status:i===4?'NOT_APPLICABLE':'DONE'})),
 [{client_id:'a',priority:'URGENT',status:'OPEN'},{client_id:'b',priority:'HIGH',status:'RESOLVED'}]
 );
 assert.deepEqual(rows.map(r=>r.status),['IN_PROGRESS','NOT_STARTED']);
 assert.equal(rows[0].completed,10);
 assert.equal(rows[0].notApplicable,1);
 assert.equal(rows[0].critical,1);
 assert.equal(rows[1].progress,0);
 assert.deepEqual(closeOverviewTotals(rows),{clients:2,notStarted:1,inProgress:1,ready:0,approved:0,withCritical:1,needSubmit:0});
});
