// Display-only control matrix: month/quarter/year obligations are computed
// from finalized payroll and service accruals, agency assessments and recorded
// remittances. No posting to General Ledger or mutation of source records.
import { cents, asMoney, payrollGrossByPeriod } from './tbsRetentionLedger.js';

export const CONTROL_GROUPS = Object.freeze([
 {id:'fica',label:'FICA',parts:['employee','employer','paid','pending']},
 {id:'sinot',label:'SINOT',parts:['employee','employer','paid','pending']},
 {id:'pr',label:'PR Tax',parts:['accrued','paid','pending']},
 {id:'services',label:'Retenciones Services',parts:['accrued','paid','pending']},
 {id:'other',label:'Otras obligaciones patronales',parts:['accrued','paid','pending']},
]);
export const PAYMENT_GROUPS = Object.freeze({
 fica: ['fica_remittance','payroll_ss','payroll_medicare','employer_ss','employer_medicare'],
 sinot: ['sinot_remittance','payroll_sinot','employer_sinot'],
 pr: ['payroll_pr'],
 services: ['services_remittance','services_contractor','services_employee'],
 other: ['employer_unemployment_pr','employer_unemployment_futa','employer_unemployment_special','employer_cfse','employer_other','payroll_federal'],
});
export const PAYMENT_FORM_GROUPS = Object.freeze([
 {id:'fica_remittance',label:'FICA total · Empleado + Patronal'},
 {id:'sinot_remittance',label:'SINOT total · Empleado + Patronal'},
 {id:'payroll_pr',label:'PR Tax retenido'},
 {id:'services_remittance',label:'Retenciones de Services'},
 ...PAYMENT_GROUPS.other.map(id=>({id,label:({
  employer_unemployment_pr:'Desempleo PR (SUTA)',
  employer_unemployment_futa:'Desempleo federal (FUTA)',
  employer_unemployment_special:'Aportación especial DTRH',
  employer_cfse:'CFSE',
  employer_other:'Otra obligación patronal',
  payroll_federal:'Federal Income Tax retenido',
 })[id]})),
]);
export const MATRIX_COLUMNS = Object.freeze([
 {key:'gross',label:'Gross Pay',group:'gross'},
 ...CONTROL_GROUPS.flatMap(group => group.parts.map(part => ({
   key:group.id+'_'+part,group:group.id,
   label:part==='employee'?'Employee':part==='employer'?'Employer':part==='accrued'?'Obligación':part==='paid'?'Pagado':'Pendiente',
 }))),
]);
export const groupPeriod = (month,granularity) => {
 if(granularity==='year') return month.slice(0,4);
 if(granularity==='quarter') return month.slice(0,4)+'-Q'+Math.ceil(Number(month.slice(5,7))/3);
 return month;
};
const categoryGroup = category => {
 for(const [key,arr] of Object.entries(PAYMENT_GROUPS))
   if(arr.includes(category))return key;
 return null;
};
export function buildRetentionMatrix(input, payments=[], grouping='month') {
 const { services=[],payrollRuns=[],payrollLines=[],assessments=[] }=input||{};
 const summaries=new Map();
 const rowFor=month=>{
   if(!summaries.has(month)){
     const row={period:month,gross:0};
     for(const g of CONTROL_GROUPS)
       for(const part of g.parts)row[g.id+'_'+part]=0;
     row.overpaid=0;
     summaries.set(month,row);
   }
   return summaries.get(month);
 };
 // Tax liability source in cents, allowing official employer assessments to
 // replace modeled Payroll shares (never add on top of a matching estimate).
 const obligations=new Map();
 const accrue=(month,category,amount)=>{
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||'') || !Number.isFinite(Number(amount)))return;
   const key=month+'|'+category;
   obligations.set(key,(obligations.get(key)||0)+cents(amount));
 };
 const validRuns=new Map(payrollRuns.filter(r=>r.status==='FINAL').map(r=>[r.id,String(r.payDate||r.pay_date||'').slice(0,7)]));
 for(const line of payrollLines) {
   const month=validRuns.get(line.payrollRunId||line.payroll_run_id);
   if(!month)continue;
   accrue(month,'payroll_ss',line.socialSecurity??line.social_security);
   accrue(month,'payroll_medicare',line.medicare);
   accrue(month,'employer_ss',line.socialSecurity??line.social_security);
   // Employer Medicare is 1.45% of applicable wages, excluding additional
   // Medicare tax withheld from employees; final assessed amount can override.
   const regularMedicare=Math.min(Math.max(0,Number(line.medicare)||0),Math.max(0,(Number(line.gross)||0)*0.0145));
   accrue(month,'employer_medicare',regularMedicare);
   accrue(month,'payroll_sinot',line.sinot);
   accrue(month,'employer_sinot',line.sinot);
   accrue(month,'payroll_pr',line.prIncomeTax??line.pr_income_tax);
   accrue(month,'payroll_federal',line.federalIncomeTax??line.federal_income_tax);
 }
 for(const s of services) {
   if(s.status!=='FINAL')continue;
   const month=String(s.date||s.service_date||'').slice(0,7);
   accrue(month,(s.resourceType||s.resource_type)==='employee'?'services_employee':'services_contractor',
     s.retentionAmount??s.retention_amount);
 }
 const overrides=new Map();
 for(const assessment of assessments){
   const category=assessment.category,month=assessment.tax_period;
   if(!categoryGroup(category)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||''))continue;
   const amount=Number(assessment.amount);
   if(!Number.isFinite(amount)||amount<=0)continue;
   const key=month+'|'+category;
   overrides.set(key,(overrides.get(key)||0)+cents(amount));
 }
 for(const [key,amount] of overrides) obligations.set(key,amount);
 const paid=new Map();
 for(const payment of payments){
   const month=payment.tax_period,category=payment.category;
   if(!categoryGroup(category)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||''))continue;
   const key=month+'|'+categoryGroup(category);
   paid.set(key,(paid.get(key)||0)+cents(payment.amount));
 }
 const monthGross=payrollGrossByPeriod(payrollRuns,payrollLines);
 for(const [month,gross] of monthGross)rowFor(month).gross=cents(gross);
 for(const [key,amount] of obligations){
   const split=key.indexOf('|'),month=key.slice(0,split),cat=key.slice(split+1);
   const g=categoryGroup(cat);
   if(!g)continue;
   const part=g==='fica'||g==='sinot'
     ? (cat.startsWith('employer_')?'employer':'employee') : 'accrued';
   rowFor(month)[g+'_'+part]+=amount;
 }
 for(const [key,amount] of paid){
   const [month,g]=key.split('|');
   rowFor(month)[g+'_paid']+=amount;
 }
 // A remittance belongs to the declared month; never silently offset
 // another month when consolidating quarters or annual totals.
 const months=[...summaries.values()];
 for(const row of months){
   for(const group of CONTROL_GROUPS) {
     const owed=group.parts.includes('employee')
       ? row[group.id+'_employee']+row[group.id+'_employer']
       : row[group.id+'_accrued'];
     const payment=row[group.id+'_paid'];
     row[group.id+'_pending']=Math.max(0,owed-payment);
     row.overpaid+=Math.max(0,payment-owed);
   }
 }
 const grouped=new Map();
 for(const month of months){
   const period=groupPeriod(month.period,grouping);
   const dest=grouped.get(period)||{period,...Object.fromEntries(
     Object.keys(month).filter(k=>k!=='period').map(k=>[k,0]))};
   for(const [key,value] of Object.entries(month))
     if(key!=='period')dest[key]+=value;
   grouped.set(period,dest);
 }
 return [...grouped.values()].map(row=>Object.fromEntries(
   Object.entries(row).map(([key,value])=>[key,key==='period'?value:asMoney(value)])))
   .sort((a,b)=>b.period.localeCompare(a.period));
}
export function filterMatrixRows(rows,filters={}) {
 return rows.filter(row=>Object.entries(filters).every(([key,condition])=>{
   if(condition==='all'||!condition) return true;
   const amount=cents(row[key]);
   if(condition==='positive')return amount>0;
   if(condition==='zero')return amount===0;
   if(condition==='negative')return amount<0;
   return true;
 }));
}
