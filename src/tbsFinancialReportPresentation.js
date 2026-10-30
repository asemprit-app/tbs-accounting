// Common report presentation rules, shared by PDF print preview and print CSS.
// The accounting report values are left untouched; only display is formatted.
const currency = new Intl.NumberFormat('en-US', {
  style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2,
});
export const financialReportMoney = value => currency.format(Number(value)||0);

const TOP_LEVEL_TOTALS = new Set([
 'Total Sales','Total COGS','Gross Profit','Operating Expenses',
 'Total Expenses incl. COGS','Net Income','Total Assets',
 'Total Liabilities','Total Equity','Liabilities + Equity',
 'Balance Check (Assets - Liabilities - Equity)',
 'Net Cash from Operating Activities','Net Cash from Investing Activities',
 'Net Cash from Financing Activities','Total Starting Balance',
 'Total Ending Balance','Gross Cash Inflow','Gross Cash Outflow',
 'Net Cash Change','Total A/P','Total'
]);
const SECTION_HEADINGS = new Set([
 'OPERATING ACTIVITIES','INVESTING ACTIVITIES','FINANCING ACTIVITIES','OVERVIEW',
]);
export function reportPrintRowStyle(key, row) {
  const name=String(row?.[1]||'').trim();
  const first=String(row?.[0]||'').trim();
  if(key==='cash_flow'&&SECTION_HEADINGS.has(name))return 'section';
  if(TOP_LEVEL_TOTALS.has(name)||(first==='Total'&&key==='ar_aging'))return 'total';
  return 'standard';
}
export function reportPrintColumns(header) {
  return (header||[]).map((name,i)=>({
    name,
    index:i,
    // Numeric columns are determined from the cells themselves, because
    // financial breakdowns place monetary values in every period column.
    align:'left',
  }));
}
export function reportPrintCell(value) {
  return typeof value==='number'?financialReportMoney(value):String(value??'');
}
export function reportPrintNumeric(value) {
  return typeof value==='number';
}
export function reportPrintLandscape(header) {
  // Five-column breakdowns remain portrait; six or more need landscape.
  return (header?.length||0)>=6;
}
