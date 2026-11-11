import {closeTaskCounts,REQUIRED_CLOSE_TASK_KEYS} from './tbsCloseRules.js';
import {isCriticalReview} from './tbsCloseReviewWorkflow.js';

export const CLOSE_STATUS_LABELS=Object.freeze({
  NOT_STARTED:'No iniciado',IN_PROGRESS:'En proceso',
  READY_FOR_REVIEW:'Listo para revisión',CLOSED:'Aprobado',
});
export function buildCloseOverviewRows(clients=[],closes=[],tasks=[],reviews=[]){
  const byClient=new Map(closes.map(c=>[c.client_id,c]));
  const byClose=new Map();
  for(const task of tasks){
    const arr=byClose.get(task.close_id)||[];
    arr.push(task);
    byClose.set(task.close_id,arr);
  }
  const criticalByClient=new Map();
  for(const issue of reviews){
    if(isCriticalReview(issue))criticalByClient.set(issue.client_id,(criticalByClient.get(issue.client_id)||0)+1);
  }
  return clients.map(client=>{
    const close=byClient.get(client.id)||null;
    const status=close?.status||'NOT_STARTED';
    const counts=closeTaskCounts(close?byClose.get(close.id)||[]:[]);
    const critical=criticalByClient.get(client.id)||0;
    return {
      clientId:client.id,clientName:client.name,closeId:close?.id||null,
      status,statusLabel:CLOSE_STATUS_LABELS[status]||status,
      done:counts.done,notApplicable:counts.notApplicable,
      completed:counts.completed,total:REQUIRED_CLOSE_TASK_KEYS.length,
      pending:counts.pending,progress:Math.round(counts.completed/REQUIRED_CLOSE_TASK_KEYS.length*100),
      critical,preparerId:close?.assigned_to||null,updatedAt:close?.updated_at||null,
      actionRequired:critical>0||(status==='IN_PROGRESS'&&counts.pending===0),
    };
  });
}
export function closeOverviewTotals(rows=[]){
  return {
    clients:rows.length,
    notStarted:rows.filter(r=>r.status==='NOT_STARTED').length,
    inProgress:rows.filter(r=>r.status==='IN_PROGRESS').length,
    ready:rows.filter(r=>r.status==='READY_FOR_REVIEW').length,
    approved:rows.filter(r=>r.status==='CLOSED').length,
    withCritical:rows.filter(r=>r.critical>0).length,
    needSubmit:rows.filter(r=>r.status==='IN_PROGRESS'&&r.pending===0&&r.critical===0).length,
  };
}
