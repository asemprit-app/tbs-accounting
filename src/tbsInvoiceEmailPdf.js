// Render invoice data directly; modal visibility and scrolling cannot blank it.
export function drawInvoiceEmailPdf(JsPdf, { inv, total, businessName, businessPhone, logoDataUri, labels }) {
  if (!inv?.number || !inv?.client || !inv?.date || !inv.lines?.length || !Number.isFinite(Number(total)))
    throw new Error('Invoice details are incomplete; email was not sent.');
  const doc = new JsPdf({ unit: 'pt', format: 'letter', compress: false });
  const money = n => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  let y = 46;
  const t = labels;
  function text(value, bold = false, size = 10) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(String(value ?? ''), 524);
    for (const line of lines) {
      if (y > 735) { doc.addPage(); y = 46; }
      doc.text(line, 44, y); y += size + 5;
    }
  }
  if (/^data:image\/(png|jpeg);base64,/i.test(logoDataUri || '')) {
    try { doc.addImage(logoDataUri, /^data:image\/png/i.test(logoDataUri) ? 'PNG' : 'JPEG', 44, y, 88, 36); y += 48; } catch { /* Optional logo; invoice text is still required. */ }
  }
  text(businessName || 'Business', true, 17);
  if (businessPhone) text(businessPhone);
  text(`${t.title} ${inv.number}`, true, 15);
  text(`${t.billTo}: ${inv.client}`);
  text(`${t.invDate} ${inv.date}`);
  y += 12;
  text(`${t.items} | ${t.qty} | ${t.price} | ${t.amount}`, true);
  for (const line of inv.lines) {
    text(line.desc || '', true);
    if (line.lineType === 'reimbursable') text(t.reimbursement);
    text(`${Number(line.qty) || 0} x ${money(line.rate)} = ${money((Number(line.qty) || 0) * (Number(line.rate) || 0))}`);
    y += 5;
  }
  const sum = filter => inv.lines.filter(filter).reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0);
  text(`${t.subtotal} ${money(sum(() => true))}`, true);
  if (inv.retention) {
    const withholding = inv.retentionMode === 'amount' ? Number(inv.retentionAmount) || 0 : sum(l => l.applyRetention !== false) * (Number(inv.retentionPct) || 0) / 100;
    text(`${t.withholding}: -${money(withholding)}`);
  }
  if (Number(inv.ivuPct)) text(`${t.ivu}: ${money(sum(l => l.applyIvu !== false) * Number(inv.ivuPct) / 100)}`);
  text(`${t.total} ${money(total)}`, true);
  text(`${t.amountPaid}: ${money(inv.paid)}`);
  text(`${t.balanceDue}: ${money(Math.max(0, Number(total) - (Number(inv.paid) || 0)))}`, true);
  if (inv.payments?.length) {
    text(t.payments, true);
    for (const p of inv.payments.slice().sort((a,b) => String(a.date || '').localeCompare(String(b.date || ''))))
      text(`${p.date || ''} | ${p.method || ''} | ${p.sourceGL || ''} | ${money(p.amount)}`);
  }
  if (inv.paymentMethod) text(`${t.paymentMethod}: ${inv.paymentMethod}`);
  if (inv.notes) text(`${t.notes}: ${inv.notes}`);
  return doc;
}
