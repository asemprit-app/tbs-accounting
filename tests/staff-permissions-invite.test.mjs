import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { isSupervisor,canUseExecutiveReport,canUseCfoOverview,canUseOperationalStaffFeatures } from '../src/tbsStaffPermissions.js';
import { staffInvitationAllowed,staffInviteTarget,staffSetupRedirect,staffSetupLink } from '../api/invite-staff.js';

test('Only supervisor has executive reports and CFO overview',()=>{
 const sup={role:'staff',access_level:'supervisor'};
 const admin={role:'staff',access_level:'admin'};
 assert.ok(isSupervisor(sup));
 assert.ok(canUseExecutiveReport(sup));
 assert.ok(canUseCfoOverview(sup));
 assert.ok(canUseOperationalStaffFeatures(admin));
 assert.ok(!canUseExecutiveReport(admin));
 assert.ok(!canUseCfoOverview(admin));
 assert.ok(!canUseExecutiveReport({role:'client',access_level:'admin'}));
 assert.ok(staffInvitationAllowed(sup));
 assert.ok(!staffInvitationAllowed(admin));
});

test('Onboarding invitation is limited to approved staff mailbox',()=>{
 assert.ok(staffInviteTarget('ADMIN@twelvestrategies.com'));
 assert.ok(!staffInviteTarget('unrelated@example.com'));
 assert.equal(staffSetupRedirect(),'https://tbs-accounting.vercel.app/?setup=staff');
});

test('Staff password link opens the actual production application, not localhost',()=>{
 const hash='a'.repeat(64);
 const link=staffSetupLink(hash,'recovery');
 assert.equal(link,'https://tbs-accounting.vercel.app/?setup=staff#token_hash='+hash+'&type=recovery');
 assert.doesNotMatch(link,/localhost|supabase\.co\/auth\/v1\/verify/);
 assert.throws(()=>staffSetupLink('tiny','recovery'));
 assert.throws(()=>staffSetupLink(hash,'other'));
});
test('App handles the one-time verification before login and password update',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const setup=readFileSync(new URL('../src/TBSStaffPasswordSetup.jsx',import.meta.url),'utf8');
 assert.ok(app.indexOf('if (requiresPasswordSetup)') < app.indexOf('if (!session) {\n    return ('));
 assert.match(setup,/auth\.verifyOtp\(\{ token_hash: setupLink\.tokenHash, type: setupLink\.type \}\)/);
 assert.match(setup,/role !== 'staff'/);
 assert.match(setup,/access_level !== 'admin'/);
 assert.match(setup,/auth\.updateUser\(\{ password: newPassword/);
});
