import test from 'node:test';
import assert from 'node:assert/strict';
import {
  transactionMatchesFilters,
  journalEntryMatchesTransactionFilters,
  visibleTransactionRows,
} from '../src/tbsTransactionListFilter.js';

const blank={dateFrom:'',dateTo:'',gl:'',sourceGL:'',status:'',amount:'',reconciled:'',sign:''};
const transactions=[
  {id:'a',date:'2026-10-05',description:'Compra papelería',amount:-120,gl:'6200',sourceGL:'1010',status:'AUTO'},
  {id:'b',date:'2026-09-01',description:'Abono tarjeta',amount:250,gl:'2020',sourceGL:'2020',status:'MATCH'},
  {id:'c',date:'2026-08-20',description:'Farmacia especial',amount:99,gl:'9999',sourceGL:'1110',status:'REVIEW'},
  {id:'d',date:'2026-07-01',description:'Sin relación',amount:-400,gl:'4000',sourceGL:'1200',status:'AUTO'},
];
test('selected category OR account OR description returns every related transaction exactly once',()=>{
 const f={...blank,gl:'6200',sourceGL:'2020'};
 const results=transactions.filter(tx=>transactionMatchesFilters(tx,f,'FARMACIA'));
 assert.deepEqual(results.map(tx=>tx.id),['a','b','c']);
 assert.equal(results.length,new Set(results.map(tx=>tx.id)).size);
});
test('strict AND option keeps only transactions meeting every active criterion',()=>{
 const f={...blank,gl:'6200',sourceGL:'1010',status:'AUTO'};
 assert.deepEqual(transactions.filter(tx=>transactionMatchesFilters(tx,f,'papelería',{matchMode:'all'})).map(t=>t.id),['a']);
 assert.deepEqual(transactions.filter(tx=>transactionMatchesFilters(tx,{...f,sourceGL:'2020'},'papelería',{matchMode:'all'})),[]);
});
test('the From and To fields form one date-range criterion, not two broad OR criteria',()=>{
 const f={...blank,dateFrom:'2026-09-01',dateTo:'2026-09-30'};
 assert.deepEqual(transactions.filter(tx=>transactionMatchesFilters(tx,f)).map(t=>t.id),['b']);
 const includingCategory={...f,gl:'6200'};
 assert.deepEqual(transactions.filter(tx=>transactionMatchesFilters(tx,includingCategory)).map(t=>t.id),['a','b']);
 assert.deepEqual(transactions.filter(tx=>transactionMatchesFilters(tx,includingCategory,'',{matchMode:'all'})),[]);
});
test('amount sign, status, and reconciliation eligibility can each independently match',()=>{
 const f={...blank,amount:'120',status:'REVIEW',reconciled:'reconciled'};
 const reconciledIds=new Set(['b']);
 const got=transactions.filter(tx=>transactionMatchesFilters(tx,f,'',{reconciledIds}));
 assert.deepEqual(got.map(tx=>tx.id),['a','b','c']);
 assert.deepEqual(transactions.filter(tx=>transactionMatchesFilters(tx,{...blank,sign:'negative'})).map(tx=>tx.id),['a','d']);
 assert.deepEqual(transactions.filter(tx=>transactionMatchesFilters(tx,{...blank,amount:'-120'})).map(tx=>tx.id),['a']);
});
test('with no active criteria all transactions are visible, and JEs remain opt-in',()=>{
 assert.equal(transactions.filter(tx=>transactionMatchesFilters(tx,blank)).length,4);
 const je={id:'je-a',date:'2026-10-05',description:'Journal Entry papelería',amount:-120,gl:'6200',isJE:true};
 assert.deepEqual(visibleTransactionRows(transactions,[je]).map(x=>x.id),['a','b','c','d']);
 assert.deepEqual(visibleTransactionRows(transactions,[je],true).map(x=>x.id),['a','b','c','d','je-a']);
});
test('optional JE is included by matching a selected criterion, never by a missing bank/reconciliation field',()=>{
 const je={id:'je-a',date:'2026-10-05',description:'Journal Entry papelería',amount:-120,gl:'6200',isJE:true};
 assert.equal(journalEntryMatchesTransactionFilters(je,{...blank,gl:'6200',sourceGL:'1010'},'', 'any'),true);
 assert.equal(journalEntryMatchesTransactionFilters(je,{...blank,gl:'6200',sourceGL:'1010'},'', 'all'),false);
 assert.equal(journalEntryMatchesTransactionFilters(je,{...blank,sourceGL:'__unassigned__'},'', 'any'),false);
 assert.equal(journalEntryMatchesTransactionFilters(je,{...blank,reconciled:'none'},'', 'any'),false);
 assert.equal(journalEntryMatchesTransactionFilters(je,{...blank,status:'AUTO'},'', 'any'),false);
});
