// Consolidate multiple FINAL Services invoices into a single check.
// This is a print instruction, not an accounting posting or paid flag.
const cents = v => {
  const n=Number(v);
  if(!Number.isFinite(n))throw new Error('Invalid invoice payment amount.');
  return Math.round((n+Number.EPSILON)*100);
};
const supplierKey=v=>String(v||'').trim().replace(/\s+/g,' ').toLocaleLowerCase();
export function eligibleSupplierInvoices(services=[]) {
  return services.filter(s=> (s.resourceType||'service_provider')==='service_provider' &&
    s.status==='FINAL' && String(s.employeeName||'').trim() &&
    String(s.invoiceNumber||'').trim() && !s.paidCheckId);
}
export function consolidateSupplierInvoices(items, supplier) {
  if(!Array.isArray(items)||items.length<2)throw new Error('Select at least two invoices for one supplier.');
  const name=String(supplier||'').trim();
  if(!name)throw new Error('Select a supplier.');
  const seen=new Set(), ids=new Set();
  let amountCents=0;
  const invoices=items.map(s=>{
    if(supplierKey(s.employeeName)!==supplierKey(name))throw new Error('All invoices must belong to the same supplier.');
    if((s.resourceType||'service_provider')!=='service_provider'||s.status!=='FINAL'||s.paidCheckId)
      throw new Error('Only FINAL, unpaid supplier invoices may be included.');
    const invoice=String(s.invoiceNumber||'').trim(), id=String(s.id||'');
    if(!invoice||!id)throw new Error('Each invoice must have an invoice number and entry ID.');
    const key=invoice.toLocaleLowerCase();
    if(seen.has(key)||ids.has(id))throw new Error('A supplier invoice is selected more than once.');
    seen.add(key);ids.add(id);
    const sum=cents(s.netPay);
    if(sum<=0)throw new Error('Each selected invoice must have a positive net amount.');
    amountCents+=sum;
    return {id,number:invoice,date:s.date||'',amount:sum/100};
  });
  return {
    payee:name, amount:amountCents/100, invoices,
    memo:`Invoices: ${invoices.map(i=>i.number).join(', ')}`,
    voucherDetail:{
      kind:'Services',period:'Multiple invoices',
      reference:`${invoices.length} supplier invoices`,
      info:'One consolidated check',
      rows:invoices.map(i=>({label:`Invoice ${i.number}${i.date?' ('+i.date+')':''}`,amount:i.amount})),
    },
  };
}
