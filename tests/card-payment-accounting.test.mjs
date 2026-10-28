import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cardAwareTransactionPostings,matchMirroredCardPayments,potentiallyUnmatchedCardTransfers,sourceBalanceMovement,categoryBalanceMovement} from '../src/tbsCardPaymentAccounting.js';
const accounts=[{code:'BANK',type:'Asset'},{code:'CARD',type:'Liability'},{code:'EXP',type:'Expense'},{code:'EQUITY',type:'Equity'},{code:'INCOME',type:'Revenue'},{code:'EQUIP',type:'Asset'}];
const sum=(postings,gl)=>postings.filter(p=>p.gl===gl).reduce((n,p)=>n+p.amount,0);
const bank=(id='bank')=>({id,date:'2026-09-24',description:'CC PAYMENT',sourceGL:'BANK',gl:'CARD',amount:-1000});
const card=(id='card')=>({id,date:'2026-09-26',description:'BANK PAYMENT',sourceGL:'CARD',gl:'BANK',amount:1000});

test('bank-only payment debits card liability and credits cash',()=>{
  const {postings,matches}=cardAwareTransactionPostings([bank()],accounts);
  assert.equal(matches.length,0);
  assert.equal(sum(postings,'BANK'),-1000);
  assert.equal(sum(postings,'CARD'),-1000);
});
test('card-only payment reduces card liability and credits bank asset',()=>{
  const {postings}=cardAwareTransactionPostings([card()],accounts);
  assert.equal(sum(postings,'BANK'),-1000);
  assert.equal(sum(postings,'CARD'),-1000);
});
test('two feed rows are one transfer, not two transfers, nor offsets',()=>{
  const {postings,matches}=cardAwareTransactionPostings([bank(),card()],accounts);
  assert.equal(matches.length,1);
  assert.equal(postings.length,4); // first feed + second feed + offset
  assert.equal(sum(postings,'BANK'),-1000);
  assert.equal(sum(postings,'CARD'),-1000);
  assert.equal(sum(postings,'EXP'),0);
  const asOf = postings.filter(p => p.date <= '2026-09-24');
  assert.equal(sum(asOf,'BANK'),-1000);
  assert.equal(sum(asOf,'CARD'),-1000);
});
test('legacy card self-category pairs with bank feed and is not double counted',()=>{
  const self={...card(),gl:'CARD'};
  const {postings,matches}=cardAwareTransactionPostings([bank(),self],accounts);
  assert.equal(matches.length,1);
  assert.equal(postings.length,4);
  assert.equal(sum(postings,'CARD'),-1000);
});
test('card charge increases debt and expense; opposite signs on card payment',()=>{
  const charge={id:'charge',date:'2026-09-25',sourceGL:'CARD',gl:'EXP',amount:-200};
  const {postings}=cardAwareTransactionPostings([charge],accounts);
  assert.equal(sum(postings,'CARD'),200);
  assert.equal(sum(postings,'EXP'),200);
});
test('buying a balance-sheet asset from bank increases asset, decreases cash',()=>{
  const purchase={id:'equip',date:'2026-09-25',sourceGL:'BANK',gl:'EQUIP',amount:-300};
  const {postings}=cardAwareTransactionPostings([purchase],accounts);
  assert.equal(sum(postings,'BANK'),-300);
  assert.equal(sum(postings,'EQUIP'),300);
});
test('bank withdrawal to repay shareholder equity decreases equity and cash',()=>{
  const t={id:'draw',date:'2026-09-25',sourceGL:'BANK',gl:'EQUITY',amount:-100};
  const {postings}=cardAwareTransactionPostings([t],accounts);
  assert.equal(sum(postings,'BANK'),-100);
  assert.equal(sum(postings,'EQUITY'),-100);
});
test('same amount paid twice with ambiguous pairs is not automatically matched',()=>{
  const b1=bank('b1'), b2=bank('b2'), c=card('c');
  assert.equal(matchMirroredCardPayments([b1,b2,c],accounts).length,0);
});
test('mirror matching needs both accounts and nearby dates',()=>{
  assert.equal(matchMirroredCardPayments([bank(),{...card(),date:'2026-10-12'}],accounts).length,0);
  assert.equal(matchMirroredCardPayments([bank(),{...card(),gl:'EXP'}],accounts).length,0);
});
test('category pointing to same source never reverses bank/card movement',()=>{
  const {postings}=cardAwareTransactionPostings([{...card(),gl:'CARD'}],accounts);
  assert.equal(postings.length,1);
  assert.equal(sum(postings,'CARD'),-1000);
});
test('source-liability sign aligns with bank reconciliation sourceAccountAmount',()=>{
  const byCode=new Map(accounts.map(a=>[a.code,a]));
  assert.equal(sourceBalanceMovement(card(),byCode),-1000);
  assert.equal(categoryBalanceMovement(card(),byCode),-1000);
});

