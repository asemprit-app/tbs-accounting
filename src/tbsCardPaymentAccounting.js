// A posted credit-card payment moves BOTH the bank asset and the credit-card
// liability down. Both statement feeds may contain the same transfer.
// This is a read-only reporting adapter: NEVER alters bank transactions,
// reconciliation marks or customer history.
const cents = value => Math.round((Number(value) || 0) * 100);
const days = date => {
  const time = Date.parse(String(date || '') + 'T12:00:00Z');
  return Number.isFinite(time) ? Math.floor(time / 86400000) : NaN;
};
const isAsset = type => type === 'Asset';
const isLiability = type => type === 'Liability';

export function sourceBalanceMovement(transaction, accountsByCode) {
  const raw = Number(transaction.amount) || 0;
  // The reconciliation engine already uses this convention. For a credit
  // card, a positive statement payment decreases the liability.
  return isLiability(accountsByCode.get(transaction.sourceGL)?.type) ? -raw : raw;
}
export function categoryBalanceMovement(transaction, accountsByCode) {
  const raw = Number(transaction.amount) || 0;
  const targetType = accountsByCode.get(transaction.gl)?.type;
  // Category postings are the other side of the source-account movement.
  // Debit-normal assets/expenses move opposite the bank feed amount.
  return isAsset(targetType) || targetType === 'Expense' ? -raw : raw;
}

export function matchMirroredCardPayments(transactions, accounts) {
  const byCode = new Map(accounts.map(a => [a.code, a]));
  const bank = transactions.filter(t => isAsset(byCode.get(t.sourceGL)?.type) && cents(t.amount) < 0 && t.sourceGL !== t.gl);
  const card = transactions.filter(t => isLiability(byCode.get(t.sourceGL)?.type) && cents(t.amount) > 0);
  const cardByAmount = new Map();
  for (const c of card) {
    const key = cents(c.amount);
    if (!cardByAmount.has(key)) cardByAmount.set(key, []);
    cardByAmount.get(key).push(c);
  }
  const candidates = [];
  for (const b of bank) {
    for (const c of cardByAmount.get(-cents(b.amount)) || []) {
      if (!b.id || !c.id || b.id === c.id) continue;
      if (b.client_id && c.client_id && b.client_id !== c.client_id) continue;
      if (Math.abs(days(b.date) - days(c.date)) > 5) continue;
      // Both statements must explicitly identify the opposite account. Also
      // support older card imports categorized back to their own card account.
      if (b.gl !== c.sourceGL || (c.gl !== b.sourceGL && c.gl !== c.sourceGL)) continue;
      candidates.push({bankId:b.id,cardId:c.id,amount:Math.abs(Number(b.amount)),bankGL:b.sourceGL,cardGL:c.sourceGL});
    }
  }
  const bankCounts = new Map(), cardCounts = new Map();
  for (const p of candidates) {
    bankCounts.set(p.bankId, (bankCounts.get(p.bankId)||0)+1);
    cardCounts.set(p.cardId, (cardCounts.get(p.cardId)||0)+1);
  }
  // Never guess among two payments with identical dates and amounts.
  return candidates.filter(p => bankCounts.get(p.bankId) === 1 && cardCounts.get(p.cardId) === 1);
}

export function potentiallyUnmatchedCardTransfers(transactions, accounts) {
  const byCode = new Map(accounts.map(a => [a.code,a]));
  const matched = new Set(matchMirroredCardPayments(transactions, accounts)
    .flatMap(m => [`${m.bankId}|${m.cardId}`]));
  const cardByAmount = new Map();
  for (const c of transactions) {
    if (!isLiability(byCode.get(c.sourceGL)?.type) || cents(c.amount) <= 0) continue;
    const key = cents(c.amount);
    if (!cardByAmount.has(key)) cardByAmount.set(key, []);
    cardByAmount.get(key).push(c);
  }
  const audit = [];
  for (const b of transactions) {
    if (!isAsset(byCode.get(b.sourceGL)?.type) || cents(b.amount) >= 0) continue;
    for (const c of cardByAmount.get(-cents(b.amount)) || []) {
      if (b.client_id && c.client_id && b.client_id !== c.client_id) continue;
      if (Math.abs(days(b.date) - days(c.date)) > 5) continue;
      if (!(b.gl === c.sourceGL || c.gl === b.sourceGL)) continue;
      if (matched.has(`${b.id}|${c.id}`)) continue;
      audit.push({bankId:b.id,cardId:c.id,amount:Math.abs(Number(b.amount)),
        reason:'Payment counterparts have different or incomplete account classifications'});
    }
  }
  return audit;
}

export function cardAwareTransactionPostings(transactions, accounts) {
  const byCode = new Map(accounts.map(a => [a.code,a]));
  const matches = matchMirroredCardPayments(transactions,accounts);
  const byId = new Map(transactions.map(t => [t.id,t]));
  const laterCategoryToSkip = new Set();
  const correctingPostings = new Map();

  for (const match of matches) {
    const bank = byId.get(match.bankId), card = byId.get(match.cardId);
    if (!bank || !card) continue;
    if (bank.date === card.date) {
      // Both feeds on the same day represent only two real ledger legs.
      laterCategoryToSkip.add(bank.id);
      laterCategoryToSkip.add(card.id);
      continue;
    }
    // Keep the first side's category so every historical as-of date works,
    // then offset that temporary counterpart at the second side's date.
    // This prevents a bank payment posted on Sep 30 and card receipt on Oct 1
    // from unbalancing the Sep 30 Balance Sheet.
    const first = bank.date < card.date ? bank : card;
    const second = first.id === bank.id ? card : bank;
    laterCategoryToSkip.add(second.id);
    if (first.gl && first.gl !== first.sourceGL) {
      correctingPostings.set(second.id, {
        id: `${first.id}-${second.id}-transfer-offset`, date: second.date,
        gl: first.gl, amount: -categoryBalanceMovement(first,byCode),
        source: 'Matched Transfer Adjustment',
        description: `Duplicate card-payment feed offset — ${first.description || 'payment'}`,
        transactionId: second.id,
      });
    }
  }

  const postings = [];
  for (const t of transactions) {
    if (t.sourceGL) {
      postings.push({id:`${t.id}-src`,date:t.date,gl:t.sourceGL,
        amount:sourceBalanceMovement(t,byCode),source:'Transaction',
        description:t.description,transactionId:t.id});
    }
    if (t.gl && t.gl !== t.sourceGL && !laterCategoryToSkip.has(t.id)) {
      postings.push({id:`${t.id}-cat`,date:t.date,gl:t.gl,
        amount:categoryBalanceMovement(t,byCode),source:'Transaction',
        description:t.description,transactionId:t.id,category:true});
    }
    const correction = correctingPostings.get(t.id);
    if (correction) postings.push(correction);
  }
  return {postings,matches};
}
