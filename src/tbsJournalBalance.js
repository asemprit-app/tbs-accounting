// Calculates the debit/credit balance of the journal entry currently being edited.
// Used for both the live indicator and validation on save.
function cents(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) : 0;
}

export function journalEntryBalance(lines = []) {
  const debitCents = lines.reduce((sum, line) => sum + cents(line.debit), 0);
  const creditCents = lines.reduce((sum, line) => sum + cents(line.credit), 0);
  const differenceCents = debitCents - creditCents;
  return {
    totalDebit: debitCents / 100,
    totalCredit: creditCents / 100,
    remaining: Math.abs(differenceCents) / 100,
    missingSide: differenceCents > 0 ? 'credit' : differenceCents < 0 ? 'debit' : null,
    balanced: debitCents > 0 && creditCents > 0 && differenceCents === 0,
  };
}