test('same-day reciprocal feeds do not double count and produce only two legs', () => {
  const b=bank();
  const c={...card(),date:b.date};
  const {postings,matches}=cardAwareTransactionPostings([b,c],accounts);
  assert.equal(matches.length,1);
  assert.equal(postings.length,2);
  assert.equal(sum(postings,'BANK'),-1000);
  assert.equal(sum(postings,'CARD'),-1000);
});
test('card-side feed can precede bank-side feed without temporary report imbalance',()=>{
  const b=bank();
  const c={...card(),date:'2026-09-22'};
  const {postings}=cardAwareTransactionPostings([b,c],accounts);
  const beforeBank=postings.filter(p=>p.date< b.date);
  assert.equal(sum(beforeBank,'BANK'),-1000);
  assert.equal(sum(beforeBank,'CARD'),-1000);
  assert.equal(sum(postings,'BANK'),-1000);
  assert.equal(sum(postings,'CARD'),-1000);
});
test('card self-coded payment before bank feed keeps ending liability correct',()=>{
  const b=bank();
  const c={...card(),date:'2026-09-22',gl:'CARD'};
  const {postings}=cardAwareTransactionPostings([b,c],accounts);
  assert.equal(sum(postings,'BANK'),-1000);
  assert.equal(sum(postings,'CARD'),-1000);
});

test('misclassified counterpart is flagged for human review, never silently reclassified',()=>{
  const b={...bank(),gl:'EQUITY'}, c=card();
  const {postings,matches}=cardAwareTransactionPostings([b,c],accounts);
  assert.equal(matches.length,0);
  assert.equal(potentiallyUnmatchedCardTransfers([b,c],accounts).length,1);
  assert.equal(sum(postings,'EQUITY'),-1000); // leave user classification unchanged
});
test('paired card payment is not reported as needing review',()=>{
  assert.equal(potentiallyUnmatchedCardTransfers([bank(),card()],accounts).length,0);
});

test('Panda-like positive card purchases and negative card payments keep statement signs',()=>{
  const signs=new Map([['CARD',1]]);
  const charge={id:'new-charge',date:'2026-09-01',sourceGL:'CARD',gl:'EXP',amount:154.70};
  const payment={id:'card-payment',date:'2026-09-08',sourceGL:'CARD',gl:'BANK',amount:-1189.82};
  const withdrawal={id:'bank-payment',date:'2026-09-09',sourceGL:'BANK',gl:'CARD',amount:-1189.82};
  const {postings,matches}=cardAwareTransactionPostings([charge,payment,withdrawal],accounts,signs);
  assert.equal(matches.length,1);
  assert.equal(sum(postings,'CARD'),154.70-1189.82);
  assert.equal(sum(postings,'EXP'),154.70);
  assert.equal(sum(postings,'BANK'),-1189.82);
});
test('Panda like card payment kept to one ledger movement with two statement dates',()=>{
  const signs=new Map([['CARD',1]]);
  const withdrawal={id:'b',date:'2026-09-09',sourceGL:'BANK',gl:'CARD',amount:-1189.82};
  const receipt={id:'c',date:'2026-09-08',sourceGL:'CARD',gl:'BANK',amount:-1189.82};
  const {postings,matches}=cardAwareTransactionPostings([withdrawal,receipt],accounts,signs);
  assert.equal(matches.length,1);
  assert.equal(sum(postings,'BANK'),-1189.82);
  assert.equal(sum(postings,'CARD'),-1189.82);
});
