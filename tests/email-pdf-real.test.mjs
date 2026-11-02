import test from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { readFileSync } from 'node:fs';
import { drawSinglePagePaymentPdf, serviceReceiptPdfModel, payStubPdfModel } from '../src/tbsPaymentEmailPdf.js';
import { drawInvoiceEmailPdf } from '../src/tbsInvoiceEmailPdf.js';
const labels = { title:'INVOICE',billTo:'Bill to',invDate:'Date',items:'Description',qty:'Quantity',price:'Price',amount:'Amount',reimbursement:'Reimbursement',subtotal:'Subtotal',withholding:'Withholding',ivu:'IVU',total:'Total',amountPaid:'Paid',balanceDue:'Balance due',payments:'Payments',paymentMethod:'Payment method',notes:'Notes' };
const text = doc => {
 // Check the bytes actually attached to email, not a fake drawing API.
 const bytes=Buffer.from(doc.output('arraybuffer'));
 assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
 assert.ok(bytes.length>1500);
 return bytes.toString('latin1');
};
for(const businessName of ['Twelve Business Strategies','Paradisus','Another client']) {
 test(`${businessName}: real receipt and paystub PDF contain text and one page`,()=>{
  const models=[serviceReceiptPdfModel({businessName,service:{employeeName:'Recipient One',date:'2026-11-02'},calculations:{gross:100,subtotal:100,netPay:100}}),payStubPdfModel({businessName,line:{id:'one',gross:100,socialSecurity:6.2,medicare:1.45},run:{payDate:'2026-11-02',periodStart:'2026-10-01',periodEnd:'2026-10-15'},employee:{name:'Recipient One'}})];
  for(const model of models){const doc=drawSinglePagePaymentPdf(jsPDF,model);const bytes=text(doc);assert.equal(doc.getNumberOfPages(),1);assert.ok(bytes.includes('Recipient One'));assert.ok(bytes.includes('NET PAY'));assert.ok(bytes.includes(businessName));}
 });
 test(`${businessName}: real invoice PDF has recipient, items and balance`,()=>{
  const doc=drawInvoiceEmailPdf(jsPDF,{businessName,labels,inv:{number:'TBS-001',client:'Customer One',date:'2026-11-02',lines:[{desc:'Monthly accounting',qty:1,rate:500}],paid:100},total:500});
  const bytes=text(doc);for(const value of ['TBS-001','Customer One','Monthly accounting','$400.00'])assert.ok(bytes.includes(value));assert.equal(doc.getNumberOfPages(),1);
 });
}
test('long invoices paginate without adding an empty final page',()=>{
 const doc=drawInvoiceEmailPdf(jsPDF,{businessName:'TBS',labels,inv:{number:'LONG',client:'Customer',date:'2026-11-02',lines:Array.from({length:60},(_,i)=>({desc:`Item ${i}`,qty:1,rate:1}))},total:60});
 assert.ok(doc.getNumberOfPages()>1);for(let n=1;n<=doc.getNumberOfPages();n++){const page=doc.internal.pages[n].join('\n');assert.match(page,/\([^)]*\S[^)]*\) Tj/);}text(doc);
});
test('all outbound personal PDFs use bundled jsPDF and invoices avoid HTML capture',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.ok(app.includes("import { jsPDF } from 'jspdf'"));
 assert.ok(!app.includes('cdnjs.cloudflare.com/ajax/libs/jspdf'));
 const invoice=app.slice(app.indexOf('async function handleSendInvoice()'),app.indexOf('const logoEl ='));
 assert.ok(invoice.includes('drawInvoiceEmailPdf('));assert.ok(!invoice.includes('generatePdfBase64FromElement'));
});
