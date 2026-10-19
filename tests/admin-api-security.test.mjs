import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const api=readFileSync(new URL('../api/create-client-user.js',import.meta.url),'utf8');

test('Anonymous GET diagnostics have been removed from client user administration',()=>{
  assert.doesNotMatch(api,/if\s*\(req\.method\s*===\s*'GET'\)/);
  assert.doesNotMatch(api,/adminKeyValid|keyType\s*[,}]/);
  assert.match(api,/if\s*\(req\.method\s*!==\s*'POST'\)/);
  assert.match(api,/return json\(res, 405, \{ error: 'Method not allowed\.' \}\)/);
});
test('POST checks authenticated staff before performing user administration',()=>{
  assert.match(api,/admin\.auth\.getUser\(token\)/);
  assert.match(api,/callerProfile\?\.role !== 'staff'/);
  assert.ok(api.indexOf("if (callerProfile?.role !== 'staff')")<api.indexOf("admin.auth.admin.createUser"));
});
