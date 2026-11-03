// A shared, deterministic PDF layout for Save as PDF and Send Invoice.
// Matches the invoice preview's document hierarchy without DOM screenshots.
export function drawInvoiceEmailPdf(JsPdf, { inv, total, businessName, businessPhone, logoDataUri, labels = {} }) {
  if (!inv?.number || !inv?.client || !inv?.date || !inv.lines?.length || !Number.isFinite(Number(total)))
    throw new Error('Invoice details are incomplete; email was not sent.');
  const doc = new JsPdf({ unit: 'pt', format: 'letter', compress: false });
  const W = 612, L = 40, R = 572, bottom = 746;
  const money = n => (Number(n) || 0).toLocaleString('en-US', {style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
  const numeric = n => (Number(n) || 0).toFixed(2);
  const sum = predicate => inv.lines.filter(predicate).reduce((a,l)=>a+(Number(l.qty)||0)*(Number(l.rate)||0),0);
  const retention = inv.retention ? (inv.retentionMode === 'amount' ? Number(inv.retentionAmount)||0 : sum(l=>l.applyRetention!==false)*(Number(inv.retentionPct)||0)/100) : 0;
  const ivu = sum(l=>l.applyIvu!==false)*(Number(inv.ivuPct)||0)/100;
  const due = Math.max(0, Number(total) - (Number(inv.paid)||0));
  const spanish = /^factura$/i.test(labels.title || '');
  const color = (r,g,b) => doc.setTextColor(r,g,b);
  const font = (size=10,bold=false) => {doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);};
  const txt = (s,x,y,options) => doc.text(String(s??''),x,y,options);
  const line = (y) => {doc.setDrawColor(221,225,230);doc.setLineWidth(.6);doc.line(L,y,R,y);};
  const small = (s,x,y,options) => {font(9);color(99,110,124);txt(s,x,y,options);};
  let y=40;
  function heading() {
    y=40;
    if (/^data:image\/(png|jpeg);base64,/i.test(logoDataUri||'')) {
      try {doc.addImage(logoDataUri,/^data:image\/png/i.test(logoDataUri)?'PNG':'JPEG',L,38,82,42);} catch {}
    }
    font(21);color(36,46,58);txt(labels.title||'INVOICE',R,71,{align:'right'});
    font(11,true);txt(businessName||'Business',R,92,{align:'right'});
    if (businessPhone) small(businessPhone,R,106,{align:'right'});
    line(126);
    small(labels.billTo||'Bill to',L,149);
    font(10,true);color(33,43,54);
    const name=doc.splitTextToSize(String(inv.client),265);
    doc.text(name,L,165);
    const detailX=387;
    small(labels.invNumber||'Invoice Number:',detailX,147);
    font(10,true);color(33,43,54);txt(inv.number,R,147,{align:'right'});
    small(labels.invDate||'Invoice Date:',detailX,166);
    font(10,true);color(33,43,54);txt(inv.date,R,166,{align:'right'});
    if(!spanish) {small('Payment Due:',detailX,184);font(10,true);color(33,43,54);txt(inv.dueDate||inv.date,R,184,{align:'right'});}
    doc.setFillColor(243,244,246);doc.roundedRect(detailX,194,185,29,3,3,'F');
    small(spanish?'Balance pendiente:':'Amount Due (USD):',detailX+8,212);
    font(10,true);color(33,43,54);txt(money(due),R-8,212,{align:'right'});
    y=Math.max(244,165+name.length*13+32);
  }
  function tableHeader() {
    doc.setFillColor(59,63,69);doc.rect(L,y,W-L-(W-R),29,'F');
    font(10,true);color(255,255,255);
    txt(labels.items||'Items',L+9,y+19);
    const heads=spanish?[[labels.price||'Price',465],[labels.qty||'Quantity',507]]:[[labels.qty||'Quantity',465],[labels.price||'Price',514]];
    heads.forEach(([t,x])=>txt(t,x,y+19,{align:'right'}));
    txt(labels.amount||'Amount',R-7,y+19,{align:'right'});
    y+=29;
  }
  function newPage() {doc.addPage();heading();tableHeader();}
  heading();tableHeader();
  for (const item of inv.lines) {
    font(10,true);
    const description=doc.splitTextToSize(String(item.desc||''),spanish ? 335 : 337);
    const hasReimbursable=(item.lineType||'service')==='reimbursable';
    const h=Math.max(31,description.length*13+15+(hasReimbursable?11:0));
    if(y+h>bottom-175) newPage();
    color(33,43,54);font(10,true);doc.text(description,L+8,y+18);
    if(hasReimbursable) {font(8);color(104,112,125);txt(labels.reimbursement||'Reimbursement',L+8,y+18+description.length*13);}
    font(9);color(35,45,57);
    if(spanish) {
      txt(money(item.rate),465,y+18,{align:'right'});
      txt(numeric(item.qty),507,y+18,{align:'right'});
    } else {
      txt(numeric(item.qty),465,y+18,{align:'right'});
      txt(money(item.rate),514,y+18,{align:'right'});
    }
    txt(money((Number(item.qty)||0)*(Number(item.rate)||0)),R-7,y+18,{align:'right'});
    y+=h;line(y);
  }
  function ensure(height) {if(y+height>bottom){doc.addPage();heading();y=245;}}
  const totalsNeeded=145+(inv.retention?20:0)+(Number(inv.ivuPct)?20:0)+(Number(inv.paid)?20:0);
  ensure(totalsNeeded);
  y+=15;
  const x=385;
  function summary(label,value,kind='normal') {
    if(kind==='strong') {doc.setDrawColor(44,55,66);doc.setLineWidth(1);doc.line(x,y-13,R,y-13);}
    font(10,kind==='strong');color(kind==='normal'?103:33,kind==='normal'?113:43,kind==='normal'?126:54);
    txt(label,x,y);txt(value,R,y,{align:'right'});y+=23;
  }
  summary(labels.subtotal||'Total:',money(sum(()=>true)));
  if(inv.retention) summary((labels.withholding||'Withholding')+(inv.retentionMode==='amount'?'': ' ('+numeric(inv.retentionPct)+'%)')+':','-'+money(retention));
  if(Number(inv.ivuPct)) summary((labels.ivu||'Sales tax')+' ('+numeric(inv.ivuPct)+'%):',money(ivu));
  summary(labels.total||'Invoice total:',money(total),'strong');
  if(Number(inv.paid)) summary(labels.amountPaid||'Total paid','-'+money(inv.paid));
  summary(labels.balanceDue||'Balance due',money(due),'strong');
  if(inv.payments?.length) {
    ensure(40+inv.payments.length*14);
    font(10,true);color(33,43,54);txt(labels.payments||'PAYMENTS RECEIVED',L,y+10);y+=29;
    for(const p of [...inv.payments].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')))) {
      ensure(18);font(9);color(50,61,73);
      txt([p.date||'',p.method||'',p.sourceGL||''].filter(Boolean).join(' | ').slice(0,75),L,y);
      txt(money(p.amount),R,y,{align:'right'});y+=17;line(y);
    }
  }
  for(const [label,value] of [[labels.paymentMethod,inv.paymentMethod],[labels.notes,inv.notes]]) {
    if(!value)continue;
    const lines=doc.splitTextToSize(String(value),510);
    ensure(26+lines.length*12);font(9,true);color(33,43,54);txt(label||'',L,y+15);
    font(9);doc.text(lines,L,y+29);y+=32+lines.length*12;
  }
  return doc;
}
