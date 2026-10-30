// Read-only withholding obligations. This ledger tracks remittances and does
// not post accounting entries. Finalized records only. All money in cents.
export const RETENTION_CATEGORIES = Object.freeze([
 {id:'services_contractor',label:'Services · Contractor retention',group:'Services'},
 {id:'services_employee',label:'Services · Employee retention (combined)',group:'Services'},
 {id:'payroll_pr',label:'Payroll · PR income tax',group:'Payroll'},
 {id:'payroll_federal',label:'Payroll · Federal income tax',group:'Payroll'},
 {id:'payroll_ss',label:'Payroll · Social Security withheld',group:'Payroll'},
 {id:'payroll_medicare',label:'Payroll · Medicare withheld',group:'Payroll'},
 {id:'payroll_sinot',label:'Payroll · SINOT withheld',group:'Payroll'},
 {id:'employer_ss',label:'Patronal · Seguro Social (FICA)',group:'Patronal',calculation:'payroll'},
 {id:'employer_medicare',label:'Patronal · Medicare (FICA)',group:'Patronal',calculation:'payroll'},
 {id:'employer_sinot',label:'Patronal · SINOT',group:'Patronal',calculation:'payroll'},
 {id:'employer_unemployment_pr',label:'Patronal · Desempleo PR (SUTA)',group:'Patronal',calculation:'assessment'},
 {id:'employer_unemployment_futa',label:'Patronal · Desempleo federal (FUTA)',group:'Patronal',calculation:'assessment'},
 {id:'employer_unemployment_special',label:'Patronal · Aportación especial DTRH',group:'Patronal',calculation:'assessment'},
 {id:'employer_cfse',label:'Patronal · CFSE / Fondo del Seguro del Estado',group:'Patronal',calculation:'assessment'},
]);
export const cents = n => Math.round((Number(n)||0)*100);
export const asMoney = centsValue => Math.round(Number(centsValue)||0)/100;
export const isRetentionCategory = id => RETENTION_CATEGORIES.some(x => x.id===id);
export const ASSESSMENT_CATEGORIES = RETENTION_CATEGORIES.filter(x=>x.calculation==='assessment');
export const validPeriod = s => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s||''));
const month = date => typeof date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0,7) : '';
const add = (map,cat,period,value) => {
 if(!validPeriod(period) || !isRetentionCategory(cat) || !Number.isFinite(Number(value))) return;
 const key=cat+'|'+period;
 map.set(key,(map.get(key)||0)+cents(value));
};
export function retentionObligations({services=[],payrollRuns=[],payrollLines=[],assessments=[]}={}) {
 const map=new Map();
 for(const s of services) {
   if(s.status !== 'FINAL') continue;
   const type=s.resourceType || s.resource_type || 'service_provider';
   const category=type==='employee' ? 'services_employee':'services_contractor';
   add(map,category,month(s.date || s.service_date),s.retentionAmount ?? s.retention_amount);
 }
 const finalized=new Map(payrollRuns.filter(r=>r.status==='FINAL').map(r=>[r.id,month(r.payDate || r.pay_date)]));
 for(const l of payrollLines){
   const period=finalized.get(l.payrollRunId || l.payroll_run_id);
   if(!period)continue;
   add(map,'payroll_pr',period,l.prIncomeTax ?? l.pr_income_tax);
   add(map,'payroll_federal',period,l.federalIncomeTax ?? l.federal_income_tax);
   add(map,'payroll_ss',period,l.socialSecurity ?? l.social_security);
   add(map,'payroll_medicare',period,l.medicare);
   add(map,'payroll_sinot',period,l.sinot);
   // Keep the employer share separate from employee withholding.
   // These amounts mirror Payroll's current employer matching method.
   add(map,'employer_ss',period,l.socialSecurity ?? l.social_security);
   // Additional Medicare Tax (0.9%) has no employer matching component.
   // Use only the standard employee-withheld Medicare share up to 1.45% of
   // gross for a conservative employer matching estimate.
   const withheldMedicare=Number(l.medicare)||0;
   const standardMedicare=Math.round((Number(l.gross)||0)*0.0145*100)/100;
   add(map,'employer_medicare',period,Math.max(0,Math.min(withheldMedicare,standardMedicare)));
   // Payroll Journal Entries currently assume employer SINOT matches the
   // employee SINOT. This is a provisional control, verify DTRH assessment.
   add(map,'employer_sinot',period,l.sinot);
 }
 for(const a of assessments) {
   if(!ASSESSMENT_CATEGORIES.some(c=>c.id===a.category))continue;
   const value=Number(a.amount);
   if(value>0)add(map,a.category,a.tax_period,value);
 }
 return map;
}
export function retentionBalances(input,payments=[]) {
 const accrued=retentionObligations(input);
 const paid=new Map();
 for(const p of payments) {
   if(!isRetentionCategory(p.category) || !validPeriod(p.tax_period))continue;
   add(paid,p.category,p.tax_period,p.amount);
 }
 const keys=new Set([...accrued.keys(),...paid.keys()]);
 const byCategory=new Map(RETENTION_CATEGORIES.map(cat=>[cat.id,{...cat,accrued:0,paid:0,pending:0,overpaid:0}]));
 const rows=Array.from(keys).map(key=>{
   const [category,period]=key.split('|');
   const amount=accrued.get(key)||0,pay=paid.get(key)||0;
   const result={category,period,accrued:asMoney(amount),paid:asMoney(pay),
     pending:asMoney(Math.max(0,amount-pay)),overpaid:asMoney(Math.max(0,pay-amount))};
   const bucket=byCategory.get(category);
   if(bucket){
     bucket.accrued+=amount; bucket.paid+=pay; bucket.pending+=Math.max(0,amount-pay); bucket.overpaid+=Math.max(0,pay-amount);
   }
   return result;
 }).sort((a,b)=>b.period.localeCompare(a.period)||a.category.localeCompare(b.category));
 return {rows,categories:Array.from(byCategory.values()).map(x=>({
   ...x,accrued:asMoney(x.accrued),paid:asMoney(x.paid),
   pending:asMoney(x.pending),overpaid:asMoney(x.overpaid),
 }))};
}

