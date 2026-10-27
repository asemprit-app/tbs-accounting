import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { serviceReceiptPdfModel, payStubPdfModel, drawSinglePagePaymentPdf } from '../src/tbsPaymentEmailPdf.js';

class FakePdf {
  constructor(options) {
    this.options=options;
    this.internal={pageSize:{getWidth:()=>612,getHeight:()=>792}};
    this.written=[];
    this.pages=1;
  }
  setTextColor() {}
  setFont() {}
  setFontSize() {}
  setDrawColor() {}
  setLineWidth() {}
  line() {}
  addImage() {}
  splitTextToSize(s,w) {return [String(s)];}
  text(value,x,y) {this.written.push({value:String(value),x,y});}
  getNumberOfPages() {return this.pages;}
  output() {return {size:2850};}
}
const allText=doc=>doc.written.map(x=>x.value).join(' | ');

test('Services receipt has payee, date, gross, retention, reimbursement and net amount',()=>{
  const service={employeeName:'Supplier One',date:'2026-10-27',resourceType:'service_provider',
    invoiceNumber:'INV-123',hours:6,payRate:100,retentionAmount:20,reimbursement:40};
  const c={tipsNet:0,gross:600,ivuPct:11.5,ivuAmount:69,subtotal:580,netPay:689};
  const model=serviceReceiptPdfModel({service,calculations:c,businessName:'Clinic'});
  const doc=drawSinglePagePaymentPdf(FakePdf,model);
  assert.equal(doc.options.format,'letter');
  assert.equal(doc.getNumberOfPages(),1);
  assert.match(allText(doc),/Supplier One/);
  assert.match(allText(doc),/PAYMENT RECEIPT/);
  assert.match(allText(doc),/INV-123/);
  assert.match(allText(doc),/\$689\.00/);
  assert.match(allText(doc),/Retention/);
  assert.match(allText(doc),/\$69\.00/);
  assert.ok(doc.written.every(x=>x.y<745));
});
test('Payroll pay stub includes employee and only employee personal earnings and deductions',()=>{
  const line={id:'line-1',gross:1000,federalIncomeTax:0,prIncomeTax:50,socialSecurity:62,
    medicare:14.5,sinot:2,otherDeductions:10,otherDeductionsDesc:'Insurance',
    reimbursement:10,regularHours:40,extraGross:0,tips:0};
  const run={payDate:'2026-10-27',periodStart:'2026-10-12',periodEnd:'2026-10-25'};
  const model=payStubPdfModel({line,run,employee:{name:'Employee A'},businessName:'Clinic',
    hourRows:[['Regular',40,25]],totalHours:40});
  const doc=drawSinglePagePaymentPdf(FakePdf,model);
  assert.equal(doc.getNumberOfPages(),1);
  const txt=allText(doc);
  assert.match(txt,/Employee A/);
  assert.match(txt,/2026-10-12 to 2026-10-25/);
  assert.match(txt,/Regular/);
  assert.match(txt,/Insurance/);
  assert.match(txt,/NET PAY/);
  assert.match(txt,/\$871\.50/);
  assert.doesNotMatch(txt,/Employee B/);
});
test('Missing required data blocks outbound attachment generation',()=>{
  assert.throws(()=>serviceReceiptPdfModel({service:{employeeName:'',date:'2026-10-27'},calculations:{}}),/missing/);
  assert.throws(()=>payStubPdfModel({line:{id:'id'},run:{},employee:{name:'X'}}),/missing/);
  assert.throws(()=>drawSinglePagePaymentPdf(FakePdf,{kind:'service',recipientName:'',documentDate:'2026-01-01',netAmount:0}),/Incomplete/);
});
test('Overlong PDF refuses email rather than truncating or creating blank extra sheets',()=>{
  class WrappedFakePdf extends FakePdf {
    splitTextToSize(str,width) {return String(str).length>120 ? Array(100).fill('long') : [String(str)];}
  }
  const model={kind:'service',title:'PAYMENT RECEIPT',businessName:'Clinic',recipientName:'Someone',
    documentDate:'2026-10-27',rows:[['Very long', 'a'.repeat(300)]],netAmount:1};
  assert.throws(()=>drawSinglePagePaymentPdf(WrappedFakePdf,model),/too long/);
});
test('All individual email entrypoints use the data-driven generator (not modal screenshots)',()=>{
  const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  assert.ok(app.includes('async function generatePersonalPaymentPdfBase64(model)'));
  assert.ok(app.includes('const doc = drawSinglePagePaymentPdf(JsPdf, model)'));
  assert.ok(app.includes('const pdfBase64 = await generatePersonalPaymentPdfBase64(serviceReceiptPdfModel({'));
  assert.equal((app.match(/const pdfBase64 = await generatePersonalPaymentPdfBase64\(payStubPdfModel\(\{/g)||[]).length,2);
  assert.ok(app.includes('if (doc.getNumberOfPages() !== 1)'));
});
