import test from 'node:test';
import assert from 'node:assert/strict';
import {kpiValueMatches,kpiDefinitionMatches,verifiedKpiValueInRows} from '../src/tbsKpiIntegrity.js';

const expected={client_id:'nsmaid',metric_id:'patients',period_month:'2026-01-01',value:64,notes:'Revisado'};
test('confirms persisted KPI with matching client, period, measurement and notes',()=>{
 assert.equal(kpiValueMatches({...expected,value:'64.0000'},expected),true);
 assert.equal(verifiedKpiValueInRows([{...expected,value:64} ],expected),true);
});
test('rejects missing, rejected, partial or different KPI records',()=>{
 assert.equal(verifiedKpiValueInRows([],expected),false);
 assert.equal(kpiValueMatches(null,expected),false);
 for(const changes of [{client_id:'other'},{metric_id:'days'},{period_month:'2026-02-01'},{value:65},{value:null},{notes:'No guardada'}]){
  assert.equal(kpiValueMatches({...expected,...changes},expected),false);
 }
});
test('rejects an incomplete or mismatched KPI definition',()=>{
 const definition={client_id:'nsmaid',name:'Pacientes',unit:'pacientes',aggregation:'sum',description:''};
 assert.equal(kpiDefinitionMatches(definition,definition),true);
 assert.equal(kpiDefinitionMatches({...definition,name:'Otro'},definition),false);
 assert.equal(kpiDefinitionMatches(null,definition),false);
});
