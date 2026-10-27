import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  findTradeReceivableCode, invoicePaidAsOfDate, invoiceReceivableEntries,
  linkedInvoiceTransactionIds, arBankCategoryPosting,
} from '../src/tbsAccountsReceivable.js';

const accounts = [
  {code:'1010',name:'Operating Bank',type:'Asset'},
  {code:'1100',name:'Accounts Receivable',type:'Asset'},
  {code:'1150',name:'Reimbursable Expenses Receivable',type:'Asset'},
  {code:'4000',name:'Service Revenue',type:'Revenue'},
];
const ledgerBalance = (entries, account, to = '9999-12-31') =>
  entries.filter(p => p.gl === account && p.date <= to).reduce((s,p) => s + p.amount, 0);

function invoice(id, amount, payments = [], opts = {}) {
  const paid = payments.reduce((s,p) => s + p.amount, 0);
  return {id, number:'INV-'+id, client:'Example Client', date:'2026-09-01',
    amount, payments, paid, status:paid >= amount ? 'Paid' : paid > 0 ? 'Partial' : 'Pending', ...opts};
}
const total = i => i.amount;

test('Trade A/R account is distinct from reimbursable receivable and Revenue', () => {
  assert.equal(findTradeReceivableCode(accounts), '1100');
  assert.equal(findTradeReceivableCode([accounts[2]]), '');
  assert.equal(findTradeReceivableCode([{code:'X',name:'Trade Accounts Receivable',type:'Asset'}]),'X');
  assert.equal(findTradeReceivableCode([{code:'1100',name:'Customer Debtors',type:'Asset'}]),'1100');
});

test('Issuing a $1,000 invoice debits A/R; allocating $300 credits A/R, leaving $700', () => {
  const before = invoiceReceivableEntries([invoice('1',1000)],total,'1100');
  assert.equal(ledgerBalance(before,'1100'),1000);
  const payment={id:'p1',date:'2026-10-20',amount:300,transactionId:'deposit1'};
  const inv=invoice('1',1000,[payment]);
  const after = invoiceReceivableEntries([inv],total,'1100');
  assert.equal(ledgerBalance(after,'1100'),700);
  assert.equal(ledgerBalance(after,'1100','2026-10-19'),1000);
  assert.equal(ledgerBalance(after,'1100','2026-10-20'),700);
  assert.equal(invoicePaidAsOfDate(inv,'2026-10-19'),0);
  assert.equal(invoicePaidAsOfDate(inv,'2026-10-20'),300);
});

test('Same $500 bank deposit allocated to two invoices reduces total A/R by $500, once', () => {
  const invs=[
    invoice('1',400,[{id:'p1',date:'2026-10-20',amount:200,transactionId:'deposit-shared'}]),
    invoice('2',700,[{id:'p2',date:'2026-10-20',amount:300,transactionId:'deposit-shared'}]),
  ];
  const entries=invoiceReceivableEntries(invs,total,'1100');
  assert.equal(ledgerBalance(entries,'1100'),600);
  const links=linkedInvoiceTransactionIds(invs);
  assert.equal(links.size,1);
  assert.equal(arBankCategoryPosting({id:'deposit-shared',gl:'1100',amount:500},'1100',links),null);
  // Bank source posting remains separate and is not removed by the A/R rule.
  const cashTransaction={id:'deposit-shared',gl:'1100',sourceGL:'1010',amount:500};
  assert.equal(cashTransaction.sourceGL,'1010');
  assert.equal(ledgerBalance(entries,'1100') + (arBankCategoryPosting(cashTransaction,'1100',links) || 0),600);
});

test('Fully paid invoices have zero A/R, payment reversal restores amount', () => {
  const paid=invoice('1',1000,[{id:'p1',date:'2026-10-20',amount:1000,transactionId:'bank1'}]);
  assert.equal(ledgerBalance(invoiceReceivableEntries([paid],total,'1100'),'1100'),0);
  const reversed=invoice('1',1000);
  assert.equal(ledgerBalance(invoiceReceivableEntries([reversed],total,'1100'),'1100'),1000);
});

test('Unmatched bank deposit coded A/R is a credit; a withdrawal is a debit', () => {
  const linked=linkedInvoiceTransactionIds([]);
  assert.equal(arBankCategoryPosting({id:'t1',gl:'1100',amount:100},'1100',linked),-100);
  assert.equal(arBankCategoryPosting({id:'t2',gl:'1100',amount:-25},'1100',linked),25);
  assert.equal(arBankCategoryPosting({id:'t3',gl:'1150',amount:100},'1100',linked),null);
});

test('Legacy aggregate paid and dated payments count once, respecting cutoffs', () => {
  const legacy=invoice('1',1000,[],{paid:250});
  assert.equal(ledgerBalance(invoiceReceivableEntries([legacy],total,'1100'),'1100'),750);
  const mixed=invoice('2',1000,[{date:'2026-11-01',amount:200,id:'p1'}],{paid:350});
  assert.equal(invoicePaidAsOfDate(mixed,'2026-10-20'),150);
  assert.equal(invoicePaidAsOfDate(mixed,'2026-12-01'),350);
  const events=invoiceReceivableEntries([mixed],total,'1100');
  assert.equal(ledgerBalance(events,'1100','2026-10-20'),850);
  assert.equal(ledgerBalance(events,'1100','2026-12-01'),650);
});

test('Balance Sheet, Trial Balance, and A/R drilldown share receivable movements', () => {
  const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  assert.ok(app.includes('list.push(...invoiceReceivableEntries(invoices, invoiceTotal, tradeReceivableGL))'));
  assert.ok(app.includes('const amount = arBankCategoryPosting(t, tradeReceivableGL, linkedIds)'));
  assert.ok(app.includes('if (amount !== null) list.push'));
  assert.ok(app.includes('cardAwareTransactionPostings(transactions, accounts)'));
  assert.ok(app.includes('transactionPostings'));
  assert.ok(app.includes('p.gl === tradeReceivableGL'));
  // A/R stays special-cased while source movements are now provided by a shared helper.
  assert.ok(app.includes("} else if (gl === tradeReceivableGL && tradeReceivableGL) {"));
  assert.ok(app.includes("return invoicePaidAsOfDate(inv, asOfDate)"));
  assert.ok(app.includes("const bal = balanceAsOf(a.code, to)"));
  assert.ok(app.includes("const assetRows = assetAccts.map(a => ({ ...a, value: balanceAsOf(a.code, to) }))"));
});
