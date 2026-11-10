import { REQUIRED_CLOSE_TASK_KEYS,completedCloseTaskCount } from './tbsCloseRules.js';

export function isCriticalReview(review) {
  return ['HIGH','URGENT'].includes(review?.priority) && !['RESOLVED','APPROVED'].includes(review?.status);
}
export function reviewsForMonth(reviews, month) {
  return (reviews||[]).filter(r=>r.period_start===month+'-01');
}
export function canRequestCloseReview(tasks, reviews) {
  return completedCloseTaskCount(tasks) === REQUIRED_CLOSE_TASK_KEYS.length && !reviews.some(isCriticalReview);
}
export function canApproveClose(close, tasks, reviews, actorId) {
  return Boolean(close && close.status==='READY_FOR_REVIEW' && close.assigned_to &&
    actorId && close.assigned_to!==actorId && canRequestCloseReview(tasks,reviews));
}
export function reviewCounts(reviews) {
  return {
    open:(reviews||[]).filter(r=>!['RESOLVED','APPROVED'].includes(r.status)).length,
    critical:(reviews||[]).filter(isCriticalReview).length,
    overdue:(reviews||[]).filter(r=>r.due_date && r.due_date < new Date().toISOString().slice(0,10) && !['RESOLVED','APPROVED'].includes(r.status)).length,
  };
}
