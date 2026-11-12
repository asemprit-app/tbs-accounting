import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {monthlySalesSeries} from '../src/tbsExecutiveMonthlySales.js';
import {fiveLargestExpenses} from '../src/tbsExecutiveExpenseFocus.js';
import {createExecutivePdf} from '../src/tbsExecutiveReportPdf.js';
import {buildExecutiveWord} from '../src/tbsExecutiveReportWord.js';
import {EXECUTIVE_SECTIONS,DEFAULT_CLIENT_SECTIONS} from '../src/tbsExecutiveSections.js';

const months=monthlySalesSeries('2026-01-01','2026-03-31',(from)=>{
 const month=Number(from.slice(5,7));
 const sales=[1000.01,800,500][month-1];
 const expenses=[700,900.23,100][month-1];
 return {revenue:sales,expenses,netIncome:sales-expenses,periodRecords:true};
});
const top=fiveLargestExpenses([
 {code:'6100',name:'Nómina',value:500,isCogs:false},
 {code:'6200',name:'Compras',value:300,isCogs:true},
 {code:'6300',name:'Renta',value:200},
 {code:'6400',name:'Electricidad',value:100},
 {code:'6500',name:'Seguro',value:60},
 {code:'6600',name:'Otros',value:10},
 {code:'6700',name:'Reembolso',value:-30},
],1140);
const payload={
 businessName:'Prueba',from:'2026-01-01',to:'2026-03-31',industryLabel:'Servicios',
 metricValues:{revenue:2300.01,expenses:1700.23,net_income:599.78},
 metrics:[],financials:{periodRecords:true},narrative:{},notes:{ownerDiscussion:'INTERNAL ONLY'},
 clientSections:['monthlySales','topExpenses'],
 monthlySalesRows:months.rows,monthlySalesTotal:months.totalSales,
 monthlyExpenseTotal:months.totalExpenses,monthlyNetTotal:months.totalNet,
 topExpenses:top,
};
const pdfContents=doc=>doc.internal.pages.slice(1).map(page=>page.join('\n')).join('\n');
test('month series reflects the P&L expense total and net result for each month',()=>{
 assert.deepEqual(months.rows.map(r=>[r.sales,r.expenses,r.netIncome]),[
  [1000.01,700,300.01],[800,900.23,-100.23],[500,100,400]
 ]);
 assert.equal(months.totalSales,2300.01);
 assert.equal(months.totalExpenses,1700.23);
 assert.equal(months.totalNet,599.78);
 assert.ok(months.rows.every(r=>Math.abs(r.netIncome-(r.sales-r.expenses))<1e-8));
});
test('top five expenses are actual positive account amounts, with correct share',()=>{
 assert.deepEqual(top.rows.map(x=>x.code),['6100','6200','6300','6400','6500']);
 assert.equal(top.rows[0].amount,500);
 assert.equal(top.rows[0].percent,43.86);
 assert.equal(top.topFiveTotal,1160);
 assert.equal(top.concentration,101.75);
 assert.ok(top.findings.some(s=>s.includes('Nómina')));
});
test('grouped vertical screen chart has three series, negative profit red, and table totals',()=>{
 const ui=readFileSync(new URL('../src/TBSMonthlySalesVisual.jsx',import.meta.url),'utf8');
 assert.match(ui,/BarChart data=\{chartRows\}/);
 assert.match(ui,/dataKey=\{item.key\}/);
 assert.match(ui,/netIncome<0\?'#B74B47'/);
 assert.match(ui,/data.totalExpenses/);
 assert.match(ui,/data.totalNet/);
});
test('PDF contains native vertical columns for monthly results, five expenses, and no internal notes',()=>{
 const doc=createExecutivePdf(payload);
 const body=pdfContents(doc);
 assert.match(body,/barras verticales por mes/);
 assert.match(body,/Tabla mensual de ventas, gastos y ganancia neta/);
 assert.match(body,/Cinco gastos principales/);
 assert.match(body,/TOTAL/);
 assert.doesNotMatch(body,/INTERNAL ONLY/);
 assert.ok(doc.getNumberOfPages()>=2);
});
test('Word remains editable and adds month-by-month results and expense ranking',async()=>{
 const blob=await buildExecutiveWord(payload);
 const bytes=Buffer.from(await blob.arrayBuffer());
 assert.equal(bytes.subarray(0,4).toString('hex'),'504b0304');
 assert.ok(bytes.includes(Buffer.from('word/document.xml')));
 const docSource=readFileSync(new URL('../src/tbsExecutiveReportWord.js',import.meta.url),'utf8');
 assert.match(docSource,/ImageRun/);
 assert.match(docSource,/verticalReportChartPng/);
 assert.match(docSource,/Ganancia neta/);
 assert.match(docSource,/Cinco gastos principales/);
});
test('new report selections include vertical monthly results and top expenses',()=>{
 assert.ok(DEFAULT_CLIENT_SECTIONS.includes('monthlySales'));
 assert.ok(DEFAULT_CLIENT_SECTIONS.includes('topExpenses'));
 assert.ok(EXECUTIVE_SECTIONS.find(s=>s.key==='monthlySales').label.includes('Resultados mensuales'));
 assert.equal(EXECUTIVE_SECTIONS.length,14);
});
