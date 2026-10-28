import test from 'node:test';
import assert from 'node:assert/strict';
import {inferCreditCardSourceSigns,liabilitySourceMovement} from '../src/tbsCreditCardStatementSigns.js';

const accounts=[{code:'2020',type:'Liability'},{code:'2021',type:'Liability'},{code:'1010',type:'Asset'}];
const journalEntries=[{date:'2025-12-31',lines:[{gl:'2020',debit:'',credit:'620.29'}]}];
const tx=[
  {sourceGL:'2020',date:'2026-01-04',amount:-499.42},
  {sourceGL:'2020',date:'2026-02-05',amount:14.19},
  {sourceGL:'2020',date:'2026-08-08',amount:1054.76},
  {sourceGL:'2020',date:'2026-09-08',amount:-1004.93},
];
const rec=[
  {gl:'2020',status:'PASS',periodEnd:'2026-01-12',statementBalance:120.87},
  {gl:'2020',status:'PASS',periodEnd:'2026-02-11',statementBalance:135.06},
];
test('Panda-like positive-purchases/negative-payments card retains raw statement sign',()=>{
  const signs=inferCreditCardSourceSigns(accounts,tx,journalEntries,rec);
  assert.equal(signs.get('2020'),1);
  assert.equal(liabilitySourceMovement('2020',-1189.82,signs),-1189.82);
});
test('Other clients keep inverted source sign when historically proven',()=>{
  const signed=[
    {sourceGL:'2021',date:'2026-01-02',amount:-400},
    {sourceGL:'2021',date:'2026-02-02',amount:100}
  ];
  const rs=[
    {gl:'2021',periodEnd:'2026-01-11',statementBalance:400,status:'PASS'},
    {gl:'2021',periodEnd:'2026-02-11',statementBalance:300,status:'PASS'}
  ];
  const signs=inferCreditCardSourceSigns(accounts,signed,[],rs);
  assert.equal(signs.get('2021'),-1);
});
test('Unproven card formats retain legacy convention rather than guessing',()=>{
  assert.equal(liabilitySourceMovement('2020',100,new Map()),-100);
  assert.equal(inferCreditCardSourceSigns(accounts,tx,journalEntries,[rec[0]]).get('2020'),-1);
});

test('Panda observed Sep 11 balance is 184.89 after Aug opening and four card transactions',()=>{
  const ledger=[
    {date:'2026-08-19',amount:10.02},
    {date:'2026-09-01',amount:20.17},
    {date:'2026-09-04',amount:154.70},
    {date:'2026-09-08',amount:-1189.82},
  ];
  const sign = inferCreditCardSourceSigns(accounts, tx, journalEntries, rec).get('2020');
  const book = 1189.82 + ledger.reduce((total,t)=>total+liabilitySourceMovement('2020',t.amount,new Map([['2020',sign]])),0);
  assert.equal(Number(book.toFixed(2)),184.89);
  assert.equal(Number((184.89-book).toFixed(2)),0);
});

