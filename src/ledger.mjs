// Bank-register amounts are signed cash movements. Category postings are
// the opposite debit/credit; presentation uses each account's normal balance.
export function buildPostings(transactions, journalEntries, accounts) {
  const byCode = new Map(accounts.map(a => [a.code, a]));
  const debitNormal = a => a?.type === 'Asset' || a?.type === 'Expense';
  const result = [];
  for (const t of transactions) {
    const amount = Number(t.amount) || 0;
    if (t.gl && t.gl !== t.sourceGL) {
      result.push({date:t.date, gl:t.gl, amount:debitNormal(byCode.get(t.gl)) ? -amount : amount, source:'Transaction'});
    }
    if (t.sourceGL) {
      result.push({date:t.date, gl:t.sourceGL, amount:debitNormal(byCode.get(t.sourceGL)) ? amount : -amount, source:'Transaction'});
    }
  }
  for (const je of journalEntries) {
    for (const l of je.lines || []) {
      if (!l.gl) continue;
      const debit = Number(l.debit) || 0, credit = Number(l.credit) || 0;
      result.push({date:je.date, gl:l.gl, amount:debitNormal(byCode.get(l.gl)) ? debit-credit : credit-debit, source:'Journal Entry'});
    }
  }
  return result;
}

export function invoicePaidThrough(inv, date) {
  if (Array.isArray(inv.payments) && inv.payments.length) {
    return inv.payments.filter(p => !p.date || p.date <= date)
      .reduce((s,p) => s + (Number(p.amount) || 0), 0);
  }
  // Legacy aggregate payments have no recoverable payment date.
  return Number(inv.paid) || 0;
}
export function invoiceOpenThrough(inv, date, total) {
  return inv.date > date ? 0 : Math.max(0, total(inv) - invoicePaidThrough(inv,date));
}
