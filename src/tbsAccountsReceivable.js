// A/R recognition for invoices and their payments. Read-only reporting logic; no
// transaction, invoice or journal-entry records are modified by these helpers.
export function findTradeReceivableCode(accounts = []) {
  const assets = accounts.filter(a => a?.type === 'Asset');
  const normalized = name => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const exact = assets.find(a => ['accounts receivable', 'account receivable', 'trade accounts receivable', 'a/r'].includes(normalized(a.name)));
  if (exact) return exact.code;
  // Only the trade A/R account. Reimbursable Expenses Receivable is a separate account.
  const byName = assets.find(a => /accounts receivable/i.test(a.name || '') && !/reimbursable/i.test(a.name || ''));
  if (byName) return byName.code;
  return assets.find(a => String(a.code) === '1100')?.code || '';
}

const numeric = value => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export function invoicePaidAsOfDate(inv, asOfDate) {
  const payments = Array.isArray(inv?.payments) ? inv.payments : [];
  const sumPayments = payments.reduce((sum, p) => sum + numeric(p.amount), 0);
  // Old invoices may carry paid amounts without a corresponding dated payment.
  // Only the residual is legacy: never subtract the same payment twice.
  const undatedLegacyPaid = Math.max(0, numeric(inv?.paid) - sumPayments);
  const datedPaid = payments
    .filter(p => !p.date || p.date <= asOfDate)
    .reduce((sum, p) => sum + numeric(p.amount), 0);
  return undatedLegacyPaid + datedPaid;
}

export function invoiceReceivableEntries(invoices, invoiceTotal, arCode) {
  if (!arCode) return [];
  const result = [];
  for (const inv of invoices || []) {
    if (!inv?.date) continue;
    const amount = numeric(invoiceTotal(inv));
    result.push({
      date: inv.date, gl: arCode, amount,
      source: 'Invoice', description: `Invoice ${inv.number || ''} — ${inv.client || ''}`,
    });
    const payments = Array.isArray(inv.payments) ? inv.payments : [];
    const trackedTotal = payments.reduce((sum, p) => sum + numeric(p.amount), 0);
    const legacyAmount = Math.max(0, numeric(inv.paid) - trackedTotal);
    if (legacyAmount > 0) {
      result.push({
        date: inv.date, gl: arCode, amount: -legacyAmount,
        source: 'Legacy Payment', description: `Undated prior payment — Invoice ${inv.number || ''}`,
      });
    }
    for (const p of payments) {
      const paid = numeric(p.amount);
      if (!paid) continue;
      result.push({
        date: p.date || inv.date, gl: arCode, amount: -paid,
        source: 'Invoice Payment', description: `Payment — Invoice ${inv.number || ''} — ${inv.client || ''}`,
      });
    }
  }
  return result;
}

export function linkedInvoiceTransactionIds(invoices = []) {
  return new Set((invoices || []).flatMap(inv =>
    (Array.isArray(inv.payments) ? inv.payments : [])
      .map(p => p.transactionId).filter(Boolean)
  ));
}

// An invoice-linked bank deposit is ALREADY reflected by its invoice-payment
// credit above. Exclude its A/R category leg, but ALWAYS retain its bank/cash leg.
export function arBankCategoryPosting(t, arCode, linkedIds) {
  if (!arCode || t.gl !== arCode) return null;
  if (linkedIds.has(t.id)) return null;
  // Bank deposits (positive) credit/reduce receivables; withdrawals debit/increase them.
  return -numeric(t.amount);
}
