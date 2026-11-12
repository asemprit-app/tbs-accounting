import {monthRange,comparisonRows} from './tbsExecutiveComparison.js';
import {executiveMetrics} from './tbsExecutiveReportRules.js';
export const MAX_MONTHS=12;
export const isValidMonth=month=>Boolean(monthRange(month));
export function normalizeSelectedMonths(months=[]){
 if(!Array.isArray(months))return [];
 return [...new Set(months.filter(isValidMonth))].sort().slice(0,MAX_MONTHS);
}
export function addSelectedMonth(existing,month){
 if(!isValidMonth(month))return normalizeSelectedMonths(existing);
 const all=normalizeSelectedMonths(existing);
 return all.includes(month)?all:normalizeSelectedMonths([...all,month]);
}
export function monthTitle(month){
 const range=monthRange(month);
 if(!range)return month;
 const [year,m]=month.split('-').map(Number);
 return new Intl.DateTimeFormat('es-PR',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,m-1,1)));
}
export function buildMonthlyComparison(months=[],calculate){
 return normalizeSelectedMonths(months).map(month=>{
   const range=monthRange(month);
   const financials=calculate(range.from,range.to);
   return {month,label:monthTitle(month),...range,metrics:executiveMetrics(financials),hasActivity:Boolean(financials.periodRecords)};
 });
}
export function buildMonthKpiRows(indicators,monthRows){
 return indicators.map(k=>{
  const values=monthRows.map(row=>row.metrics[k.key]);
  const changes=monthRows.map((row,i)=>{
   if(i===0)return null;
   const previous=monthRows[i-1].metrics[k.key];
   return comparisonRows([k],{[k.key]:row.metrics[k.key]},{[k.key]:previous})[0];
  });
  return {...k,values,changes};
 });
}
export function monthlyComparisonFindings(monthRows=[]){
 if(monthRows.length<2)return [];
 const findings=[];
 for(let i=1;i<monthRows.length;i++){
  const old=monthRows[i-1],current=monthRows[i];
  if(!old.hasActivity||!current.hasActivity)continue;
  const rev=comparisonRows([{key:'revenue'}],current.metrics,old.metrics)[0];
  const net=comparisonRows([{key:'net_income'}],current.metrics,old.metrics)[0];
  if(rev.delta!==null){
   const sign=rev.delta>0?'aumentaron':rev.delta<0?'disminuyeron':'se mantuvieron';
   const amount=Math.abs(rev.delta).toLocaleString('en-US',{style:'currency',currency:'USD'});
   findings.push('Las ventas '+sign+' '+amount+' de '+old.label+' a '+current.label+
     (rev.changePercent===null?'':', equivalente a '+rev.changePercent.toFixed(1)+'%')+'.');
  }
  if(net.delta!==null){
   const sign=net.delta>0?'mejoró':net.delta<0?'se redujo':'no cambió';
   findings.push('La ganancia neta '+sign+' '+Math.abs(net.delta).toLocaleString('en-US',{style:'currency',currency:'USD'})+
     ' de '+old.label+' a '+current.label+'.');
  }
 }
 return findings.slice(0,8);
}
