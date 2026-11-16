import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import handler,{isRealPdf} from '../api/send-executive-report.js';

const clientId='11111111-1111-4111-8111-111111111111';
const userId='22222222-2222-4222-8222-222222222222';
const payload=Buffer.concat([Buffer.from('%PDF-1.4\n/Type /Page\n'),Buffer.alloc(1610,32),Buffer.from('\n%%EOF')]);
assert.equal(isRealPdf(payload),true);

function response(ok=true,body={}){
 return {ok,status:ok?200:503,json:async()=>body};
}
async function invoke({storageOk=true,mailOk=true,recordOk=true}={}){
 const originalFetch=globalThis.fetch;
 const previous={
  SUPABASE_URL:process.env.SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY:process.env.SUPABASE_PUBLISHABLE_KEY,
  RESEND_API_KEY:process.env.RESEND_API_KEY,
 };
 process.env.SUPABASE_URL='https://example.supabase.co';
 process.env.SUPABASE_PUBLISHABLE_KEY='public-test';
 process.env.RESEND_API_KEY='test-key';
 const calls=[];
 globalThis.fetch=async(url,options={})=>{
  const pathname=String(url);
  calls.push({url:pathname,options});
  if(pathname.includes('/auth/v1/user'))return response(true,{id:userId});
  if(pathname.includes('/rest/v1/profiles'))return response(true,[{role:'staff',access_level:'supervisor'}]);
  if(pathname.includes('/rest/v1/clients'))return response(true,[{id:clientId,name:'Cliente Prueba'}]);
  if(pathname.includes('/storage/v1/object/'))return response(storageOk,{});
  if(pathname.includes('api.resend.com/emails'))return response(mailOk,{id:'provider-123'});
  if(pathname.includes('/rest/v1/tbs_executive_report_archives'))return response(recordOk,{});
  throw Error('Unexpected URL: '+pathname);
 };
 const res={
  statusCode:200,headers:{},
  setHeader(k,v){this.headers[k]=v;return this;},
  status(code){this.statusCode=code;return this;},
  json(body){this.body=body;return this;},
 };
 const req={
  method:'POST',headers:{authorization:'Bearer staff-session'},
  body:{clientId,from:'2026-01-01',to:'2026-01-31',toEmail:'customer@example.com',
   subject:'Reporte ejecutivo',message:'Texto del reporte',pdfBase64:payload.toString('base64')},
 };
 try{await handler(req,res);}finally{
  globalThis.fetch=originalFetch;
  for(const [name,value] of Object.entries(previous)){
   if(value===undefined)delete process.env[name];else process.env[name]=value;
  }
 }
 return {res,calls};
}
test('archive original bytes before email acceptance, then write sent ledger',async()=>{
 const {res,calls}=await invoke();
 assert.equal(res.statusCode,200);
 assert.equal(res.body.accepted,true);
 assert.equal(res.body.archived,true);
 const storageIndex=calls.findIndex(c=>c.url.includes('/storage/v1/object/'));
 const mailIndex=calls.findIndex(c=>c.url.includes('api.resend.com/emails'));
 const recordIndex=calls.findIndex(c=>c.url.includes('/rest/v1/tbs_executive_report_archives'));
 assert.ok(storageIndex>=0&&storageIndex<mailIndex&&mailIndex<recordIndex);
 assert.deepEqual(Buffer.from(calls[storageIndex].options.body),payload);
 const recorded=JSON.parse(calls[recordIndex].options.body);
 assert.equal(recorded.client_id,clientId);
 assert.equal(recorded.recipient_email,'customer@example.com');
 assert.equal(recorded.sent_by,userId);
 assert.match(recorded.sha256,/^[0-9a-f]{64}$/);
 assert.match(recorded.storage_path,/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/);
});
test('no email is sent if storing the original PDF fails',async()=>{
 const {res,calls}=await invoke({storageOk:false});
 assert.equal(res.statusCode,503);
 assert.equal(calls.some(c=>c.url.includes('api.resend.com/emails')),false);
});
test('provider rejection does not create a sent-report ledger entry',async()=>{
 const {res,calls}=await invoke({mailOk:false});
 assert.equal(res.statusCode,502);
 assert.equal(calls.some(c=>c.url.includes('/rest/v1/tbs_executive_report_archives')),false);
});
test('accepted email is acknowledged if the ledger insert fails, with a warning',async()=>{
 const {res}=await invoke({recordOk:false});
 assert.equal(res.body.accepted,true);
 assert.equal(res.body.archived,false);
 assert.match(res.body.archiveWarning,/falta registrar/);
});
test('executive history allows opening saved periods and downloading stored originals',()=>{
 const component=readFileSync(new URL('../src/TBSExecutiveFinancialReport.jsx',import.meta.url),'utf8');
 const reports=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(component,/Historial de reportes/);
 assert.match(component,/tbs_executive_report_notes/);
 assert.match(component,/tbs_executive_report_archives/);
 assert.match(component,/onOpenPeriod\(periodFrom,periodTo\)/);
 assert.match(component,/\.storage\.from\('tbs-executive-reports'\)\.download/);
 assert.match(reports,/onOpenPeriod=\{openExecutiveSavedPeriod\}/);
});
