import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {journalEntryMatchesTransactionFilters, visibleTransactionRows} from '../src/tbsTransactionListFilter.js';

const base={dateFrom:'',dateTo:'',gl:'',sourceGL:'',status:'',amount:'',reconciled:'',sign:''};
const tx={id:'tx-1',date:'2026-10-03',description:'DEPÓSITO',amount:275,gl:'4000',sourceGL:'1010'};
const je={id:'je-1',isJE:true,date:'2026-10-03',description:'Journal Entry — ajuste',amount:275,gl:'4000',sourceGL:null};

test('Transactions list defaults to actual transactions without Journal Entries',()=>{
 assert.deepEqual(visibleTransactionRows([tx],[je]),[tx]);
 assert.deepEqual(visibleTransactionRows([tx],[je],false),[tx]);
 assert.deepEqual(visibleTransactionRows([tx],[je],true),[tx,je]);
});

test('Journal Entry appears with opt-in only when matching applicable date, category, amount and search',()=>{
 assert.equal(journalEntryMatchesTransactionFilters(je,base,''),true);
 assert.equal(journalEntryMatchesTransactionFilters(je,{...base,dateFrom:'2026-10-04'},''),false);
 assert.equal(journalEntryMatchesTransactionFilters(je,{...base,dateTo:'2026-10-02'},''),false);
 assert.equal(journalEntryMatchesTransactionFilters(je,{...base,gl:'4000'},'ajuste'),true);
 assert.equal(journalEntryMatchesTransactionFilters(je,{...base,gl:'6000'},''),false);
 assert.equal(journalEntryMatchesTransactionFilters(je,{...base,amount:'275'},'ajuste'),true);
 assert.equal(journalEntryMatchesTransactionFilters(je,{...base,amount:'274'},''),false);
 assert.equal(journalEntryMatchesTransactionFilters(je,base,'otro'),false);
 assert.equal(journalEntryMatchesTransactionFilters({...je,amount:-10},{...base,sign:'positive'},''),false);
 assert.equal(journalEntryMatchesTransactionFilters(je,{...base,sign:'negative'},''),false);
 assert.equal(journalEntryMatchesTransactionFilters({...je,amount:-10},{...base,sign:'negative'},''),true);
});

test('Journal Entries never pass transaction-only account, status, reconciled and uncategorized filters',()=>{
 for(const f of [{sourceGL:'1010'},{sourceGL:'__unassigned__'},{status:'MATCH'},
  {reconciled:'reconciled'},{reconciled:'none'},{gl:'__uncat__'},
  {gl:'__uncat_income__'},{gl:'__uncat_expense__'}]) {
  assert.equal(journalEntryMatchesTransactionFilters(je,{...base,...f},''),false,JSON.stringify(f));
 }
});

test('App hides Journal Entries by default, offers explicit opt-in and resets pagination',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const start=app.indexOf('function TransactionsView(');
 const end=app.indexOf('function ProductsView(',start);
 assert.ok(start>=0);
 const view=app.slice(start,end>start?end:undefined);
 assert.match(view,/const \[showJournalEntries, setShowJournalEntries\] = useState\(false\)/);
 assert.match(view,/visibleTransactionRows\(filteredTransactions, journalEntryRows, showJournalEntries\)/);
 assert.match(view,/journalEntryMatchesTransactionFilters\(r, filters, search, matchMode\)/);
 assert.match(view,/\[filters, search, matchMode, showJournalEntries\]/);
 assert.match(view,/Include Journal Entries/);
 assert.match(view,/const \[matchMode, setMatchMode\] = useState\('any'\)/);
 assert.match(view,/transactionMatchesFilters\(t, filters, search, \{/);
 assert.match(view,/Match any selected filter \(OR\)/);
 assert.match(view,/Match all selected filters \(AND\)/);
});
