import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAX_MONTHS,addSelectedMonth,normalizeSelectedMonths,buildMonthlyComparison,
  buildMonthKpiRows,monthlyComparisonFindings} from '../src/tbsExecutiveMonths.js';
import {KPI_OPTIONS,executiveMetrics} from '../src/tbsExecutiveReportRules.js';
import {createExecutivePdf,executivePdfFilename} from '../src/tbsExecutiveReportPdf.js';
import {buildExecutiveWord} from '../src/tbsExecutiveReportWord.js';
import {executiveEmailMessage,ensureCompanyContact,validRecipientEmail} from '../src/tbsExecutiveEmail.js';
import handler,{validateExecutiveEmailRequest,isRealPdf} from '../api/send-executive-report.js';
const metrics=KPI_OPTIONS.filter(k=>['revenue','expenses','net_income','net_margin','cash'].includes(k.key));
function fakeFinance(from){
 const m=Number(from.slice(5,7)),revenue=m*1000;
 return {revenue,expenses:revenue*.6,netIncome:revenue*.4,cogs:revenue*.3,hasCogs:true,
  cash:3000+m*10,cashMovement:m*20,receivables:m*50,liabilities:2000+m*100,
  assets:9000+m*150,balanceDifference:0,reconciliationAlerts:0,arMismatch:false,
  uncategorizedCount:0,periodRecords:true};
}
const months=['2026-01','2026-03','2026-08'];
function payload(){
 const monthlyRows=buildMonthlyComparison(months,fakeFinance);
 return {
  businessName:'Demo CenergyS',from:'2026-01-01',to:'2026-08-31',
  clientId:'3445d305-befb-4e1b-9a79-17a6ef70c2f8',industryLabel:'Servicios profesionales',
  metrics,metricValues:executiveMetrics(fakeFinance('2026-08-01')),
  financials:fakeFinance('2026-08-01'),monthlyRows,
  monthlyKpis:buildMonthKpiRows(metrics,monthlyRows),monthlyFindings:monthlyComparisonFindings(monthlyRows),
  narrative:{findings:['Ventas registradas.'],opportunities:['Evaluar crecimiento.'],
   risks:['Confirmar cobros.'],shortTerm:['Revisar gastos.'],mediumTerm:['Preparar presupuesto.'],
   questions:['Cual es el plan de cobros?'],sectorOpportunities:'Estudiar servicios.',
   sectorThreats:'Revisar tarifas.'},
  notes:{marketContext:'Dato gerencial',marketSource:'No verificada',
   ownerDiscussion:'Acuerdos discutidos',agreements:'Seguimiento',followupDate:''},
 };
}
test('select multiple nonconsecutive months, sorted, unique and max 12',()=>{
 assert.deepEqual(normalizeSelectedMonths(['2026-08','2026-01','2026-08','2026-13','2026-03']),months);
 assert.deepEqual(addSelectedMonth(['2026-01'],'2026-03'),['2026-01','2026-03']);
 assert.equal(normalizeSelectedMonths(Array.from({length:20},(_,i)=>'2025-'+String(i+1).padStart(2,'0'))).length,12);
 assert.equal(MAX_MONTHS,12);
});
test('month-by-month KPIs are period-aware and changes are derived from actual selected months',()=>{
 const rows=buildMonthlyComparison(['2026-08','2026-01','2026-03'],fakeFinance);
 assert.deepEqual(rows.map(r=>r.month),months);
 assert.deepEqual(rows.map(r=>r.metrics.revenue),[1000,3000,8000]);
 assert.deepEqual(rows.map(r=>r.metrics.cash),[3010,3030,3080]);
 const table=buildMonthKpiRows(metrics,rows);
 const revenue=table.find(r=>r.key==='revenue');
 assert.equal(revenue.changes[0],null);
 assert.equal(revenue.changes[1].delta,2000);
 assert.equal(revenue.changes[1].changePercent,200);
 assert.equal(revenue.changes[2].changePercent,166.67);
 assert.ok(monthlyComparisonFindings(rows).some(x=>x.includes('ene')));
});
test('native executive PDF has multiple populated pages and safe PDF filename',()=>{
 const doc=createExecutivePdf(payload());
 const bytes=Buffer.from(doc.output('arraybuffer'));
 assert.equal(isRealPdf(bytes),true);
 assert.ok(doc.getNumberOfPages()>=2);
 assert.match(executivePdfFilename(payload()),/^Reporte_Ejecutivo_Demo_CenergyS_/);
});
test('Word export creates an authentic zipped editable DOCX, not renamed HTML',async()=>{
 const blob=await buildExecutiveWord(payload());
 const bytes=Buffer.from(await blob.arrayBuffer());
 assert.ok(bytes.length>1800);
 assert.equal(bytes.subarray(0,4).toString('hex'),'504b0304');
 assert.ok(bytes.includes(Buffer.from('word/document.xml')));
});
test('email copy contains mandatory TBS contact and validates one recipient',()=>{
 const body=executiveEmailMessage('Cliente','2026-01-01','2026-08-31',months);
 assert.match(body,/Twelve Business Strategies LLC/);
 assert.match(body,/admin@twelvestrategies\.com/);
 assert.match(body,/2026-01, 2026-03, 2026-08/);
 assert.match(ensureCompanyContact('Adjuntamos reporte'),/admin@twelvestrategies\.com/);
 assert.equal(validRecipientEmail('ok@example.com'),true);
 assert.equal(validRecipientEmail('one@example.com,two@example.com'),false);
});
test('endpoint rejects missing staff authentication and invalid PDFs',async()=>{
 const fakeRes=()=>({setHeader(){},status(code){this.code=code;return this;},json(obj){this.result=obj;return this;}});
 const res=fakeRes();
 await handler({method:'POST',headers:{},body:{}},res);
 assert.equal(res.code,401);
 const body={clientId:'3445d305-befb-4e1b-9a79-17a6ef70c2f8',from:'2026-01-01',to:'2026-08-31',
  toEmail:'test@example.com',subject:'Reporte',message:'Adjunto',pdfBase64:'AA=='};
 assert.match(validateExecutiveEmailRequest(body),/PDF/);
 assert.equal(isRealPdf(Buffer.from('not a pdf')),false);
});
test('client profiles cannot email reports even when attachment is a real PDF',async()=>{
 const oldFetch=globalThis.fetch;
 const old={SUPABASE_URL:process.env.SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY:process.env.SUPABASE_PUBLISHABLE_KEY,
  RESEND_API_KEY:process.env.RESEND_API_KEY};
 const pdf=Buffer.from(createExecutivePdf(payload()).output('arraybuffer'));
 const body={clientId:'3445d305-befb-4e1b-9a79-17a6ef70c2f8',from:'2026-01-01',to:'2026-08-31',
  toEmail:'test@example.com',subject:'Reporte ejecutivo',message:'Adjunto',
  pdfBase64:pdf.toString('base64')};
 const calls=[];
 try{
  process.env.SUPABASE_URL='https://fake.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY='public-test-key';
  process.env.RESEND_API_KEY='fake-test-key';
  globalThis.fetch=async url=>{
   calls.push(String(url));
   if(String(url).endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:'u1'})};
   if(String(url).includes('/rest/v1/profiles'))return {ok:true,json:async()=>[{role:'client'}]};
   throw Error('Unauthorized role must not reach mail provider.');
  };
  const res={setHeader(){},status(code){this.code=code;return this;},json(obj){this.result=obj;return this;}};
  await handler({method:'POST',headers:{authorization:'Bearer test-token'},body},res);
  assert.equal(res.code,403);
  assert.equal(calls.some(x=>x.includes('api.resend.com')),false);
 }finally{
  globalThis.fetch=oldFetch;
  for(const [key,value] of Object.entries(old))value===undefined?delete process.env[key]:process.env[key]=value;
 }
});
test('React exposes chosen-month comparison, Word/PDF downloads and confirmed staff email',()=>{
 const component=readFileSync(new URL('../src/TBSExecutiveFinancialReport.jsx',import.meta.url),'utf8');
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(component,/Comparar varios meses seleccionados/);
 assert.match(component,/Descargar Word/);
 assert.match(component,/Descargar PDF/);
 assert.match(component,/Enviar PDF por email/);
 assert.match(component,/Confirmo que revisé el destinatario/);
 assert.match(component,/selected_months:normalizeSelectedMonths/);
 assert.match(app,/isStaff=\{isStaff\} clientId=\{clientId\}/);
});
