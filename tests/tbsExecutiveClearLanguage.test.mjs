import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EXECUTIVE_SECTIONS,simpleExecutiveSummary} from '../src/tbsExecutiveSections.js';

test('executive report section headings are professional without readability qualifiers',()=>{
 const summary=EXECUTIVE_SECTIONS.find(s=>s.key==='summary');
 assert.equal(summary?.label,'Resumen ejecutivo');
 const screen=readFileSync(new URL('../src/TBSExecutiveFinancialReport.jsx',import.meta.url),'utf8');
 const pdf=readFileSync(new URL('../src/tbsExecutiveReportPdf.js',import.meta.url),'utf8');
 const word=readFileSync(new URL('../src/tbsExecutiveReportWord.js',import.meta.url),'utf8');
 for(const content of [screen,pdf,word]){
  assert.doesNotMatch(content,/en palabras sencillas|sencillo y fácil de entender|interpretación sencilla/i);
  assert.match(content,/Resumen ejecutivo/);
 }
 assert.match(screen,/Hallazgos principales/);
});

test('financial summary explains net margin directly, without self-describing its language',()=>{
 const paragraphs=simpleExecutiveSummary(
  {periodRecords:true},
  {revenue:1000,expenses:800,net_income:200,net_margin:20}
 );
 assert.match(paragraphs.join(' '),/De cada \$100 vendidos, quedaron aproximadamente \$20\.00/);
 assert.doesNotMatch(paragraphs.join(' '),/en términos sencillos|en palabras sencillas/i);
 assert.match(paragraphs[0],/ganancia neta/);
});
