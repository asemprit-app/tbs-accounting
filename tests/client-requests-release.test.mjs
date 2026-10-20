import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const control=readFileSync(new URL('../src/TBSControlCenter.jsx',import.meta.url),'utf8');
const request=readFileSync(new URL('../src/TBSClientRequests.jsx',import.meta.url),'utf8');
const api=readFileSync(new URL('../api/send-client-request.js',import.meta.url),'utf8');
test('regular module names do not say internal pilot',()=>{
 assert.doesNotMatch(control,/internal pilot/i);
 assert.match(control,/Monthly Close/);
 assert.match(control,/TBS Review Queue/);
});
test('staff and clients have Client Requests access but score stays unpublished',()=>{
 assert.match(app,/tab === 'client-requests' && <TBSClientRequests/);
 assert.match(app,/portalLimited \? allItems.filter\(it => .*'client-requests'/);
 assert.doesNotMatch(app,/TBSClientHealthScore/);
});
test('client notifications require verified staff and never trust browser recipient',()=>{
 assert.match(api,/admin.auth.getUser\(token\)/);
 assert.match(api,/staff\?\.role!=='staff'/);
 assert.match(api,/\.eq\('client_id',request.client_id\)/);
 assert.match(api,/admin.auth.admin.getUserById/);
 assert.doesNotMatch(api,/req.body\.email/);
 assert.doesNotMatch(api,/request\.title/);
});
test('request persists even if email fails',()=>{
 assert.match(request,/Request saved in TBS, but the email notification was not accepted/);
 assert.match(request,/\.select\('id'\)\.single\(\)/);
});
