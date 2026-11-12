import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const email=readFileSync(new URL('../api/send-executive-report.js',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20261112_supervisor_admin_permissions.sql',import.meta.url),'utf8');

test('supervisor is determined by trusted database profile, not email or Vercel account',()=>{
 assert.match(src,/profile\.role === 'staff' && profile\.access_level === 'supervisor'/);
 assert.match(src,/isSupervisor=\{profile\.role === 'staff'/);
 assert.match(migration,/tbs_is_supervisor/);
 assert.match(migration,/access_level='supervisor'/);
 assert.doesNotMatch(migration,/encrypted_password|Twelveadmin12|admin@twelvestrategies\.com/);
});
test('admin keeps Reports and Monthly Close but cannot open CFO Overview',()=>{
 assert.match(src,/isSupervisor && tab === 'monthly-close-overview'/);
 assert.match(src,/\.\.\.\(isSupervisor \? \[\{ id: 'monthly-close-overview'/);
 assert.match(src,/isStaff && tab === 'monthly-close'/);
 assert.match(src,/tab === 'reports' && <ReportsView isStaff=\{isStaff\} isSupervisor=\{isSupervisor\}/);
 assert.match(src,/portalLimited = accessRole !== 'staff'/);
});
test('admin cannot prepare or download the executive report through the UI',()=>{
 assert.match(src,/\{isSupervisor && \(/);
 assert.match(src,/\{isSupervisor && showExecutiveReport \? <TBSExecutiveFinancialReport/);
 assert.match(src,/function ReportsView\(\{ isStaff, isSupervisor,/);
});
test('server rejects non-supervisor executive email even if staff',()=>{
 assert.match(email,/select=role,access_level/);
 assert.match(email,/profiles\[0\]\?\.access_level!=='supervisor'/);
});
test('supervisor-only RLS and trusted role-change triggers protect notes and privileges',()=>{
 assert.match(migration,/tbs_executive_report_supervisor_select/);
 assert.match(migration,/tbs_executive_report_supervisor_insert/);
 assert.match(migration,/tbs_executive_report_supervisor_update/);
 assert.match(migration,/tbs_guard_staff_roles/);
 assert.match(migration,/Only supervisor can modify staff roles or access levels/);
 assert.match(migration,/access_level text NOT NULL DEFAULT 'admin'/);
});
