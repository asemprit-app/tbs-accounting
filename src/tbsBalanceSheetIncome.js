// Balance-sheet income is cumulative to the cutoff. Closing entries are part
// of postings, so their revenue/expense offsets are included naturally.
export function incomeThroughDate(postings, accounts, invoices, invoiceRevenueSubtotal, cutoff) {
  const types = new Map(accounts.map(a => [a.code, a.type]));
  const ledgerIncome = postings.filter(p => p.date && p.date <= cutoff).reduce((sum, p) => {
    const type = types.get(p.gl);
    return sum + (type === 'Revenue' ? Number(p.amount) || 0 : type === 'Expense' ? -(Number(p.amount) || 0) : 0);
  }, 0);
  return ledgerIncome + invoices.filter(i => i.date && i.date <= cutoff)
    .reduce((sum, i) => sum + invoiceRevenueSubtotal(i), 0);
}
