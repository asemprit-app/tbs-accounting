import { invoicePaidAsOfDate, linkedInvoiceTransactionIds } from './tbsAccountsReceivable.js';

const round=value=>Math.round((Number(value)||0)*100)/100;
export function bankReconciliationDrift(reconciliations=[],postings=[],accounts=[],asOf='') {
  const byCode=new Map(accounts.map(a=>[a.code,a]));
  const latest=new Map();
  for(const r of reconciliations) {
    if(r.status!=='PASS'||r.periodEnd!==asOf||byCode.get(r.gl)?.type!=='Asset')continue;
    if(!latest.has(r.gl)||(latest.get(r.gl).createdAt||'')<(r.createdAt||''))latest.set(r.gl,r);
  }
  return [...latest.values()].map(r=>{
    const live=round(postings.filter(p=>p.gl===r.gl&&p.date<=asOf).reduce((s,p)=>s+(Number(p.amount)||0),0));
    const statement=round(r.statementBalance);
    return {gl:r.gl,name:byCode.get(r.gl)?.name||r.gl,statement,live,
      variance:round(live-statement)};
  }).filter(r=>Math.abs(r.variance)>=.01);
}

export function receivableLedgerBridge({invoices=[],invoiceTotal,postings=[],transactions=[],arCode,asOf=''}) {
  if(!arCode)return null;
  const issued=invoices.filter(i=>i.date && i.date<=asOf);
  // No invoice subledger exists for this cutoff. A/R might legitimately be
  // maintained by opening balances or manual journal entries (e.g. CEnergyS).
  // Zero invoices is missing evidence, NOT a subledger balance of $0 to
  // compare against the general ledger. Do not fabricate a discrepancy.
  if (issued.length === 0) return null;
  const subledger=round(issued.reduce((sum,i)=>sum+(Number(invoiceTotal(i))||0)-invoicePaidAsOfDate(i,asOf),0));
  const generalLedger=round(postings.filter(p=>p.gl===arCode&&p.date<=asOf).reduce((s,p)=>s+(Number(p.amount)||0),0));
  const linked=linkedInvoiceTransactionIds(invoices);
  const unmatched=transactions.filter(t=>t.gl===arCode&&t.sourceGL!==arCode&&t.date<=asOf&&!linked.has(t.id));
  const unmatchedAmount=round(unmatched.reduce((sum,t)=>sum+(Number(t.amount)||0),0));
  return {subledger,generalLedger,variance:round(generalLedger-subledger),
    unmatchedCount:unmatched.length,unmatchedAmount};
}
