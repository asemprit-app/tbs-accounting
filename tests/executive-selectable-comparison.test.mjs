import test from 'node:test';
import assert from 'node:assert/strict';
import {monthRange,comparisonRows,comparisonFindings,validComparisonRange} from '../src/tbsExecutiveComparison.js';
import {KPI_OPTIONS} from '../src/tbsExecutiveReportRules.js';
import {executiveReportPrintHtml} from '../src/tbsExecutiveReportPrint.js';
import {readFileSync} from 'node:fs';
test('select specific months including leap February',()=>{
 assert.deepEqual(monthRange('2026-08'),{from:'2026-08-01',to:'2026-08-31'});
 assert.deepEqual(monthRange('2024-02'),{from:'2024-02-01',to:'2024-02-29'});
 assert.equal(monthRange('2026-13'),null);
 assert.equal(validComparisonRange('2026-08-01','2026-07-31'),false);
 assert.equal(validComparisonRange('2026-06-01','2026-09-30'),true);
});
test('monthly comparison computes dollars, percentage, and margin percentage points',()=>{
 const list=KPI_OPTIONS.filter(k=>['revenue','net_margin','cash','expenses'].includes(k.key));
 const rows=comparisonRows(list,{revenue:1200,net_margin:20,cash:500,expenses:900},
 {revenue:1000,net_margin:15,cash:1000,expenses:0});
 assert.equal(rows.find(r=>r.key==='revenue').delta,200);
 assert.equal(rows.find(r=>r.key==='revenue').changePercent,20);
 assert.equal(rows.find(r=>r.key==='net_margin').changePoints,5);
 assert.equal(rows.find(r=>r.key==='net_margin').changePercent,null);
 assert.equal(rows.find(r=>r.key==='expenses').changePercent,null);
 assert.equal(rows.find(r=>r.key==='cash').changePercent,-50);
 const findings=comparisonFindings(rows,'2026-07-01','2026-07-31');
 assert.ok(findings.some(s=>s.includes('Ventas')&&s.includes('20.00%')));
});
test('printing includes selected comparison periods and KPI change table',()=>{
 const list=KPI_OPTIONS.filter(k=>['revenue','net_margin'].includes(k.key));
 const comparison=comparisonRows(list,{revenue:1200,net_margin:20},{revenue:1000,net_margin:15});
 const html=executiveReportPrintHtml({
  businessName:'Demo',from:'2026-08-01',to:'2026-08-31',
  industryLabel:'General',metrics:list,
  metricValues:{revenue:1200,expenses:900,net_income:300,net_margin:20},
  comparisonPeriod:{from:'2026-07-01',to:'2026-07-31'},comparison,comparisonHasActivity:true,
  prior:{hasActivity:true,from:'2026-07-01',to:'2026-07-31'},
  narrative:{findings:[],risks:[],opportunities:[],shortTerm:[],mediumTerm:[],questions:[],
   sectorOpportunities:'Revisar servicios',sectorThreats:'Revisar costos',sectorDataStatus:'Sin evidencia'},
  financials:{balanceDifference:0},notes:{marketSource:'',marketSourceDate:'',marketContext:''},
 });
 assert.match(html,/Comparación de períodos seleccionados/);
 assert.match(html,/2026-07-01/);
 assert.match(html,/5.00 pp/);
 assert.match(html,/20.00%/);
});
test('Reports integrates range-aware comparison using existing financial postings',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const report=readFileSync(new URL('../src/TBSExecutiveFinancialReport.jsx',import.meta.url),'utf8');
 assert.match(app,/financialsForRange=\{financialsForExecutiveRange\}/);
 assert.match(report,/Comparar meses y períodos/);
 assert.match(report,/comparison_mode:notes.comparisonMode/);
 assert.match(report,/comparisonPeriod,comparison,comparisonHasActivity/);
});
