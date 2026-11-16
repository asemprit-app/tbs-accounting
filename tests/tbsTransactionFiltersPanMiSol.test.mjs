import test from 'node:test';
import assert from 'node:assert/strict';
import {transactionMatchesFilters,journalEntryMatchesTransactionFilters,transactionPageSelectionIds} from '../src/tbsTransactionListFilter.js';
import {fetchAllClientRows} from '../src/tbsPaginatedClientRows.js';

const septemberIncome={id:'sept-income',date:'2026-09-21',description:'VENTAS PAN MI SOL',amount:350.25,gl:'4010',sourceGL:'1010',status:'AUTO'};
const septemberExpense={id:'sept-expense',date:'2026-09-21',description:'PAGO PANADERIA',amount:-89.34,gl:'6010',sourceGL:'1010',status:'REVIEW'};
const augustIncome={...septemberIncome,id:'aug-income',date:'2026-08-21'};
const filters={dateFrom:'2026-09-01',dateTo:'2026-09-30',gl:'6010'};

test('Pan Mi Sol: default filters require both September AND category',()=>{
 assert.equal(transactionMatchesFilters(septemberIncome,filters),false);
 assert.equal(transactionMatchesFilters(septemberExpense,filters),true);
 assert.equal(transactionMatchesFilters(augustIncome,filters),false);
});
test('explicit OR combines non-date criteria but always respects the selected dates',()=>{
 const orFilters={...filters,status:'AUTO'};
 assert.equal(transactionMatchesFilters(septemberIncome,orFilters,'',{matchMode:'any'}),true);
 assert.equal(transactionMatchesFilters(septemberExpense,orFilters,'',{matchMode:'any'}),true);
 assert.equal(transactionMatchesFilters({...septemberExpense,date:'2026-08-20'},orFilters,'',{matchMode:'any'}),false);
});
test('date-only filters and invalid ranges cannot leak unrelated records',()=>{
 assert.equal(transactionMatchesFilters(septemberIncome,{dateFrom:'2026-09-01',dateTo:'2026-09-30'}),true);
 assert.equal(transactionMatchesFilters(augustIncome,{dateFrom:'2026-09-01',dateTo:'2026-09-30'}),false);
 assert.equal(transactionMatchesFilters(septemberIncome,{dateFrom:'2026-09-30',dateTo:'2026-09-01'}),false);
});
test('search, sign, status, amount and bank account can all be combined',()=>{
 const query={dateFrom:'2026-09-01',status:'AUTO',sign:'positive',amount:'350.25',sourceGL:'1010'};
 assert.equal(transactionMatchesFilters(septemberIncome,query,'ventas'),true);
 assert.equal(transactionMatchesFilters(septemberExpense,query,'pago'),false);
 assert.equal(transactionMatchesFilters(septemberIncome,query,'pago'),false);
 assert.equal(transactionMatchesFilters(septemberIncome,{...query,amount:'350.26'},'ventas'),false);
});
test('uncategorized and reconciliation states are classified correctly',()=>{
 const entry={...septemberExpense,gl:''};
 assert.equal(transactionMatchesFilters(entry,{gl:'__uncat_expense__'}),true);
 assert.equal(transactionMatchesFilters({...entry,amount:25},{gl:'__uncat_income__'}),true);
 const reconciledIds=new Set([entry.id]);
 assert.equal(transactionMatchesFilters(entry,{reconciled:'reconciled'},'',{reconciledIds}),true);
 assert.equal(transactionMatchesFilters(entry,{reconciled:'none'},'',{reconciledIds}),false);
});
test('journal entries follow date bounds and page selection excludes them',()=>{
 const journal={...septemberIncome,id:'je-one',isJE:true};
 assert.equal(journalEntryMatchesTransactionFilters(journal,{dateFrom:'2026-09-01',gl:'4010'}),true);
 assert.equal(journalEntryMatchesTransactionFilters({...journal,date:'2026-08-15'},{dateFrom:'2026-09-01',gl:'4010'},'','any'),false);
 assert.deepEqual(transactionPageSelectionIds([septemberIncome,journal,septemberExpense]),['sept-income','sept-expense']);
});
test('all 2631 records are loaded across stable 1000-row pages without duplicates',async()=>{
 const clientId='pan-mi-sol-test';
 const sample=Array.from({length:2631},(_,i)=>({
  id:String(i).padStart(7,'0'),client_id:clientId,date:'2026-09-'+String(1+Math.floor(i/100)%30).padStart(2,'0'),
 }));
 const calls=[];
 const supabase={from(table){
  assert.equal(table,'transactions');
  const order=[];
  return {select(columns){
   assert.equal(columns,'*');return this;
  },eq(key,val){
   assert.equal(key,'client_id');assert.equal(val,clientId);return this;
  },order(column){order.push(column);return this;},
  async range(from,to){
   calls.push({from,to,order:[...order]});
   const sorted=[...sample].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
   return {data:sorted.slice(from,to+1),error:null};
  }};
 }};
 const result=await fetchAllClientRows(supabase,'transactions',clientId,'date');
 assert.equal(result.error,null);
 assert.equal(result.data.length,2631);
 assert.equal(new Set(result.data.map(x=>x.id)).size,2631);
 assert.equal(calls.length,3);
 assert.deepEqual(calls.map(c=>[c.from,c.to]),[[0,999],[1000,1999],[2000,2999]]);
 assert.ok(calls.every(c=>c.order.join(',')==='date,id'));
});
test('load failures are returned and no partial paginated result is shown',async()=>{
 const supabase={from(){return {select(){return this;},eq(){return this;},order(){return this;},
  async range(){return {data:null,error:{message:'database unavailable'}};}
 };}};
 const result=await fetchAllClientRows(supabase,'transactions','client-id','date');
 assert.equal(result.data,null);
 assert.match(result.error.message,/database unavailable/);
});
