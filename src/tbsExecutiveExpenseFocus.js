const cents=value=>Math.round((Number(value)||0)*100);
export function fiveLargestExpenses(expenseRows=[],totalExpense=0){
 const base=cents(totalExpense);
 const rows=(Array.isArray(expenseRows)?expenseRows:[])
  .map(row=>({...row,amountCents:cents(row.value)}))
  .filter(row=>row.amountCents>0)
  .sort((a,b)=>b.amountCents-a.amountCents||String(a.code).localeCompare(String(b.code)))
  .slice(0,5)
  .map(row=>({
    code:String(row.code||''),name:String(row.name||row.code||'Sin descripción'),
    amount:row.amountCents/100,
    percent:base>0?Math.round(row.amountCents/base*10000)/100:null,
    isCogs:Boolean(row.isCogs),
  }));
 const topFiveCents=rows.reduce((s,row)=>s+cents(row.amount),0);
 const concentration=base>0?Math.round(topFiveCents/base*10000)/100:null;
 const findings=[];
 if(rows.length){
  const largest=rows[0];
  findings.push('El gasto principal del período es '+largest.name+' ('+
    largest.amount.toLocaleString('en-US',{style:'currency',currency:'USD'})+
    '). Revisar qué actividades lo generan y si se ajusta al volumen de operaciones.');
  if(concentration!==null)
   findings.push('Las cinco cuentas de mayor gasto representan '+concentration.toFixed(1)+
    '% del total neto de gastos contabilizados. Evaluar dónde pueden lograrse eficiencias sin afectar el servicio.');
  findings.push('Antes de aprobar ahorros, diferenciar costos necesarios para vender de gastos administrativos y revisar cualquier movimiento extraordinario.');
 }
 return {rows,concentration,topFiveTotal:topFiveCents/100,findings};
}
