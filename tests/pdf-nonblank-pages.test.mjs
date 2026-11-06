import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import { drawRegisterPdf, assertNonblankPdfPages } from '../src/tbsRegisterPdf.js';
import { drawSinglePagePaymentPdf, payStubPdfModel } from '../src/tbsPaymentEmailPdf.js';
for (const columns of [5,15]) for (const count of [1,30,200]) {
 test(`register ${columns} columns, ${count} rows has no blank pages`,()=>{
  const doc=drawRegisterPdf(jsPDF,{title:'Register',headings:['Twelve Business Strategies'],tables:[{headers:Array.from({length:columns},(_,i)=>`Column ${i}`),rows:Array.from({length:count},(_,n)=>Array.from({length:columns},(_,i)=>i===0?`Employee ${n}`:`$${n+i}.00`))}]});
  assertNonblankPdfPages(doc);
  for(let p=1;p<=doc.getNumberOfPages();p++)assert.match(doc.internal.pages[p].join('\n'),/Employee/);
  if(count===1)assert.equal(doc.getNumberOfPages(),1);
 });
}
test('register wraps long entries without blank trailing pages',()=>{
 const doc=drawRegisterPdf(jsPDF,{title:'Register',tables:[{headers:['Name','Description'],rows:[['Name','long description '.repeat(400)]]}]});
 assert.ok(doc.getNumberOfPages()>1);assertNonblankPdfPages(doc);
});
test('empty PDF page blocks output rather than being emailed or printed',()=>{
 const doc=new jsPDF();doc.text('Payment',44,44);doc.addPage();
 assert.throws(()=>assertNonblankPdfPages(doc),/blank PDF page/);
});
test('bulk paystubs produce exactly one populated page per selected employee',()=>{
 let doc;
 for(let i=0;i<7;i++) {
  if(i)doc.addPage();
  doc=drawSinglePagePaymentPdf(jsPDF,payStubPdfModel({line:{id:String(i),gross:1000},run:{payDate:'2026-11-02',periodStart:'2026-10-16',periodEnd:'2026-10-31'},employee:{name:`Employee ${i}`},businessName:'TBS'}),doc);
 }
 assert.equal(doc.getNumberOfPages(),7);assertNonblankPdfPages(doc);
 for(let p=1;p<=7;p++){
  const text=doc.internal.pages[p].join('\n');assert.ok(text.includes(`Employee ${p-1}`));assert.ok(text.includes('NET PAY'));
 }
});
test('register emails and payment print buttons bypass HTML screenshot and full app printing',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.ok(!app.includes('html2pdf'));
 for(const [start,end] of [['function InvoicePrintModal(','function CustomersView('],['function PayStubModal(','function PayrollRegisterModal('],['function BulkPayrollStubsModal(','function PayStubModal(']]){
  const component=app.slice(app.indexOf(start),app.indexOf(end));assert.ok(!component.includes('window.print()'));assert.ok(component.includes('previewNativePdf('));
 }
});

test('register PDF presents corporate title, totals and repeated dark table header',()=>{
 const rows=Array.from({length:70},(_,i)=>['Employee '+i,'2026-11-03','40.00','$15.00','$600.00']);
 rows.push(['Total (70)','','2800.00','','$42,000.00']);
 const doc=drawRegisterPdf(jsPDF,{title:'Payroll_Register.pdf',businessName:'Example Business LLC',periodLabel:'2026-11-01 to 2026-11-30',tables:[{headers:['Employee','Pay Date','Hours','Pay Rate','Net Pay'],rows}]});
 assert.ok(doc.getNumberOfPages()>1);
 assertNonblankPdfPages(doc);
 const first=doc.internal.pages[1].join('\\n');
 assert.ok(first.includes('Example Business LLC'));
 assert.ok(first.includes('PAYROLL REGISTER'));
 assert.ok(first.includes('Period')||first.includes('2026-11-01'));
 const last=doc.internal.pages[doc.getNumberOfPages()].join('\\n');
 assert.ok(last.includes('Total'));
 assert.ok(last.includes('Page '));
});

test('payroll register footer preserves all monetary column totals across PDF pages',()=>{
 const headers=['Employee','Pay Date','Hours','Pay Rate','Gross','Federal Tax','PR Tax','Soc. Sec.','Medicare','FICA','SINOT','Other','Reimb.','Net Pay'];
 const rows=Array.from({length:45},(_,i)=>['Employee '+i,'2026-11-06','8.00','$15.00','$120.00','$3.00','$5.00','$7.44','$1.74','$9.18','$1.00','$0.00','$0.00','$101.82']);
 rows.push(['PERIOD TOTAL (45)','','360.00','—','$5,400.00','$135.00','$225.00','$334.80','$78.30','$413.10','$45.00','$0.00','$0.00','$4,581.90']);
 const pdf=drawRegisterPdf(jsPDF,{title:'Payroll_Register.pdf',businessName:'Example LLC',periodLabel:'November 2026',tables:[{headers,rows}]});
 assertNonblankPdfPages(pdf);
 const stream=Array.from({length:pdf.getNumberOfPages()},(_,p)=>pdf.internal.pages[p+1].join('\\n')).join('\\n');
 for(const token of ['PERIOD TOTAL','5,400.00','135.00','225.00','413.10','4,581.90']) assert.ok(stream.includes(token),token);
 assert.ok(pdf.getNumberOfPages()>=2);
});
test('Payroll Register numeric totals and CSV have matching columns',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const modal=app.slice(app.indexOf('function PayrollRegisterModal('),app.indexOf('function ReconciliationView('));
 assert.ok(modal.includes('PERIOD TOTAL ('));
 assert.ok(modal.includes('money(totals.federal)'));
 assert.ok(modal.includes('money(totals.ss + totals.medicare)'));
 assert.ok(modal.includes('money(totals.net)'));
 assert.ok(modal.includes('Gross,Federal Tax,PR Tax'));
 assert.ok(modal.includes('totals.gross.toFixed(2)},${totals.federal.toFixed(2)},${totals.pr.toFixed(2)}'));
});
