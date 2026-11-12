// One revenue observation per calendar month overlapping the selected report.
// Uses the exact P&L revenue returned by Financial Reports for that month's
// (possibly partial) date range. Balance Sheet accounts are never added.
const cents=x=>Math.round((Number(x)||0)*100);
const iso=x=>/^\d{4}-\d{2}-\d{2}$/.test(x||'');
const monthName=month=>{
 const [year,m]=month.split('-').map(Number);
 return new Intl.DateTimeFormat('es-PR',{month:'short',year:'numeric',timeZone:'UTC'})
   .format(new Date(Date.UTC(year,m-1,1)));
};
export const MAX_MONTHLY_SALES_MONTHS=120;
export function monthlySalesSeries(from,to,financialsForRange){
 if(!iso(from)||!iso(to)||from>to||typeof financialsForRange!=='function')return {rows:[],totalSales:0,totalExpenses:0,totalNet:0};
 const [startYear,startMonth]=from.slice(0,7).split('-').map(Number);
 const [endYear,endMonth]=to.slice(0,7).split('-').map(Number);
 const count=(endYear-startYear)*12+endMonth-startMonth+1;
 if(count>MAX_MONTHLY_SALES_MONTHS)
  throw Error('El período supera 120 meses. Selecciona un intervalo más corto para visualizar las ventas mensuales.');
 const rows=[];
 let totalCents=0,totalExpenseCents=0,previous=null;
 for(let index=0;index<count;index++){
  const first=new Date(Date.UTC(startYear,startMonth-1+index,1));
  const last=new Date(Date.UTC(startYear,startMonth+index,0));
  const month=first.toISOString().slice(0,7);
  const firstDate=first.toISOString().slice(0,10);
  const lastDate=last.toISOString().slice(0,10);
  const rangeFrom=firstDate<from?from:firstDate;
  const rangeTo=lastDate>to?to:lastDate;
  const finance=financialsForRange(rangeFrom,rangeTo)||{};
  const salesCents=cents(finance.revenue);
  // Same signed Expense ledger accounts (including COGS) as P&L.
  const expenseCents=cents(finance.expenses);
  const netCents=salesCents-expenseCents;
  const changeCents=previous===null?null:salesCents-previous;
  const changePercent=previous!==null&&previous>0?
    Math.round(changeCents/previous*10000)/100:null;
  rows.push({
   month,label:monthName(month),from:rangeFrom,to:rangeTo,
   sales:salesCents/100,expenses:expenseCents/100,netIncome:netCents/100,
   change:changeCents===null?null:changeCents/100,
   changePercent,hasActivity:Boolean(finance.periodRecords),
   partialMonth:rangeFrom!==firstDate||rangeTo!==lastDate,
  });
  totalCents+=salesCents;totalExpenseCents+=expenseCents;previous=salesCents;
 }
 return {rows,totalSales:totalCents/100,totalExpenses:totalExpenseCents/100,totalNet:(totalCents-totalExpenseCents)/100};
}
