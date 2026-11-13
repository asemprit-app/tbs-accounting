// Book Balance presentation is independent from the accounting database.
// Approved reconciliations may legitimately have unchecked historical items.
// Such items are informational unless the VERIFIED book balance no longer
// matches the statement. Never conceal a real post-approval difference.
const cents = v => Math.round((Number(v) || 0) * 100);

export function reconciliationBookPresentation(reconciliation = {}, snapshot = {}) {
  const statement = cents(reconciliation.statementBalance);
  const storedBook = cents(reconciliation.ledgerBalance);
  const storedDifference = cents(reconciliation.difference);
  const currentBook = cents(snapshot.clearedBalance);
  const currentDifference = statement - currentBook;
  const approved = reconciliation.status === 'PASS'
    && storedDifference === 0 && storedBook === statement && currentDifference === 0;
  const verifiedButChanged = reconciliation.status === 'PASS' && !approved;
  const outstandingCount = Math.max(0, Number(snapshot.outstandingCount) || 0);
  return {
    approved,
    needsReview: !approved,
    statusLabel: approved
      ? 'APPROVED'
      : verifiedButChanged
        ? 'CLEARED BALANCE CHANGED — review required'
        : currentDifference === 0
          ? 'BALANCED — save review'
          : 'PENDING REVIEW',
    // A PASS statement is not an error just because older entries are excluded.
    // An info tooltip preserves traceability without suggesting a false
    // Book Balance discrepancy or a monthly-close blocker.
    outstandingInfo: approved && outstandingCount > 0,
    outstandingWarning: !approved && outstandingCount > 0,
    outstandingCount,
    currentDifference: currentDifference / 100,
  };
}

export function reconciliationOutstandingExplanation(view = {}, amount = 0) {
  const count = view.outstandingCount || 0;
  if (!count) return '';
  const net = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
    .format(Number(amount) || 0);
  if (view.approved) {
    return `${count} unverified item(s), net ${net}, were excluded from this approved
statement reconciliation. They do not change the approved Book Balance or its
$0.00 difference. Review separately if they should be verified on a statement.`
      .replace(/\s+/g, ' ').trim();
  }
  return `${count} unverified item(s), net ${net}, are not included in the
cleared Book Balance. Review before approving this reconciliation.`
    .replace(/\s+/g, ' ').trim();
}
