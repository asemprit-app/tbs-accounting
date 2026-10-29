import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { drawSinglePagePaymentPdf, serviceReceiptPdfModel } from '../src/tbsPaymentEmailPdf.js';

const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const serviceStart = source.indexOf('function ServiceReceiptModal(');
const serviceEnd = source.indexOf('function ProductsView(', serviceStart);
const services = source.slice(serviceStart, serviceEnd);

test('Services receipt print button opens the data-driven PDF, not the browser modal', () => {
  assert.ok(serviceStart > 0 && serviceEnd > serviceStart);
  assert.ok(services.includes('async function handlePrint()'));
  assert.ok(services.includes('<button onClick={handlePrint}'));
  assert.ok(services.includes('drawSinglePagePaymentPdf(JsPdf, serviceReceiptPdfModel({'));
  assert.ok(services.includes('doc.getNumberOfPages() !== 1'));
  assert.ok(services.includes("blob.size < 950"));
  assert.ok(services.includes("window.open('about:blank', '_blank')"));
  assert.ok(services.includes('preview.location.replace(url)'));
  assert.ok(services.includes("anchor.download = 'Receipt_'"));
  assert.ok(services.includes("max-height: none !important"));
  assert.ok(!services.includes('onClick={() => window.print()}'));
});

test('Email and print share the same service receipt data model', () => {
  assert.equal((services.match(/serviceReceiptPdfModel\(\{/g) || []).length, 2);
  assert.ok(services.includes('generatePersonalPaymentPdfBase64(serviceReceiptPdfModel({'));
  assert.ok(services.includes('drawSinglePagePaymentPdf(JsPdf, serviceReceiptPdfModel({'));
});

test('A normal Services payment fits one page with relevant details', () => {
  class PdfFake {
    constructor(options) {
      this.options=options;
      this.internal={pageSize:{getWidth:()=>612,getHeight:()=>792}};
      this.lines=[];
    }
    setTextColor() {}
    setFont() {}
    setFontSize() {}
    setDrawColor() {}
    setLineWidth() {}
    line() {}
    addImage() {}
    splitTextToSize(s) { return [String(s)]; }
    text(v) { this.lines.push(String(v)); }
    getNumberOfPages() { return 1; }
  }
  const service = {employeeName:'Services Contractor',date:'2026-10-29',resourceType:'service_provider',
    invoiceNumber:'ABC-101',hours:2,payRate:100,retentionAmount:20,reimbursement:5};
  const calculated = {tipsNet:0,gross:200,ivuPct:0,ivuAmount:0,subtotal:180,netPay:185};
  const model = serviceReceiptPdfModel({service,calculations:calculated,businessName:'TBS Client'});
  const doc = drawSinglePagePaymentPdf(PdfFake,model);
  assert.equal(doc.getNumberOfPages(),1);
  const t=doc.lines.join(' ');
  assert.match(t,/PAYMENT RECEIPT/);
  assert.match(t,/Services Contractor/);
  assert.match(t,/ABC-101/);
  assert.match(t,/185\.00/);
});
