// Pure business rules for the monthly-close workflow.
// UI and automated tests share these rules; do not treat them as a database approval lock.
export const REQUIRED_CLOSE_TASK_KEYS=Object.freeze([
  'statements','reconciliation','cards','uncategorized','payroll',
  'journal','balance','income','report'
]);

export function completedCloseTaskCount(tasks=[]){
  if(!Array.isArray(tasks))return 0;
  const completed=new Set(tasks.filter(t=>t?.status==='DONE').map(t=>t.task_key));
  return REQUIRED_CLOSE_TASK_KEYS.filter(k=>completed.has(k)).length;
}

export function isCloseReadyForReview(tasks=[]){
  return completedCloseTaskCount(tasks)===REQUIRED_CLOSE_TASK_KEYS.length;
}

export function statusAfterTaskChange(currentStatus,taskIsDone){
  return !taskIsDone && currentStatus==='READY_FOR_REVIEW'?'IN_PROGRESS':currentStatus;
}
