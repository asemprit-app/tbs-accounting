// Infer the signed amount convention for each credit-card liability account
// from its *previously approved* statement reconciliations. Some feeds import
// purchases as positive/payments as negative; others do the opposite.
// Do not use the account name or a client-specific exception. An ambiguous
// history preserves the existing inverted-feed default.
const cent = value => Math.round((Number(value) || 0) * 100);
export function inferCreditCardSourceSigns(accounts, transactions, journalEntries, reconciliations) {
  const result = new Map();
  for (const account of accounts || []) {
    if (account.type !== 'Liability') continue;
    const code = account.code;
    const history = (reconciliations || []).filter(r => r.gl === code && r.status === 'PASS'
      && r.periodEnd && Number.isFinite(Number(r.statementBalance)));
    if (!history.length) continue;
    const entries = (transactions || []).filter(t => t.sourceGL === code && t.date && t.date <= history.reduce((m,r)=>r.periodEnd > m ? r.periodEnd : m,''));
    const journals = [];
    for (const je of journalEntries || []) {
      if (!je.date) continue;
      for (const l of je.lines || []) {
        if (l.gl !== code) continue;
        journals.push({date:je.date,amount:(Number(l.credit) || 0) - (Number(l.debit) || 0)});
      }
    }
    let rawMatches=0, reversedMatches=0, rawError=0, reversedError=0;
    for (const r of history) {
      const raw = entries.filter(t => t.date <= r.periodEnd).reduce((sum,t)=>sum + (Number(t.amount)||0),0);
      const journal = journals.filter(j=>j.date<=r.periodEnd).reduce((sum,j)=>sum+j.amount,0);
      const target=cent(r.statementBalance);
      const rd=Math.abs(target - cent(raw+journal));
      const rev=Math.abs(target - cent(-raw+journal));
      if (rd<=1) rawMatches++;
      if (rev<=1) reversedMatches++;
      rawError += rd;
      reversedError += rev;
    }
    // Two historical exact matches give evidence of the convention without
    // assuming that isolated zero-balance/old snapshots are reliable.
    if (rawMatches >= 2 && rawMatches > reversedMatches) result.set(code,1);
    else if (reversedMatches >= 2 && reversedMatches > rawMatches) result.set(code,-1);
    else if (rawMatches===reversedMatches && rawMatches>=2 && rawError<reversedError) result.set(code,1);
    else result.set(code,-1);
  }
  return result;
}
export function liabilitySourceMovement(gl, amount, signs) {
  return (Number(amount)||0) * (signs?.get(gl) ?? -1);
}
