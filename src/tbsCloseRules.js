// Shared checklist contract for every TBS monthly close.
// Historical tasks keep their existing stable keys and completion evidence.
export const CLOSE_TASKS=Object.freeze([
  {key:'statements',title:'Bank statements received'},
  {key:'cards',title:'Credit cards reconciled'},
  {key:'reconciliation',title:'Bank reconciliations verified'},
  {key:'sales_expenses',title:'Sales and Expenses report verified'},
  {key:'payroll',title:'Payroll and services verified'},
  {key:'uncategorized',title:'Uncategorized transactions reviewed'},
  {key:'journal',title:'Journal entries validated'},
  {key:'income',title:'Profit & Loss validated'},
  {key:'balance',title:'Balance Sheet validated'},
  {key:'report',title:'Client report delivered'},
]);
export const REQUIRED_CLOSE_TASK_KEYS=Object.freeze(CLOSE_TASKS.map(t=>t.key));
export const CLOSE_TASK_COMPLETE_STATUSES=Object.freeze(['DONE','NOT_APPLICABLE']);

export function closeTaskCounts(tasks=[]){
  const byKey=new Map((Array.isArray(tasks)?tasks:[])
    .filter(task=>REQUIRED_CLOSE_TASK_KEYS.includes(task?.task_key))
    .map(task=>[task.task_key,task.status]));
  let done=0, notApplicable=0;
  for(const key of REQUIRED_CLOSE_TASK_KEYS){
    if(byKey.get(key)==='DONE')done++;
    if(byKey.get(key)==='NOT_APPLICABLE')notApplicable++;
  }
  const completed=done+notApplicable;
  return {done,notApplicable,completed,pending:REQUIRED_CLOSE_TASK_KEYS.length-completed,total:REQUIRED_CLOSE_TASK_KEYS.length};
}
export function completedCloseTaskCount(tasks=[]){return closeTaskCounts(tasks).completed;}
export function isCloseReadyForReview(tasks=[]){return completedCloseTaskCount(tasks)===REQUIRED_CLOSE_TASK_KEYS.length;}
export function statusAfterTaskChange(currentStatus,taskIsComplete){
  return !taskIsComplete&&currentStatus==='READY_FOR_REVIEW'?'IN_PROGRESS':currentStatus;
}
