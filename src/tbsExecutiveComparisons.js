import {executiveMetrics,comparisonChange,previousComparablePeriod} from './tbsExecutiveReportRules.js';

export const MAX_COMPARISON_PERIODS=5;
const round2=x=>Math.round((Number(x)||0)*100)/100;
const cashName=/banc|bppr|cash|efectivo|caja/i;
const money=x=>Number(x).toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
const isoToUtc=value=>Date.parse(value+'T00:00:00Z');

export function isRealDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const stamp=isoToUtc(value);
 return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===value;
}
export function periodDays(from,to){
 return isRealDate(from)&&isRealDate(to)&&from<=to
   ?Math.round((isoToUtc(to)-isoToUtc(from))/86400000)+1:null;
}
export function wholeCalendarMonth(from,to){
 if(!isRealDate(from)||!isRealDate(to)||from.slice(0,7)!==to.slice(0,7)||!from.endsWith('-01'))return false;
 const [year,month]=from.slice(0,7).split('-').map(Number);
 return to===new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
}
export function monthPeriod(month){
 if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return null;
 const [year,m]=month.split('-').map(Number);
 const start=month+'-01';
 return {mode:'month',from:start,to:new Date(Date.UTC(year,m,0)).toISOString().slice(0,10)};
}
export function initialComparison(previousFrom,previousTo){
 if(!isRealDate(previousFrom)||!isRealDate(previousTo)||previousFrom>previousTo)return null;
 return {mode:wholeCalendarMonth(previousFrom,previousTo)?'month':'custom',from:previousFrom,to:previousTo};
}
export function nextComparison(existing=[],from,to){
 const last=existing.at(-1);
 const base=last&&isRealDate(last.from)&&isRealDate(last.to)&&last.from<=last.to
  ?{from:last.from,to:last.to}:{from,to};
 const prior=previousComparablePeriod(base.from,base.to);
 return prior?initialComparison(prior.from,prior.to):null;
}
export function validateComparisonPeriods(list,mainFrom,mainTo){
 if(!Array.isArray(list)||list.length>MAX_COMPARISON_PERIODS)
  return {error:'Se permiten hasta cinco períodos comparativos.'};
 const seen=new Set([mainFrom+'|'+mainTo]);
 const output=[];
 for(const row of list){
  if(!row||!isRealDate(row.from)||!isRealDate(row.to)||row.from>row.to)
   return {error:'Completa fechas válidas en cada período comparativo (Desde no puede superar Hasta).'};
  const key=row.from+'|'+row.to;
  if(seen.has(key))return {error:'Cada comparación debe tener un período distinto; elimina los períodos duplicados.'};
  seen.add(key);
  const mode=row.mode==='month'&&wholeCalendarMonth(row.from,row.to)?'month':'custom';
  output.push({mode,from:row.from,to:row.to});
 }
 return {periods:output};
}
export function executiveFinancialsForRange({
 from,to,postings=[],accounts=[],invoices=[],
 invoiceRevenueSubtotal=()=>0,tradeReceivableGL=null,
 incomeThroughDate=()=>0,
}){
 if(!periodDays(from,to))return null;
 const revenueCodes=new Set(accounts.filter(a=>a.type==='Revenue').map(a=>a.code));
 const expenseAccounts=accounts.filter(a=>a.type==='Expense');
 const expenseCodes=new Set(expenseAccounts.map(a=>a.code));
 const cogsCodes=new Set(expenseAccounts.filter(a=>a.isCogs).map(a=>a.code));
 const assetCodes=new Set(accounts.filter(a=>a.type==='Asset').map(a=>a.code));
 const liabilities=new Set(accounts.filter(a=>a.type==='Liability').map(a=>a.code));
 const equities=new Set(accounts.filter(a=>a.type==='Equity').map(a=>a.code));
 const cashCodes=new Set(accounts.filter(a=>a.type==='Asset'&&cashName.test(a.name||'')).map(a=>a.code));
 const spanPostings=postings.filter(p=>p.date>=from&&p.date<=to);
 const endingPostings=postings.filter(p=>p.date<=to);
 const issuedInPeriod=invoices.filter(i=>i.date>=from&&i.date<=to);
 const invoiceRevenue=issuedInPeriod.reduce((total,i)=>total+(Number(invoiceRevenueSubtotal(i))||0),0);
 const revenue=spanPostings.filter(p=>revenueCodes.has(p.gl)).reduce((total,p)=>total+(Number(p.amount)||0),0)+invoiceRevenue;
 const expenses=spanPostings.filter(p=>expenseCodes.has(p.gl)).reduce((total,p)=>total+(Number(p.amount)||0),0);
 const cogs=spanPostings.filter(p=>cogsCodes.has(p.gl)).reduce((total,p)=>total+(Number(p.amount)||0),0);
 const sumEnding=codes=>endingPostings.filter(p=>codes.has(p.gl)).reduce((s,p)=>s+(Number(p.amount)||0),0);
 const assets=sumEnding(assetCodes),liabilitiesAmount=sumEnding(liabilities);
 const equity=sumEnding(equities)+incomeThroughDate(postings,accounts,invoices,invoiceRevenueSubtotal,to);
 const cash=sumEnding(cashCodes);
 const cashMovement=spanPostings.filter(p=>cashCodes.has(p.gl)).reduce((total,p)=>total+(Number(p.amount)||0),0);
 const expenseRows=expenseAccounts.map(a=>({
  name:a.name,value:spanPostings.filter(p=>p.gl===a.code).reduce((total,p)=>total+(Number(p.amount)||0),0),
 }));
 const periodRecords=spanPostings.filter(p=>revenueCodes.has(p.gl)||expenseCodes.has(p.gl)).length+issuedInPeriod.length;
 return {
  from,to,revenue:round2(revenue),expenses:round2(expenses),cogs:round2(cogs),
  netIncome:round2(revenue-expenses),hasCogs:cogsCodes.size>0,
  cash:round2(cash),cashMovement:round2(cashMovement),
  receivables:tradeReceivableGL?round2(sumEnding(new Set([tradeReceivableGL]))):null,
  liabilities:round2(liabilitiesAmount),assets:round2(assets),
  balanceDifference:round2(assets-liabilitiesAmount-equity),
  expenseRows,periodRecords,
  uncategorizedCount:0, // caller can supply source transaction count if needed
 };
}
export function buildExecutiveComparisons(periods,base,options){
 return periods.map(p=>{
  const f=executiveFinancialsForRange({...options,from:p.from,to:p.to});
  return {...p,days:periodDays(p.from,p.to),financials:f,metrics:executiveMetrics(f||{})};
 });
}
export function metricComparison(key,current,reference){
 const a=current?.[key],b=reference?.[key];
 if(a===null||b===null||a===undefined||b===undefined)return {delta:null,percent:null,unit:key.includes('margin')?'pp':'USD'};
 if(!Number.isFinite(Number(a))||!Number.isFinite(Number(b)))return {delta:null,percent:null,unit:key.includes('margin')?'pp':'USD'};
 const delta=round2(Number(a)-Number(b));
 return {delta,percent:key.includes('margin')?null:comparisonChange(a,b),unit:key.includes('margin')?'pp':'USD'};
}
export function comparisonFindings(primary,comparisons=[]){
 const rows=[];
 for(const entry of comparisons){
  const f=entry.financials;
  const label=entry.from+' a '+entry.to;
  if(!f?.periodRecords||!primary.periodRecords){
   rows.push('Comparativo '+label+': no hay registros suficientes de ingresos o gastos para interpretar la tendencia.');
   continue;
  }
  const daysPrimary=periodDays(primary.from,primary.to);
  const unequal=daysPrimary!==periodDays(entry.from,entry.to);
  const current=executiveMetrics(primary);
  const revenue=metricComparison('revenue',current,entry.metrics);
  const net=metricComparison('net_income',current,entry.metrics);
  let description='Frente a '+label+', las ventas del período principal varían '+money(revenue.delta);
  if(!unequal && revenue.percent!==null)description+=' ('+(revenue.percent>0?'+':'')+revenue.percent+'%)';
  description+=' y la ganancia neta varía '+money(net.delta)+'.';
  if(unequal)description+=' Los períodos contienen diferente número de días; las variaciones totales no son directamente comparables sin ajustar la duración.';
  rows.push(description);
 }
 return rows;
}
