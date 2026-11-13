import test from 'node:test';
import assert from 'node:assert/strict';
import {isoMonth,monthlyRange,fullCalendarMonths,operationalMetricSummary,operationalMetricFormat} from '../src/tbsOperationalMetrics.js';
const metrics=[
 {id:'patients',name:'Pacientes atendidos',unit:'pacientes',aggregation:'sum',active:true},
 {id:'occupancy',name:'Ocupación',unit:'%',aggregation:'average',active:true},
 {id:'end',name:'Censo al cierre',unit:'camas',aggregation:'last',active:true},
 {id:'off',name:'Inactivo',unit:'unidades',aggregation:'sum',active:false},
];
const values=[
 {metric_id:'patients',period_month:'2026-01-01',value:240},
 {metric_id:'patients',period_month:'2026-02-01',value:260},
 {metric_id:'occupancy',period_month:'2026-01-01',value:78},
 {metric_id:'occupancy',period_month:'2026-02-01',value:82},
 {metric_id:'end',period_month:'2026-01-01',value:13},
 {metric_id:'end',period_month:'2026-02-01',value:16},
 {metric_id:'off',period_month:'2026-01-01',value:80},
];
test('operational periods normalize calendar months and leap years',()=>{
 assert.equal(isoMonth('2026-02-15'),'2026-02-01');
 assert.equal(isoMonth('2026-13-01'),'');
 assert.deepEqual(monthlyRange('2026-01-01','2026-03-31'),
 ['2026-01-01','2026-02-01','2026-03-01']);
 assert.equal(fullCalendarMonths('2026-01-01','2026-02-28'),true);
 assert.equal(fullCalendarMonths('2026-01-10','2026-02-28'),false);
 assert.equal(fullCalendarMonths('2024-02-01','2024-02-29'),true);
});
test('sum, average and last monthly measurements do not mix aggregation',()=>{
 const rows=operationalMetricSummary(metrics,values,'2026-01-01','2026-02-28',65000);
 assert.equal(rows.length,3);
 assert.equal(rows[0].result,500);
 assert.equal(rows[0].revenuePerUnit,130);
 assert.ok(Math.abs(rows[0].trendPct-100*(260-240)/240)<1e-9);
 assert.equal(rows[1].result,80);
 assert.equal(rows[1].revenuePerUnit,null);
 assert.equal(rows[2].result,16);
});
test('no invented ratio when a month is absent or financial interval is partial',()=>{
 const incomplete=operationalMetricSummary(metrics,values,'2026-01-01','2026-03-31',70000);
 assert.equal(incomplete[0].periodCount,2);
 assert.equal(incomplete[0].expectedMonths,3);
 assert.equal(incomplete[0].revenuePerUnit,null);
 const partial=operationalMetricSummary(metrics,values,'2026-01-15','2026-02-28',65000);
 assert.equal(partial[0].revenuePerUnit,null);
 assert.ok(operationalMetricFormat(77,'%').includes('%'));
});
test('operational values are read-only accounting inputs (no GL mapping)',()=>{
 const helper=operationalMetricSummary(metrics,values,'2026-01-01','2026-02-28',65000);
 assert.ok(helper.every(r=>!('gl' in r)&&!('journal_entries' in r)));
});
