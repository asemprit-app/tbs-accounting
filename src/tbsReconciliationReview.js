// The reconciliation ledger uses each bank transaction's sourceGL, date and amount,
// plus dated Journal Entry lines hitting the same account.
// Only changes to those inputs can invalidate an approved (PASS) reconciliation.
function approved(reconciliations) {
  return (reconciliations || []).filter(r => r.status === 'PASS');
}
function effectiveTransactionMovement(row, reconciliation) {
  return Boolean(row?.sourceGL && row.sourceGL === reconciliation.gl && row.date && row.date <= reconciliation.periodEnd);
}
export function impactedTransactionReconciliations(before, after, reconciliations) {
  if (before && after &&
      before.sourceGL === after.sourceGL &&
      before.date === after.date &&
      Number(before.amount) === Number(after.amount)) return [];
  return approved(reconciliations).filter(r =>
    effectiveTransactionMovement(before, r) || effectiveTransactionMovement(after, r)
  );
}
function journalMovementSnapshot(je, reconciliation) {
  if (!je?.date || je.date > reconciliation.periodEnd) return 0;
  return (je.lines || []).reduce((total, line) =>
    line.gl === reconciliation.gl ? total + (Number(line.debit) || 0) - (Number(line.credit) || 0) : total, 0);
}
export function impactedJournalReconciliations(before, after, reconciliations) {
  return approved(reconciliations).filter(r =>
    Math.abs(journalMovementSnapshot(before, r) - journalMovementSnapshot(after, r)) > 0.000001
  );
}
export function impactedAccountReconciliations(before, after, reconciliations) {
  if (!before || !after || before.type === after.type) return [];
  return approved(reconciliations).filter(r => r.gl === before.code || r.gl === after.code);
}
export function uniqueImpactedReconciliations(groups) {
  const seen = new Set();
  return groups.flat().filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}
export function pendingReviewReconciliations(reconciliations, impactedIds) {
  const ids = new Set(impactedIds);
  return reconciliations.map(r => ids.has(r.id) && r.status === 'PASS' ? { ...r, status: 'REVIEW' } : r);
}
export function reconciliationImpactConfirmation(impacted) {
  const periods = impacted.slice(0, 5).map(r => `${r.gl} (through ${r.periodEnd})`).join(', ');
  const more = impacted.length > 5 ? ` and ${impacted.length - 5} more` : '';
  return `This change affects ${impacted.length} approved bank reconciliation(s): ${periods}${more}.\n\nContinue? Those reconciliations will automatically be marked PENDING REVIEW. Their previous checkmarks will be preserved until you review and recalculate them.`;
}
