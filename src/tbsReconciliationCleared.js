// Reconciliation is based on verified/cleared entries. Unchecked transactions
// may be outstanding and are NOT automatically an error or an approval.
const moneyCents = value => Math.round((Number(value) || 0) * 100);
export function clearedReconciliationSnapshot({openingBalance=0,postings=[],verifiedIds=[],statementBalance=0}) {
  const checked=new Set(verifiedIds);
  const cleared=postings.filter(p=>checked.has(p.id));
  const outstanding=postings.filter(p=>!checked.has(p.id));
  const clearedCents=moneyCents(openingBalance)+cleared.reduce((s,p)=>s+moneyCents(p.amount),0);
  const outstandingCents=outstanding.reduce((s,p)=>s+moneyCents(p.amount),0);
  const differenceCents=moneyCents(statementBalance)-clearedCents;
  return {
    openingBalance:moneyCents(openingBalance)/100,
    clearedBalance:clearedCents/100,
    difference:differenceCents/100,
    balanced:differenceCents===0,
    checkedCount:cleared.length,
    outstandingCount:outstanding.length,
    outstandingAmount:outstandingCents/100,
    fullLedgerBalance:(clearedCents+outstandingCents)/100,
  };
}
