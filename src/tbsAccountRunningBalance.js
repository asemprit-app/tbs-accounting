// Running account balance for the Reports transaction drill-down.
// Monetary arithmetic is in cents to avoid cumulative floating-point noise.
// Items are in their original posting order for equal dates.
const toCents = value => Math.round((Number(value) || 0) * 100);
export function accountRunningBalance(items = [], openingAmount = 0) {
  let balance = toCents(openingAmount);
  const ordered = items.map((item, index) => ({ ...item, _originalIndex: index }))
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || a._originalIndex - b._originalIndex);
  const rows = ordered.map(({ _originalIndex, ...item }) => {
    balance += toCents(item.amount);
    return { ...item, runningBalance: balance / 100 };
  });
  const activityCents = rows.reduce((sum, row) => sum + toCents(row.amount), 0);
  return {
    rows,
    openingBalance: toCents(openingAmount) / 100,
    periodActivity: activityCents / 100,
    endingBalance: balance / 100,
  };
}
