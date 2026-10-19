// Pure, deterministic pilot operational score.
// This is NOT a measure of verified financial health or bank reconciliation accuracy.
// The monthly checklist has to contain all required entries before a total is shown.
export const REQUIRED_HEALTH_TASKS=Object.freeze([
  'statements','reconciliation','cards','uncategorized','payroll',
  'journal','balance','income','report'
]);
export const GENERAL_HEALTH_TASKS=Object.freeze([
  'statements','cards','payroll','journal','balance','income','report'
]);
const isDone=entry=>entry?.status==='DONE';

export function calculateOperationalHealth({hasClose=false,tasks=[],openRequests,openReviews}){
  if(!Number.isSafeInteger(openRequests)||openRequests<0 ||
     !Number.isSafeInteger(openReviews)||openReviews<0){
    throw new Error('Operational follow-up counts must be nonnegative exact integers.');
  }
  const byKey=new Map((Array.isArray(tasks)?tasks:[]).filter(Boolean).map(t=>[t.task_key,t]));
  const sufficient=Boolean(hasClose)&&REQUIRED_HEALTH_TASKS.every(key=>byKey.has(key));
  const done=GENERAL_HEALTH_TASKS.filter(key=>isDone(byKey.get(key))).length;
  const breakdown=[
    {label:'Monthly close checklist',points:sufficient?Math.round(done/7*30):null,max:30,
     detail:sufficient?`${done}/7 general tasks completed (reconciliation and categorization scored separately)`:'Checklist incomplete'},
    {label:'Reconciliation checklist',points:sufficient?(isDone(byKey.get('reconciliation'))?20:0):null,max:20,
     detail:'Checklist confirmation, not bank verification'},
    {label:'Uncategorized review checklist',points:sufficient?(isDone(byKey.get('uncategorized'))?15:0):null,max:15,
     detail:'Checklist confirmation, not transaction count'},
    {label:'Client requests',points:Math.max(0,15-openRequests*5),max:15,
     detail:`${openRequests} open requests (all periods)`},
    {label:'Review queue',points:Math.max(0,20-openReviews*5),max:20,
     detail:`${openReviews} unresolved items (all periods)`}
  ];
  const score=sufficient?breakdown.reduce((sum,row)=>sum+row.points,0):null;
  return {score,breakdown,sufficient};
}
