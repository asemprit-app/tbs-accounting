import test from 'node:test';
import assert from 'node:assert/strict';
import {canRequestCloseReview,canApproveClose,reviewsForMonth,reviewCounts} from '../src/tbsCloseReviewWorkflow.js';
const keys=['statements','cards','reconciliation','sales_expenses','payroll','uncategorized','journal','income','balance','report'];
const completed=keys.map(task_key=>({task_key,status:'DONE'}));
const close={status:'READY_FOR_REVIEW',assigned_to:'preparer-1'};
test('ten distinct tasks and no unresolved critical issues are required',()=>{
 assert.equal(canRequestCloseReview(completed,[]),true);
 assert.equal(canRequestCloseReview(completed.slice(1),[]),false);
 assert.equal(canRequestCloseReview(completed,[{priority:'HIGH',status:'OPEN'}]),false);
 assert.equal(canRequestCloseReview(completed,[{priority:'URGENT',status:'IN_REVIEW'}]),false);
 assert.equal(canRequestCloseReview(completed,[{priority:'HIGH',status:'RESOLVED'}]),true);
 assert.equal(canRequestCloseReview(completed,[{priority:'NORMAL',status:'OPEN'}]),true);
 assert.equal(canRequestCloseReview(completed.map((t,i)=>i===3?{...t,status:'NOT_APPLICABLE'}:t),[]),true);
});
test('approval requires a separate assigned supervisor and approved stage',()=>{
 assert.equal(canApproveClose(close,completed,[],'preparer-1'),false);
 assert.equal(canApproveClose(close,completed,[],'supervisor-2'),true);
 assert.equal(canApproveClose({...close,assigned_to:null},completed,[],'supervisor-2'),false);
 assert.equal(canApproveClose({...close,status:'IN_PROGRESS'},completed,[],'supervisor-2'),false);
 assert.equal(canApproveClose(close,completed,[{priority:'HIGH',status:'OPEN'}],'supervisor-2'),false);
});
test('reviews are scoped to the selected accounting period',()=>{
 const rows=[{period_start:'2026-10-01',status:'OPEN',priority:'URGENT'},{period_start:'2026-11-01',status:'RESOLVED',priority:'HIGH'}];
 assert.equal(reviewsForMonth(rows,'2026-10').length,1);
 assert.equal(reviewCounts(reviewsForMonth(rows,'2026-11')).critical,0);
});
