// Independent operational production data; no journal entries or accounting
// account mappings are created by these functions.
export function isoMonth(value) {
 const match=String(value||'').match(/^([0-9]{4})-([0-9]{2})/);
 if(!match)return '';
 const year=Number(match[1]),month=Number(match[2]);
 if(year<2000||year>2100||month<1||month>12)return '';
 return match[1]+'-'+match[2]+'-01';
}
export function monthlyRange(from,to) {
 const a=isoMonth(from),b=isoMonth(to);
 if(!a||!b||a>b)return [];
 const result=[];let date=new Date(a+'T12:00:00Z');
 for(let i=0;i<240&&date.toISOString().slice(0,10)<=b;i++){
  result.push(date.toISOString().slice(0,10));
  date.setUTCMonth(date.getUTCMonth()+1);
 }
 return result;
}
export function fullCalendarMonths(from,to) {
 const months=monthlyRange(from,to);
 if(!months.length||from!==months[0])return false;
 const final=months[months.length-1],last=new Date(final+'T12:00:00Z');
 last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(0);
 return to===last.toISOString().slice(0,10);
}
export function operationalMetricSummary(metrics=[],values=[],from='',to='',sales=null) {
 const months=monthlyRange(from,to);
 const keys=new Set(months);
 const fullMonths=fullCalendarMonths(from,to);
 const rows=[];
 for(const metric of metrics) {
  if(metric.active===false)continue;
  const records=(values||[]).filter(r=>r.metric_id===metric.id&&keys.has(r.period_month))
   .sort((a,b)=>a.period_month.localeCompare(b.period_month));
  if(!records.length)continue;
  const amounts=records.map(r=>Number(r.value)).filter(Number.isFinite);
  if(!amounts.length)continue;
  const aggregation=metric.aggregation||'sum';
  const result=aggregation==='average'
   ? amounts.reduce((a,b)=>a+b,0)/amounts.length
   : aggregation==='last'?amounts[amounts.length-1]
   : amounts.reduce((a,b)=>a+b,0);
  const coverageComplete=records.length===months.length&&fullMonths;
  const revenuePerUnit=coverageComplete&&aggregation==='sum'&&result>0&&
   sales!==null&&Number.isFinite(Number(sales))?Number(sales)/result:null;
  const first=amounts[0],last=amounts[amounts.length-1];
  rows.push({
   metricId:metric.id,name:metric.name,unit:metric.unit||'unidades',aggregation,
   result:Math.round(result*10000)/10000,periodCount:records.length,
   expectedMonths:months.length,coverageComplete,fullMonths,
   revenuePerUnit,trendPct:amounts.length>=2&&first!==0?(last-first)/Math.abs(first)*100:null,
   series:records.map(r=>({month:r.period_month,value:Number(r.value),notes:r.notes||''})),
  });
 }
 return rows;
}
export function operationalMetricFormat(amount,unit='') {
 if(amount===null||amount===undefined||!Number.isFinite(Number(amount)))return 'N/D';
 const number=new Intl.NumberFormat('es-PR',{maximumFractionDigits:2}).format(Number(amount));
 return unit==='%'?number+'%':number+(unit?' '+unit:'');
}
