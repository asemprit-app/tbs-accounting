import test from 'node:test';
import assert from 'node:assert/strict';
import {cardAwareTransactionPostings,matchMirroredAssetTransfers} from '../src/tbsCardPaymentAccounting.js';
import {bankReconciliationDrift} from '../src/tbsAccountingDiagnostics.js';

const client='pan-mi-sol';
const accounts=[
 {code:'1010',name:'BPPR Commercial',type:'Asset'},
 {code:'1011',name:'BPPR Commercial 2',type:'Asset'},
 {code:'4010',name:'Sales',type:'Revenue'},
 {code:'5010',name:'Expenses',type:'Expense'},
];
const amounts=[330,800,900,150,1080,200,1388.59,1628,50,240,286.56,1069,240,340,1300,250,1030,320,1250];
const dates=[
 '2026-01-15','2026-01-20','2026-02-20','2026-03-16','2026-03-20',
 '2026-04-16','2026-04-20','2026-05-14','2026-06-01','2026-06-15',
 '2026-06-18','2026-06-22','2026-06-25','2026-07-15','2026-07-20',
 '2026-08-12','2026-08-20','2026-09-14','2026-09-21',
];
function pair(i,amount=amounts[i]){
 return [
  {id:'out-'+i,client_id:client,date:dates[i],description:'TELEPAGO TRANSFERENCIA A CUENTA CHEQUES',
   sourceGL:'1010',gl:'1011',amount:-amount},
  {id:'in-'+i,client_id:client,date:dates[i],description:'TELEPAGO TRANSFERENCIA DE FONDOS',
   sourceGL:'1011',gl:'1010',amount:amount},
 ];
}
function sumCents(items,code,to='2026-09-30'){
 return items.filter(p=>p.gl===code&&p.date<=to)
  .reduce((sum,p)=>sum+Math.round(p.amount*100),0)/100;
}
test('Pan Mi Sol: 19 distinct reciprocal same-day bank transfers total $12,852.15',()=>{
 const rows=amounts.flatMap((_,i)=>pair(i));
 const before=JSON.stringify(rows);
 const matched=matchMirroredAssetTransfers(rows,accounts);
 assert.equal(matched.length,19);
 assert.equal(Math.round(matched.reduce((a,b)=>a+b.amount,0)*100)/100,12852.15);
 assert.equal(JSON.stringify(rows),before,'mirrored transfer detection must not mutate bank feed rows');
 const result=cardAwareTransactionPostings(rows,accounts);
 assert.equal(result.bankTransfers.length,19);
 assert.equal(result.postings.length,38,'keep one source entry from each bank and no category duplicates');
 assert.equal(sumCents(result.postings,'1010'),-12852.15);
 assert.equal(sumCents(result.postings,'1011'),12852.15);
});
test('Pan Mi Sol: Reports bank balances agree with Sep 30 2026 statements and PASS drift is zero',()=>{
 const rows=amounts.flatMap((_,i)=>pair(i));
 // Actual source-side net change outside mirrored transfers for Jan-Sep 2026.
 rows.push(
  {id:'other-1010',client_id:client,date:'2026-09-30',sourceGL:'1010',gl:'4010',amount:10850.79,description:'Other bank activities net'},
  {id:'other-1011',client_id:client,date:'2026-09-30',sourceGL:'1011',gl:'5010',amount:-12868.11,description:'Other bank activities net'},
 );
 const snapshot=JSON.stringify(rows);
 const {postings,bankTransfers}=cardAwareTransactionPostings(rows,accounts);
 assert.equal(bankTransfers.length,19);
 const ledger=[...postings,
  {gl:'1010',date:'2025-12-31',amount:2105.34,source:'Journal Entry'},
  {gl:'1011',date:'2025-12-31',amount:17.23,source:'Journal Entry'},
 ];
 assert.equal(sumCents(ledger,'1010'),103.98);
 assert.equal(sumCents(ledger,'1011'),1.27);
 assert.deepEqual(bankReconciliationDrift([
  {gl:'1010',status:'PASS',periodEnd:'2026-09-30',statementBalance:103.98},
  {gl:'1011',status:'PASS',periodEnd:'2026-09-30',statementBalance:1.27},
 ],ledger,accounts,'2026-09-30'),[]);
 assert.equal(JSON.stringify(rows),snapshot);
});
test('single-side bank transfer still receives its one necessary counterpart posting',()=>{
 const outgoing=pair(0)[0];
 const {postings,bankTransfers}=cardAwareTransactionPostings([outgoing],accounts);
 assert.equal(bankTransfers.length,0);
 assert.equal(postings.length,2);
 assert.equal(sumCents(postings,'1010'),-330);
 assert.equal(sumCents(postings,'1011'),330);
});
test('do not match same amount across different dates, clients, or without reciprocal account classification',()=>{
 const [out,incoming]=pair(0);
 for(const changed of [
  {...incoming,date:'2026-01-16'},
  {...incoming,client_id:'another-client'},
  {...incoming,gl:'4010'},
  {...incoming,amount:331},
 ]) {
  assert.deepEqual(matchMirroredAssetTransfers([out,changed],accounts),[]);
 }
});
test('ambiguous same-day matching does not guess: original category postings are preserved',()=>{
 const [out,incoming]=pair(0);
 const duplicate={...incoming,id:'in-duplicate'};
 assert.deepEqual(matchMirroredAssetTransfers([out,incoming,duplicate],accounts),[]);
 assert.equal(cardAwareTransactionPostings([out,incoming,duplicate],accounts).postings.length,6);
});
test('normal bank expenses and invoices are not treated as mirrored transfers',()=>{
 const transactions=[
  {id:'expense',client_id:client,date:'2026-09-22',sourceGL:'1010',gl:'5010',amount:-99},
  {id:'sale',client_id:client,date:'2026-09-22',sourceGL:'1011',gl:'4010',amount:99},
 ];
 const {postings,bankTransfers}=cardAwareTransactionPostings(transactions,accounts);
 assert.equal(bankTransfers.length,0);
 assert.equal(postings.length,4);
 assert.equal(sumCents(postings,'1010'),-99);
 assert.equal(sumCents(postings,'1011'),99);
});
