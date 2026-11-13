// Transaction searches default to imported/manual transactions only.
// Journal entries have no bank/source account, reconciliation flag or
// transaction status; never show them as if those fields matched.
export function journalEntryMatchesTransactionFilters(entry, filters = {}, search = '') {
  if (!entry?.isJE) return false;
  if (filters.dateFrom && entry.date < filters.dateFrom) return false;
  if (filters.dateTo && entry.date > filters.dateTo) return false;
  // Uncategorized is a transaction classification, not a journal entry.
  if (filters.gl?.startsWith('__uncat')) return false;
  if (filters.gl && entry.gl !== filters.gl) return false;
  // A journal line does not carry transaction source account/status/approval.
  if (filters.sourceGL || filters.status || filters.reconciled) return false;
  if (String(filters.amount || '').trim()) {
    const requested = Number(filters.amount);
    if (!Number.isFinite(requested) ||
        Math.abs(Math.abs(Number(entry.amount) || 0) - Math.abs(requested)) > 0.005) return false;
  }
  if (filters.sign === 'positive' && Number(entry.amount) < 0) return false;
  if (filters.sign === 'negative' && Number(entry.amount) >= 0) return false;
  const needle = String(search || '').trim().toUpperCase();
  if (needle && !String(entry.description || '').toUpperCase().includes(needle)) return false;
  return true;
}

export function visibleTransactionRows(transactions = [], journalEntries = [], showJournalEntries = false) {
  // By default show only transactions; adding journal lines always requires
  // an intentional opt-in. The caller is responsible for filtering each list.
  return showJournalEntries ? [...transactions, ...journalEntries] : [...transactions];
}