export function payrollGrossByPeriod(payrollRuns=[],payrollLines=[],grouping='month') {
  const validRuns=new Map((payrollRuns||[]).filter(r=>r.status==='FINAL')
    .map(r=>[r.id,{date:r.payDate||r.pay_date,period:month(r.payDate||r.pay_date)}]));
  const result=new Map();
  for(const l of payrollLines||[]){
    const run=validRuns.get(l.payrollRunId||l.payroll_run_id);
    if(!run||!validPeriod(run.period))continue;
    const key=grouping==='quarter'
      ? run.period.slice(0,4)+'-Q'+Math.ceil(Number(run.period.slice(5,7))/3)
      : run.period;
    result.set(key,(result.get(key)||0)+cents(l.gross));
  }
  return new Map(Array.from(result,([period,minor])=>[period,asMoney(minor)]));
}
export function retentionPivot(balances,grossMonths,grouping='month') {
  const totals=new Map();
  const periodKey=month=>grouping==='quarter'
    ? month.slice(0,4)+'-Q'+Math.ceil(Number(month.slice(5,7))/3) : month;
  for(const row of balances.rows){
    const key=periodKey(row.period);
    const x=totals.get(key)||{period:key,gross:0,retained:0,employer:0,paid:0,pending:0,overpaid:0};
    const employer=RETENTION_CATEGORIES.find(c=>c.id===row.category)?.group==='Patronal';
    x[employer?'employer':'retained']+=cents(row.accrued);
    x.paid+=cents(row.paid);x.pending+=cents(row.pending);x.overpaid+=cents(row.overpaid);
    totals.set(key,x);
  }
  for(const [month,amount] of grossMonths){
    const key=periodKey(month);
    const x=totals.get(key)||{period:key,gross:0,retained:0,employer:0,paid:0,pending:0,overpaid:0};
    x.gross+=cents(amount);totals.set(key,x);
  }
  return Array.from(totals.values()).map(row=>Object.fromEntries(
    Object.entries(row).map(([k,v])=>[k,k==='period'?v:asMoney(v)])))
    .sort((a,b)=>b.period.localeCompare(a.period));
}
