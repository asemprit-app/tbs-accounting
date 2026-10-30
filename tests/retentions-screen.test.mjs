import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/TBSRetentionsView.jsx',import.meta.url),'utf8');
const migration=readFileSync(new URL('../docs/sql/tbs_retention_payments.sql',import.meta.url),'utf8');

test('Retentions is a separate staff-only navigation screen scoped to the active client',()=>{
 assert.ok(app.includes("label: 'Retenciones / Retentions'"));
 assert.ok(app.includes("{isStaff && tab === 'retentions'"));
 assert.ok(app.includes("<TBSRetentionsView clientId={clientId}"));
});
test('Payments are client-scoped and changes are persisted with RLS-protected Supabase queries',()=>{
 assert.ok(ui.includes(".eq('client_id',clientId)"));
 assert.ok(ui.includes(".insert({...payload,client_id:clientId,created_by:user.id})"));
 assert.ok(ui.includes(".update(payload)"));
 assert.ok(ui.includes(".delete()"));
 assert.match(migration,/enable row level security/);
 assert.match(migration,/created_by = \(select auth.uid\(\)\)/);
 assert.match(migration,/tbs_is_staff\(\)/);
});
test('Invalid, overdraft, or missing tax-period payments require confirmation and do not change GL',()=>{
 assert.ok(ui.includes('validPeriod(form.tax_period)'));
 assert.ok(ui.includes("amount>available+0.009"));
 assert.ok(ui.includes('window.confirm'));
 assert.ok(ui.includes('sin aplicarse a otros períodos') || ui.includes('sin aplicarse a otros períodos'));
 assert.ok(!ui.includes(".from('journal_entries').insert"));
});
