// Read-only, virtual postings from invoices for financial statements.
// Nothing is inserted into journal_entries; this prevents duplicate persisted JEs.
// Amounts are normal-balance deltas: assets/expenses debit-positive,
// liabilities/revenue/equity credit-positive.
const cents = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const numeric = v => { const n=Number(v); return Number.isFinite(n)?n:0; };
const lineAmount = line => numeric(line?.qty)*numeric(line?.rate);
const codeByAccount = (accounts,code) => accounts.some(a=>a.code===code);

export function invoiceAccrualDetails(inv){
  const lines = Array.isArray(inv?.lines)?inv.lines:[];
  let service = 0, products = 0, reimbursables = 0, retentionBase = 0, ivuBase = 0;
  for(const line of lines){
    const amount=lineAmount(line);
    const type=line.lineType || 'service';
    if(type==='reimbursable')reimbursables+=amount;
    else if(type==='product')products+=amount;
    else service+=amount;
    if(line.applyRetention!==false)retentionBase+=amount;
    if(line.applyIvu!==false)ivuBase+=amount;
  }
  const withholding=inv.retention
    ? (inv.retentionMode==='amount'?numeric(inv.retentionAmount):retentionBase*numeric(inv.retentionPct)/100)
    : 0;
  const ivu=ivuBase*numeric(inv.ivuPct)/100;
  const gross=cents(service+products+reimbursables);
  const withheld=cents(withholding);
  const tax=cents(ivu);
  return {
    service:cents(service), products:cents(products), reimbursables:cents(reimbursables),
    withholding:withheld, ivu:tax,
    invoiceTotal:cents(gross-withheld+tax)
  };
}

export function invoiceAccrualPostings(inv,accounts=[]){
  if(!inv?.date || !Array.isArray(inv.lines))return [];
  const x=invoiceAccrualDetails(inv);
  const amounts=[
    ['1100',x.invoiceTotal],
    ['1350',x.withholding],
    ['1150',-x.reimbursables],
    ['2030',x.ivu],
    ['4000',x.service],
    ['4010',x.products],
  ];
  const nonzero=amounts.filter(([,n])=>Math.abs(n)>0.005);
  const missing=nonzero.filter(([code])=>!codeByAccount(accounts,code)).map(([code])=>code);
  if(missing.length){
    throw new Error('Invoice '+(inv.number||inv.id||'')+' cannot be reflected in the ledger: missing accounts '+missing.join(', '));
  }
  return nonzero.map(([gl,amount])=>({
    date:inv.date,gl,amount,source:'Invoice accrual',invoiceId:inv.id,
  }));
}

export function invoicePostingDifference(postings,accounts=[]){
  const byCode=new Map(accounts.map(a=>[a.code,a.type]));
  const normalDebit=type=>type==='Asset'||type==='Expense';
  return cents(postings.reduce((sum,p)=>{
    const type=byCode.get(p.gl);
    if(!type)throw new Error('Unknown GL '+p.gl);
    return sum+(normalDebit(type)?p.amount:-p.amount);
  },0));
}

// For deposits matched to an invoice, increase Cash and *decrease* receivables.
// Old code used the same sign on both assets, overstating A/R after payments.
export function bankCategoryNormalAmount(tx,account){
  const amt=numeric(tx?.amount);
  if(account?.type==='Expense')return -amt;
  if((account?.type==='Asset') && tx?.sourceGL && tx?.gl!==tx.sourceGL)return -amt;
  return amt;
}

export function periodActivity(postings,gl,from,to,{excludeInvoiceAccrual=false}={}){
  return postings.reduce((sum,p)=>{
    if(p.gl!==gl||p.date<from||p.date>to)return sum;
    if(excludeInvoiceAccrual&&p.source==='Invoice accrual')return sum;
    return sum+p.amount;
  },0);
}
