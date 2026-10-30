import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 financialReportMoney,reportPrintCell,reportPrintNumeric,reportPrintRowStyle,
 reportPrintLandscape,presentFinancialReportRows,
} from '../src/tbsFinancialReportPresentation.js';

test('USD currency is identical to report screen: $ sign, decimals, comma, negative sign',()=>{
 assert.equal(financialReportMoney(1234.56),'$1,234.56');
 assert.equal(financialReportMoney(-1234.56),'-$1,234.56');
 assert.equal(financialReportMoney(0),'$0.00');
 assert.equal(financialReportMoney(1234.5),'$1,234.50');
 assert.equal(reportPrintCell(-45.2),'-$45.20');
 assert.equal(reportPrintCell('2026-10-30'),'2026-10-30');
 assert.equal(reportPrintCell('6210'),'6210');
 assert.equal(reportPrintNumeric(0),true);
 assert.equal(reportPrintNumeric('6210'),false);
});

test('all period monetary cells in comparisons are numeric and output with dollar signs',()=>{
 const monthly=[
  ['6210','Payroll Tax Expense',1243.21,-18.3,0],
  ['','Total Payroll Tax',1243.21,-18.3,0],
 ];
 for(const row of monthly)for(const cell of row.slice(2)){
   assert.match(reportPrintCell(cell),/^-?\$[\d,]+\.\d\d$/);
 }
 assert.equal(reportPrintLandscape(['Code','Account','Jan 2026','Feb 2026','Mar 2026']),false);
 assert.equal(reportPrintLandscape(['Code','Account','Jan','Feb','Mar','Apr']),true);
});

test('P&L report print preserves visible Sales, COGS, Expenses and total hierarchy',()=>{
 const sample=[
  ['4000','Sales',2500],['','Total Sales',2500],
  ['5100','Inventory',800],['','Total COGS',800],['','Gross Profit',1700],
  ['6000','Rent',200],['','Operating Expenses',200],['','Net Income',1500],
 ];
 const view=presentFinancialReportRows('pnl',sample,false);
 assert.deepEqual(view.filter(r=>r.kind==='section').map(r=>r.cells[1]),
  ['Sales','Cost of Goods Sold','Expenses']);
 assert.equal(view.find(r=>r.cells[1]==='Total Sales').kind,'total');
 assert.equal(view.find(r=>r.cells[1]==='Net Income').kind,'total');
 assert.equal(view.filter(r=>r.kind!=='section').length,sample.length);
});

test('Balance Sheet print includes the same three categories and subtotals',()=>{
 const sample=[
  ['1000','Cash',500],['','Total Assets',500],
  ['2000','Accounts Payable',200],['','Total Liabilities',200],
  ['3000','Capital',300],['','Total Equity',300],
  ['','Liabilities + Equity',500],['','Balance Check (Assets - Liabilities - Equity)',0],
 ];
 const printed=presentFinancialReportRows('balance_sheet',sample);
 assert.deepEqual(printed.filter(r=>r.kind==='section').map(r=>r.cells[1]),
  ['Assets','Liabilities','Equity']);
 assert.equal(reportPrintRowStyle('balance_sheet',['','Balance Check (Assets - Liabilities - Equity)',0]),'total');
});

test('Cash Flow prints activity groups and subsections with original numbers',()=>{
 const sample=[
  ['','OPERATING ACTIVITIES',''],
  ['4000','Sales',1000],['','Total Sales',1000],
  ['5000','Purchases',-300],['','Total Purchases',-300],
  ['6000','Wages',-100],['','Total Payroll',-100],
  ['','Net Cash from Operating Activities',600],
  ['','INVESTING ACTIVITIES',''],['','Net Cash from Investing Activities',0],
 ];
 const view=presentFinancialReportRows('cash_flow',sample);
 assert.deepEqual(view.filter(r=>r.kind==='section').map(r=>r.cells[1]),
  ['OPERATING ACTIVITIES','Sales','Purchases','Payroll','INVESTING ACTIVITIES']);
 assert.equal(view.find(r=>r.cells[1]==='INVESTING ACTIVITIES').kind,'section');
 assert.equal(view.find(r=>r.cells[1]==='Net Cash from Operating Activities').kind,'total');
 assert.equal(view.filter(r=>r.cells[1]==='Purchases'&&r.kind==='standard').length,1);
});
test('Breakdown numeric values remain untouched without automatic grouping',()=>{
 const rows=[['6210','Payroll Tax',100,150,-20]];
 const result=presentFinancialReportRows('pnl',rows,true);
 assert.deepEqual(result,[{kind:'standard',cells:rows[0]}]);
});
test('Financial Reports uses shared native print preview, not fixed 640px scroll capture',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const print=readFileSync(new URL('../src/TBSFinancialReportPrint.jsx',import.meta.url),'utf8');
 const report=app.slice(app.indexOf('function ReportsView('),app.indexOf('function ChartOfAccountsView('));
 assert.ok(report.includes('<TBSFinancialReportPrint businessName={businessName}'));
 assert.ok(!report.includes('onClick={() => window.print()}'));
 assert.ok(print.includes('return createPortal('));
 assert.ok(print.includes('print-color-adjust: exact'));
 assert.ok(print.includes('table-header-group'));
 assert.ok(print.includes('page-break-before: always'));
 assert.ok(print.includes('page-break-inside: avoid'));
 assert.ok(print.includes('overflow: visible !important'));
 assert.ok(print.includes('body > *:not(.tbs-report-preview-overlay)'));
 assert.ok(print.includes('position: static !important'));
 assert.ok(print.includes('reportPrintCell(cell)'));
 assert.ok(print.includes('reportPrintNumeric(cell)'));
 assert.ok(print.includes('breakdown &&')===false || print.includes('header.length<=6'));
});
