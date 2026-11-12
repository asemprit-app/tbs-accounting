import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 previousComparablePeriod,comparisonChange,executiveMetrics,executiveNarrative,
 INDUSTRY_OPTIONS,KPI_OPTIONS,
} from '../src/tbsExecutiveReportRules.js';
import {executiveReportPrintHtml} from '../src/tbsExecutiveReportPrint.js';

test('selected period compares to previous equally long period including leap year',()=>{
 assert.deepEqual(previousComparablePeriod('2026-08-01','2026-08-31'),{
  from:'2026-07-01',to:'2026-07-31',days:31,
 });
 assert.deepEqual(previousComparablePeriod('2024-03-01','2024-03-31'),{
  from:'2024-01-30',to:'2024-02-29',days:31,
 });
 assert.equal(previousComparablePeriod('2026-09-30','2026-09-01'),null);
});
test('margins and financial indicators follow exact P&L figures, not invented targets',()=>{
 const metrics=executiveMetrics({revenue:80000,cogs:32000,expenses:60000,netIncome:20000,
   cash:10000,cashMovement:-1000,receivables:8000,liabilities:25000,assets:60000,
   hasCogs:true,balanceDifference:0});
 assert.equal(metrics.net_income,20000);
 assert.equal(metrics.net_margin,25);
 assert.equal(metrics.gross_margin,60);
 assert.equal(metrics.expensesToRevenue,75);
 assert.equal(metrics.cash_movement,-1000);
 assert.equal(executiveMetrics({revenue:0,netIncome:-10,hasCogs:true}).net_margin,null);
 assert.equal(executiveMetrics({revenue:0,netIncome:-10,hasCogs:true}).gross_margin,null);
 assert.equal(comparisonChange(90,100),-10);
 assert.equal(comparisonChange(15,0),null);
});
test('negative net profit and unmatched accounting data produce explicit risk, not imaginary market fact',()=>{
 const insight=executiveNarrative({
  revenue:1000,cogs:200,expenses:1250,netIncome:-250,cash:-50,
  receivables:140,liabilities:50,assets:900,
  balanceDifference:1,reconciliationAlerts:1,arMismatch:true,
  uncategorizedCount:3,periodRecords:4,
  expenseRows:[{name:'Personal',value:900},{name:'Otros',value:350}],
 },{from:'2026-07-01',to:'2026-07-31',hasActivity:true,revenue:1200},'restaurant');
 assert.ok(insight.risks.some(s=>s.includes('pérdida neta')));
 assert.ok(insight.risks.some(s=>s.includes('validación contable')));
 assert.ok(insight.shortTerm.some(s=>s.includes('Clasificar')));
 assert.ok(insight.sectorOpportunities.includes('ingredientes'));
 assert.ok(insight.sectorDataStatus.includes('no son estadísticas'));
});
test('without prior activity, growth is not fabricated',()=>{
 const insight=executiveNarrative({revenue:0,expenses:200,netIncome:-200,periodRecords:0,
  cash:0,receivables:null,liabilities:0,assets:0,balanceDifference:0
 },{hasActivity:false},'general');
 assert.ok(insight.findings.some(s=>s.includes('No se identificaron')));
 assert.equal(insight.findings.some(s=>s.includes('aumentaron')),false);
});
test('print report has charts, explanations, actions and escaped staff-entered content',()=>{
 const html=executiveReportPrintHtml({
  businessName:'TBS <script>alert(1)</script>',from:'2026-08-01',to:'2026-08-31',
  industryLabel:'Comercio',metrics:KPI_OPTIONS.slice(0,3),
  metricValues:executiveMetrics({revenue:3000,expenses:2000,netIncome:1000}),
  prior:{hasActivity:false},financials:{balanceDifference:0,reconciliationAlerts:0,arMismatch:false,uncategorizedCount:0},
  narrative:executiveNarrative({revenue:3000,expenses:2000,netIncome:1000,cash:0,receivables:0,periodRecords:1}, {hasActivity:false},'retail'),
  notes:{marketContext:'<img src=x onerror=alert(1)>',marketSource:'',marketSourceDate:'',
   ownerDiscussion:'Cita <script>',agreements:'Acción 1',followupDate:'2026-09-30'},
 });
 assert.match(html,/Reporte Financiero Ejecutivo/);
 assert.match(html,/Gráficas financieras/);
 assert.match(html,/Estrategias a corto plazo/);
 assert.match(html,/Próxima revisión/);
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
 assert.doesNotMatch(html,/<img src=x/);
 assert.match(html,/&lt;img src=x/);
});
test('Reports uses same period and staff-limited notes resource',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const component=readFileSync(new URL('../src/TBSExecutiveFinancialReport.jsx',import.meta.url),'utf8');
 const migration=readFileSync(new URL('../supabase/migrations/20261112_executive_financial_report_notes.sql',import.meta.url),'utf8');
 assert.match(app,/Preparar reporte ejecutivo/);
 assert.match(app,/financials=\{executiveFinancials\}/);
 assert.match(app,/prior=\{priorFinancial\}/);
 assert.match(component,/tbs_executive_report_notes/);
 assert.match(component,/onConflict:'client_id,period_from,period_to'/);
 assert.match(migration,/ENABLE ROW LEVEL SECURITY/);
 assert.match(migration,/public\.tbs_is_staff\(\)/);
 assert.match(migration,/REVOKE ALL ON TABLE public\.tbs_executive_report_notes FROM anon/);
 assert.ok(INDUSTRY_OPTIONS.length>=8);
});
