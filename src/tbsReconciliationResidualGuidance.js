// Diagnose the remaining difference without fabricating accounting entries.
// Clearing all boxes does not make a statement match when source data differs.
const cents=value=>Math.round((Number(value)||0)*100);
export function reconciliationResidualGuidance({
  openingBalance=0,clearedBalance=0,statementBalance=0,
  checkedCount=0,outstandingCount=0,periodCount=0,accountType='Asset'
}={}){
 const opening=cents(openingBalance),book=cents(clearedBalance),statement=cents(statementBalance);
 const difference=statement-book;
 const fullyMarked=periodCount>0&&checkedCount===periodCount&&outstandingCount===0;
 if(!fullyMarked||difference===0)return null;
 const positive=difference>0;
 return {
  fullyMarked:true,unresolved:true,amount:Math.abs(difference)/100,
  difference:difference/100,
  openingBalance:opening/100,clearedBalance:book/100,statementBalance:statement/100,
  actualMovement:(book-opening)/100,
  expectedMovement:(statement-opening)/100,
  checkedCount,
  hint:accountType==='Liability'
    ?(positive
     ?'Revise cargos omitidos o registrados por menos importe, pagos registrados en exceso y errores de fecha o de saldo del estado.'
     :'Revise pagos omitidos o registrados por menos importe, cargos registrados en exceso y errores de fecha o de saldo del estado.')
    :(positive
     ?'Revise depósitos omitidos, retiros registrados en exceso y errores de fecha o de saldo del estado.'
     :'Revise retiros omitidos, depósitos registrados en exceso y errores de fecha o de saldo del estado.'),
 };
}
