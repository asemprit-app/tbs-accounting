import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const center=readFileSync(new URL('../src/TBSControlCenter.jsx',import.meta.url),'utf8');
const overview=readFileSync(new URL('../src/TBSMonthlyCloseOverview.jsx',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20261111_monthly_close_ten_task_na.sql',import.meta.url),'utf8');
test('monthly close offers explicit N/A status and uses canonical order',()=>{
 assert.match(center,/CLOSE_TASKS\.map\(/);
 assert.match(center,/N\/A — No aplica/);
 assert.match(center,/notes:e\.target\.value/);
 assert.match(center,/taskSummary\.notApplicable/);
});
test('CFO overview is only reachable through supervisor-only navigation',()=>{
 assert.match(app,/isSupervisor && tab === 'monthly-close-overview'/);
 assert.match(app,/CFO Close Overview/);
 assert.match(app,/tbs_open_tab_once/);
 assert.match(overview,/tbs_monthly_closes/);
 assert.match(overview,/tbs_close_tasks/);
 assert.match(overview,/tbs_review_queue/);
 assert.match(overview,/onOpenClient/);
});
test('database approval guard requires ten tasks and accepts N/A without relaxing critical review controls',()=>{
 assert.match(migration,/'sales_expenses'/);
 assert.match(migration,/task\.status IN \('DONE','NOT_APPLICABLE'\)/);
 assert.match(migration,/r\.priority IN \('HIGH','URGENT'\)/);
 assert.match(migration,/status='IN_PROGRESS'/);
 assert.match(migration,/Approved monthly close tasks are locked/);
});
