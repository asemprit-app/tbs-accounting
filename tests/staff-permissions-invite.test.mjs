import test from 'node:test';
import assert from 'node:assert/strict';
import { isSupervisor,canUseExecutiveReport,canUseCfoOverview,canUseOperationalStaffFeatures } from '../src/tbsStaffPermissions.js';
import { staffInvitationAllowed,staffInviteTarget,staffSetupRedirect } from '../api/invite-staff.js';

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
