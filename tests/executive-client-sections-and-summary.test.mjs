import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EXECUTIVE_SECTIONS,DEFAULT_CLIENT_SECTIONS,normalizeClientSections,
 includeExecutiveSection,simpleExecutiveSummary} from '../src/tbsExecutiveSections.js';
import {createExecutivePdf} from '../src/tbsExecutiveReportPdf.js';
import {buildExecutiveWord} from '../src/tbsExecutiveReportWord.js';
import {KPI_OPTIONS,executiveMetrics} from '../src/tbsExecutiveReportRules.js';
const pdfText=doc=>doc.internal.pages.slice(1).map(page=>page.join('\n')).join('\n');
const goodFinancials={revenue:25000,expenses:19000,netIncome:6000,
 periodRecords:20,arMismatch:false,balanceDifference:0,uncategorizedCount:0,reconciliationAlerts:0};
function payload(overrides={}){
 return {
  businessName:'Cliente de prueba',from:'2026-08-01',to:'2026-08-31',industryLabel:'Servicios',
  metrics:KPI_OPTIONS.filter(k=>['revenue','expenses','net_income'].includes(k.key)),
  metricValues:executiveMetrics(goodFinancials),financials:goodFinancials,
  narrative:{findings:['Venta mensual valida'],opportunities:['Oportunidad operacional interna'],
   risks:['Riesgo financiero interno'],shortTerm:['Accion corta interna'],
   mediumTerm:['Estrategia mediana interna'],questions:['Pregunta privada de reunion'],
   sectorOpportunities:'Hipotesis externa',sectorThreats:'Riesgo competitivo'},
  notes:{ownerDiscussion:'NOTAS SUPER SECRETAS SOLO TBS',agreements:'ACUERDOS CONFIDENCIALES SOLO TBS',
   marketContext:'EVIDENCIA EXTERNA PRIVADA',marketSource:'Fuente externa'},
  clientSections:['summary'],
  ...overrides,
 };
}
test('default client delivery excludes confidential meeting notes and unverified market context',()=>{
 assert.equal(DEFAULT_CLIENT_SECTIONS.includes('meetingNotes'),false);
 assert.equal(DEFAULT_CLIENT_SECTIONS.includes('market'),false);
 assert.equal(includeExecutiveSection({clientSections:DEFAULT_CLIENT_SECTIONS},'summary'),true);
 assert.equal(includeExecutiveSection({clientSections:DEFAULT_CLIENT_SECTIONS},'meetingNotes'),false);
 assert.deepEqual(normalizeClientSections(['meetingNotes','summary','invalid','summary']),['summary','meetingNotes']);
 assert.equal(EXECUTIVE_SECTIONS.length,14);
 assert.equal(DEFAULT_CLIENT_SECTIONS.includes('monthlySales'),true);
});
test('executive summary communicates revenue, expense, net profit and a priority without invented market numbers',()=>{
 const summary=simpleExecutiveSummary(goodFinancials,executiveMetrics(goodFinancials)).join(' ');
 assert.match(summary,/ventas de \$25,000\.00/);
 assert.match(summary,/gastos de \$19,000\.00/);
 assert.match(summary,/ganancia neta de \$6,000\.00/);
 assert.match(summary,/prioridad es proteger la ganancia/);
 const loss=simpleExecutiveSummary({...goodFinancials,netIncome:-3500},
  executiveMetrics({...goodFinancials,netIncome:-3500})).join(' ');
 assert.match(loss,/pérdida neta de \$3,500\.00/);
 const noData=simpleExecutiveSummary({...goodFinancials,periodRecords:0},
  executiveMetrics(goodFinancials)).join(' ');
 assert.match(noData,/No hay suficiente actividad/);
});
test('client PDF containing only summary omits risk, advice, market and confidential notes',()=>{
 const doc=createExecutivePdf(payload());
 const content=pdfText(doc);
 assert.match(content,/Resumen ejecutivo/);
 assert.doesNotMatch(content,/NOTAS SUPER SECRETAS/);
 assert.doesNotMatch(content,/ACUERDOS CONFIDENCIALES/);
 assert.doesNotMatch(content,/Oportunidad operacional interna/);
 assert.doesNotMatch(content,/EVIDENCIA EXTERNA PRIVADA/);
 assert.doesNotMatch(content,/Estrategias a corto plazo/);
});
test('including meetingNotes in PDF explicitly is required before confidential note is printed',()=>{
 const doc=createExecutivePdf(payload({clientSections:['summary','meetingNotes']}));
 const content=pdfText(doc);
 assert.match(content,/NOTAS SUPER SECRETAS/);
});
test('Word returns genuine DOCX when only summary is selected',async()=>{
 const blob=await buildExecutiveWord(payload({clientSections:['summary']}));
 const bytes=Buffer.from(await blob.arrayBuffer());
 assert.equal(bytes.subarray(0,4).toString('hex'),'504b0304');
});
test('UI saves explicit section preferences and previews the selected client delivery contents',()=>{
 const component=readFileSync(new URL('../src/TBSExecutiveFinancialReport.jsx',import.meta.url),'utf8');
 const sql=readFileSync(new URL('../supabase/migrations/20261112b_executive_client_sections.sql',import.meta.url),'utf8');
 assert.match(component,/Seleccionar las partes que deseas compartir con el cliente/);
 assert.match(component,/client_sections:normalizeClientSections\(notes.clientSections\)/);
 assert.match(component,/clientSections:normalizeClientSections\(row.client_sections\)/);
 assert.match(component,/Secciones incluidas:/);
 assert.match(sql,/ADD COLUMN IF NOT EXISTS client_sections/);
});
