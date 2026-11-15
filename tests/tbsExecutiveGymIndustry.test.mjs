import test from 'node:test';
import assert from 'node:assert/strict';
import {INDUSTRY_OPTIONS,executiveNarrative} from '../src/tbsExecutiveReportRules.js';

test('gimnasios appears as a unique industry choice in executive report',()=>{
 const choices=INDUSTRY_OPTIONS.filter(([key])=>key==='gym');
 assert.deepEqual(choices,[['gym','Gimnasios']]);
 assert.equal(new Set(INDUSTRY_OPTIONS.map(([key])=>key)).size,INDUSTRY_OPTIONS.length);
});
test('gym industry generates contextual prompts without invented benchmarks',()=>{
 const report=executiveNarrative({},{hasActivity:false},'gym');
 assert.match(report.sectorOpportunities,/membresías/);
 assert.match(report.sectorOpportunities,/retención/);
 assert.match(report.sectorThreats,/mantenimiento de equipos/);
 assert.match(report.sectorDataStatus,/no son estadísticas/);
});
test('existing industry signals remain available',()=>{
 const pharmacy=executiveNarrative({},{hasActivity:false},'pharmacy');
 assert.match(pharmacy.sectorOpportunities,/recetario/);
 const general=executiveNarrative({},{hasActivity:false},'general');
 assert.notEqual(general.sectorOpportunities,pharmacy.sectorOpportunities);
});
