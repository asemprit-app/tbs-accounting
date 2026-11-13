// A single source of truth for the Transactions search. The date-from/to
// pair is ONE range criterion; other selected criteria can be combined using
// "any" (OR, default) or "all" (AND).
//
// Journal Entry rows are optional and lack bank source, transaction status and
// reconciliation metadata. Those missing attributes never constitute a match.
function activeChecks(entry, filters = {}, search = '', isJournal = false, reconciledIds = new Set(),
                      pendingReconciliationIds = new Set(), pendingReviewIds = []) {
  const checks = [];
  if (filters.dateFrom || filters.dateTo) {
    checks.push(Boolean(entry.date) &&
      (!filters.dateFrom || entry.date >= filters.dateFrom) &&
      (!filters.dateTo || entry.date <= filters.dateTo));
  }
  if (filters.gl) {
    const gl = filters.gl;
    if (isJournal && gl.startsWith('__uncat')) {
      checks.push(false);
    } else if (gl === '__uncat__') {
      checks.push(!entry.gl);
    } else if (gl === '__uncat_income__') {
      checks.push(!entry.gl && Number(entry.amount) >= 0);
    } else if (gl === '__uncat_expense__') {
      checks.push(!entry.gl && Number(entry.amount) < 0);
    } else {
      checks.push(entry.gl === gl);
    }
  }
  if (filters.sourceGL) {
    checks.push(!isJournal && (filters.sourceGL === '__unassigned__'
      ? !entry.sourceGL : entry.sourceGL === filters.sourceGL));
  }
  if (filters.status) {
    checks.push(!isJournal && entry.status === filters.status);
  }
  if (String(filters.amount ?? '').trim()) {
    const requested = Number(filters.amount);
    checks.push(Number.isFinite(requested) && Number.isFinite(Number(entry.amount)) &&
      Math.abs(Math.abs(Number(entry.amount)) - Math.abs(requested)) <= 0.005);
  }
  if (filters.sign) {
    checks.push(filters.sign === 'positive' ? Number(entry.amount) >= 0
      : filters.sign === 'negative' ? Number(entry.amount) < 0 : false);
  }
  if (filters.reconciled) {
    if (isJournal) {
      checks.push(false);
    } else {
      const isReconciled = reconciledIds.has(entry.id);
      const isPending = pendingReconciliationIds.has(entry.id) || pendingReviewIds.includes(entry.id);
      checks.push(filters.reconciled === 'reconciled' ? isReconciled
        : filters.reconciled === 'pending' ? isPending
        : filters.reconciled === 'none' ? !isReconciled && !isPending : false);
    }
  }
  const needle = String(search || '').trim().toUpperCase();
  if (needle) {
    checks.push(String(entry.description || '').toUpperCase().includes(needle));
  }
  return checks;
}

export function transactionMatchesFilters(entry, filters = {}, search = '',
  { matchMode = 'any', isJournal = false, reconciledIds = new Set(),
    pendingReconciliationIds = new Set(), pendingReviewIds = [] } = {}) {
  if (!entry) return false;
  const checks = activeChecks(entry, filters, search, isJournal,
    reconciledIds, pendingReconciliationIds, pendingReviewIds);
  if (!checks.length) return true;
  return matchMode === 'all' ? checks.every(Boolean) : checks.some(Boolean);
}

export function journalEntryMatchesTransactionFilters(entry, filters = {}, search = '', matchMode = 'any') {
  if (!entry?.isJE) return false;
  return transactionMatchesFilters(entry, filters, search, { matchMode, isJournal: true });
}

export function visibleTransactionRows(transactions = [], journalEntries = [], showJournalEntries = false) {
  // Only actual transactions by default. JE display requires explicit opt-in.
  // Both datasets must already be filtered before merging.
  return showJournalEntries ? [...transactions, ...journalEntries] : [...transactions];
}
