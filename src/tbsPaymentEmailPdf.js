// Document data and PDF layout for personal pay stubs and Services receipts.
// No HTML, scrolling modal, hidden print rules or html2canvas are involved.
// Each individual email attachment must have exactly one nonblank US Letter page.
const amount = value => Number(value) || 0;
const currency = value => amount(value).toLocaleString('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const fixed = value => amount(value).toFixed(2);

export function serviceReceiptPdfModel({ service, calculations, businessName, logoDataUri }) {
  if (!service?.employeeName?.trim() || !service?.date || !calculations)
    throw new Error('The service receipt is missing the payee, date or payment details.');
  const c = calculations;
  const rows = [
    ['Resource', service.employeeName],
    ['Resource type', service.resourceType === 'employee' ? 'Employee' : 'Service provider'],
    ...(service.invoiceNumber ? [['Invoice #', service.invoiceNumber]] : []),
    ['Payment date', service.date],
    ...(amount(service.hours) > 0 ? [['Hours', fixed(service.hours)], ['Pay rate', currency(service.payRate)]] : []),
    ...(amount(c.tipsNet) ? [['Tips', currency(c.tipsNet)]] : []),
    ['Gross', currency(c.gross)],
    ['Retention', '-' + currency(service.retentionAmount)],
    ...(amount(c.ivuAmount) ? [[`IVU (${fixed(c.ivuPct)}%)`, '+' + currency(c.ivuAmount)]] : []),
    ['Sub-total', currency(c.subtotal)],
    ...(amount(service.reimbursement) ? [['Reimbursement', '+' + currency(service.reimbursement)]] : []),
  ];
  return {
    kind: 'service', title: 'PAYMENT RECEIPT', businessName: businessName || 'Business',
    recipientName: service.employeeName, documentDate: service.date, logoDataUri,
    rows, netLabel: 'NET PAY', netAmount: c.netPay,
  };
}

export function payStubPdfModel({ line, run, employee, businessName, logoDataUri, hourRows, totalHours }) {
  if (!line?.id || !run?.payDate || !run?.periodStart || !run?.periodEnd || !employee?.name?.trim())
    throw new Error('The pay stub is missing the employee, payroll period or payment details.');
  const details = [
    ['Employee', employee.name],
    ['Pay period', `${run.periodStart} to ${run.periodEnd}`],
    ['Pay date', run.payDate],
  ];
  const hours = (hourRows || []).map(([label, hours, rate]) =>
    [`${label} (${fixed(hours)} hrs at ${currency(rate)})`, currency(amount(hours) * amount(rate))]);
  if (hours.length) {
    hours.push([`Total hours (${fixed(totalHours)})`,currency(amount(line.gross) - amount(line.extraGross))]);
  }
  const earnings = [
    ...(amount(line.tips) > 0 ? [['Tips', currency(line.tips)]] : []),
    ...(amount(line.extraGross) > 0 ? [['Extra gross', currency(line.extraGross)]] : []),
    ['Gross Pay', currency(line.gross)],
  ];
  const deductions = [
    ...(amount(line.federalIncomeTax) > 0 ? [['Federal tax', '-' + currency(line.federalIncomeTax)]] : []),
    ['PR Income Tax', '-' + currency(line.prIncomeTax)],
    ['Social Security', '-' + currency(line.socialSecurity)],
    ['Medicare', '-' + currency(line.medicare)],
    ...(amount(line.sinot) ? [['SINOT', '-' + currency(line.sinot)]] : []),
    ...(amount(line.otherDeductions) ? [[line.otherDeductionsDesc || 'Other deductions','-' + currency(line.otherDeductions)]] : []),
    ...(amount(line.reimbursement) ? [['Reimbursement','+' + currency(line.reimbursement)]] : []),
  ];
  const net = amount(line.gross)
    - amount(line.federalIncomeTax) - amount(line.prIncomeTax)
    - amount(line.socialSecurity) - amount(line.medicare)
    - amount(line.sinot) - amount(line.otherDeductions)
    + amount(line.reimbursement);
  return {
    kind: 'paystub', title: 'PAY STUB', businessName: businessName || 'Business',
    recipientName: employee.name, documentDate: run.payDate, logoDataUri,
    rows: details, sections: [
      ...(hours.length ? [{ title: 'Hours and rates', rows: hours }] : []),
      { title: 'Earnings', rows: earnings },
      { title: 'Deductions and reimbursements', rows: deductions },
    ],
    netLabel: 'NET PAY', netAmount: net,
  };
}

export function drawSinglePagePaymentPdf(jsPDF, model) {
  if (!model || !['service','paystub'].includes(model.kind) ||
      !String(model.recipientName || '').trim() || !String(model.documentDate || '').trim() ||
      !Number.isFinite(Number(model.netAmount))) {
    throw new Error('Incomplete payment document; nothing was emailed.');
  }
  const doc = new jsPDF({ orientation:'portrait', unit:'pt', format:'letter', compress:false });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const x = 44, right = pageWidth - x;
  const pdfText = v => String(v ?? '').replace(/[\t\n\r]/g, ' ').trim();
  let y = 50;
  const guard = height => { if (y + height > pageHeight - 54) throw new Error('Payment receipt is too long for one page; email was not sent.'); };

  // Logo is optional: a malformed client logo must not create a blank attachment.
  if (typeof model.logoDataUri === 'string' && /^data:image\/(png|jpeg);base64,/i.test(model.logoDataUri)) {
    try {
      const format = model.logoDataUri.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(model.logoDataUri, format, x, 34, 88, 36, undefined, 'FAST');
    } catch {
      // Business name and document title remain visible.
    }
  }
  doc.setTextColor(29,48,76);
  doc.setFont('helvetica','bold');
  doc.setFontSize(17);
  const bizLines = doc.splitTextToSize(pdfText(model.businessName || 'Business'), 350).slice(0,2);
  doc.text(bizLines, x, y);
  y += Math.max(28, bizLines.length * 21);
  doc.setFontSize(15);
  doc.text(pdfText(model.title), x, y);
  y += 13;
  doc.setDrawColor(174,183,194);
  doc.setLineWidth(1);
  doc.line(x, y, right, y);
  y += 23;

  function addRow(label, value, heavy=false) {
    const safeLabel = pdfText(label), safeValue = pdfText(value);
    const labelLines = doc.splitTextToSize(safeLabel, 310);
    const valueLines = doc.splitTextToSize(safeValue, 190);
    const rowHeight = Math.max(labelLines.length,valueLines.length)*13 + 8;
    guard(rowHeight);
    doc.setFont('helvetica', heavy?'bold':'normal');
    doc.setFontSize(10);
    doc.setTextColor(48,58,72);
    doc.text(labelLines, x + 3, y);
    doc.text(valueLines, right - 3, y, {align:'right'});
    y += rowHeight;
    doc.setDrawColor(230,233,237);
    doc.setLineWidth(0.35);
    doc.line(x, y - 9, right, y - 9);
  }
  function section(title, rows) {
    if (!rows?.length) return;
    guard(23);
    doc.setFont('helvetica','bold');
    doc.setTextColor(29,48,76);
    doc.setFontSize(10);
    doc.text(pdfText(title).toUpperCase(), x, y);
    y += 20;
    rows.forEach(([label,value])=>addRow(label,value));
    y += 7;
  }

  (model.rows || []).forEach(([label,value]) => addRow(label,value));
  (model.sections || []).forEach(s => section(s.title,s.rows));
  guard(53);
  y += 9;
  doc.setDrawColor(29,48,76); doc.setLineWidth(1.4);
  doc.line(x,y,right,y);
  y += 26;
  doc.setFont('helvetica','bold');
  doc.setTextColor(17,35,58);
  doc.setFontSize(14);
  doc.text(pdfText(model.netLabel || 'NET PAY'),x,y);
  doc.text(currency(model.netAmount),right,y,{align:'right'});
  if (doc.getNumberOfPages() !== 1) throw new Error('Unexpected extra PDF page; email was not sent.');
  return doc;
}
