import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {monthlySalesSeries,MAX_MONTHLY_SALES_MONTHS} from '../src/tbsExecutiveMonthlySales.js';
import {EXECUTIVE_SECTIONS,DEFAULT_CLIENT_SECTIONS} from '../src/tbsExecutiveSections.js';
import {createExecutivePdf} from '../src/tbsExecutiveReportPdf.js';
import {buildExecutiveWord} from '../src/tbsExecutiveReportWord.js';

const calc=(from,to)=>{
 const month=Number(from.slice(5,7));
 const sales=month===3?-25:month===2?0:month*100+0.33;
 return {revenue:sales,periodRecords:month!==2};
};
const context={
 businessName:'Prueba ventas',from:'2026-01-01',to:'2026-04-30',
 industryLabel:'Comercio',
 clientSections:['summary','monthlySales'],
 metrics:[],
 metricValues:{revenue:1200,expenses:500,net_income:700,net_margin:58.33},
 financials:{periodRecords:true,uncategorizedCount:0,arMismatch:false,reconciliationAlerts:0,balanceDifference:0},
 narrative:{findings:[],risks:[],opportunities:[],shortTerm:[],mediumTerm:[],questions:[]},
 notes:{ownerDiscussion:'Solo interno'}
};
const pageText=doc=>doc.internal.pages.slice(1).map(p=>p.join('\n')).join('\n');
test('monthly sales follows report boundaries including partial months',()=>{
 const result=monthlySalesSeries('2026-01-15','2026-03-18',calc);
 assert.deepEqual(result.rows.map(r=>[r.month,r.from,r.to]),[
  ['2026-01','2026-01-15','2026-01-31'],
  ['2026-02','2026-02-01','2026-02-28'],
  ['2026-03','2026-03-01','2026-03-18'],
 ]);
 assert.equal(result.rows[0].sales,100.33);
 assert.equal(result.rows[1].sales,0);
 assert.equal(result.rows[1].change,-100.33);
 assert.equal(result.rows[1].changePercent,-100);
 assert.equal(result.rows[2].sales,-25);
 assert.equal(result.rows[2].changePercent,null);
 assert.equal(result.totalSales,75.33);
 assert.deepEqual(result.rows.map(x=>x.partialMonth),[true,false,true]);
});
test('sales table and chart use P&L revenue even if client has no invoices in comparison',()=>{
 const result=monthlySalesSeries('2026-08-01','2026-08-31',(a,b)=>({revenue:2831.54,periodRecords:true}));
 assert.equal(result.rows.length,1);
 assert.equal(result.rows[0].sales,2831.54);
 assert.equal(result.totalSales,2831.54);
 assert.equal(result.rows[0].partialMonth,false);
});
test('month count is limited to avoid excessive report generation',()=>{
 assert.equal(MAX_MONTHLY_SALES_MONTHS,120);
 assert.throws(()=>monthlySalesSeries('2010-01-01','2026-12-31',calc),/120 meses/);
});
test('monthly sales is selectable and included by default for new client reports',()=>{
 assert.equal(DEFAULT_CLIENT_SECTIONS.includes('monthlySales'),true);
 assert.equal(EXECUTIVE_SECTIONS.some(x=>x.key==='monthlySales'),true);
});
test('PDF contains graph/table and total only when monthly sales sharing is selected',()=>{
 const series=monthlySalesSeries('2026-01-01','2026-04-30',calc);
 const report={...context,monthlySalesRows:series.rows,monthlySalesTotal:series.totalSales};
 const visible=pageText(createExecutivePdf(report));
 assert.match(visible,/Ventas, gastos y ganancia neta/);
 assert.match(visible,/TOTAL/);
 assert.match(visible,/Cambio/);
 const excluded=pageText(createExecutivePdf({...report,clientSections:['summary']}));
 assert.doesNotMatch(excluded,/Tabla mensual de ventas, gastos y ganancia neta/);
});
test('Word export has same monthly-sales section and remains real DOCX',async()=>{
 const series=monthlySalesSeries('2026-01-01','2026-04-30',calc);
 const blob=await buildExecutiveWord({...context,monthlySalesRows:series.rows,monthlySalesTotal:series.totalSales});
 const bytes=Buffer.from(await blob.arrayBuffer());
 assert.equal(bytes.subarray(0,4).toString('hex'),'504b0304');
 assert.ok(bytes.length>1800);
 const word=readFileSync(new URL('../src/tbsExecutiveReportWord.js',import.meta.url),'utf8');
 assert.match(word,/Ventas, gastos y ganancia neta - barras verticales por mes/);
});
test('React report renders monthly sales regardless of optional month-to-month comparison',()=>{
 const ui=readFileSync(new URL('../src/TBSExecutiveFinancialReport.jsx',import.meta.url),'utf8');
 assert.match(ui,/Resultados mensuales — gráfica de barras verticales y tabla/);
 assert.match(ui,/monthlySalesSeries\(from,to,financialsForRange\)/);
 assert.match(ui,/monthlySalesRows:monthlySales.rows/);
});
