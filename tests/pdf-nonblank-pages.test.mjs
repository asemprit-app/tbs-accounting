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
