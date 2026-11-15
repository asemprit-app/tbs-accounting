// Task-specific assignees are resolved from the staff directory, not hardcoded UUIDs.
export const DEFAULT_MONTHLY_CLOSE_RESPONSIBLE='admin@twelvestrategies.com';
export const DEFAULT_REPORT_DELIVERY_RESPONSIBLE='asemprit@twelvestrategies.com';

export function defaultCloseTaskAssigneeEmail(taskKey){
 return taskKey==='report'?DEFAULT_REPORT_DELIVERY_RESPONSIBLE:DEFAULT_MONTHLY_CLOSE_RESPONSIBLE;
}

export function resolveCloseTaskAssignees(staff=[]){
 const people=new Map((Array.isArray(staff)?staff:[])
  .filter(person=>person?.id&&person?.email)
  .map(person=>[person.email.trim().toLowerCase(),person.id]));
 const adminId=people.get(DEFAULT_MONTHLY_CLOSE_RESPONSIBLE);
 const reportId=people.get(DEFAULT_REPORT_DELIVERY_RESPONSIBLE);
 if(!adminId||!reportId){
  const missing=[!adminId?DEFAULT_MONTHLY_CLOSE_RESPONSIBLE:null,!reportId?DEFAULT_REPORT_DELIVERY_RESPONSIBLE:null].filter(Boolean);
  throw new Error('No se pudo asignar el Monthly Close: falta personal activo en el directorio ('+missing.join(', ')+'). No se crearon tareas sin responsable.');
 }
 return {adminId,reportId};
}

export function defaultCloseTaskAssigneeId(taskKey,assignees){
 return taskKey==='report'?assignees.reportId:assignees.adminId;
}
