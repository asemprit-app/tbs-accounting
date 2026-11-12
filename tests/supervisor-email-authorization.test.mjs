import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/send-executive-report.js';
import {createExecutivePdf} from '../src/tbsExecutiveReportPdf.js';
function response(){return {setHeader(){},status(code){this.code=code;return this;},json(value){this.body=value;return this;}};}
test('authenticated staff administrator cannot send executive reports, even with valid PDF',async()=>{
 const oldFetch=globalThis.fetch;
 const keys=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','RESEND_API_KEY'];
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 const pdf=createExecutivePdf({
  businessName:'Test',from:'2026-10-01',to:'2026-10-31',
  industryLabel:'Services',clientSections:['summary'],
  metricValues:{revenue:1000,expenses:800,net_income:200,net_margin:20},
  metrics:[],financials:{periodRecords:true},narrative:{},notes:{},
 });
 const body={
  clientId:'3445d305-befb-4e1b-9a79-17a6ef70c2f8',from:'2026-10-01',
  to:'2026-10-31',toEmail:'client@example.com',
  subject:'Report',message:'Please see attached.',
  pdfBase64:Buffer.from(pdf.output('arraybuffer')).toString('base64'),
 };
 const requests=[];
 try{
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY='test-public';
  process.env.RESEND_API_KEY='test-provider';
  globalThis.fetch=async url=>{
   requests.push(String(url));
   if(String(url).endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:'admin-uuid'})};
   if(String(url).includes('/rest/v1/profiles'))return {ok:true,json:async()=>[{role:'staff',access_level:'admin'}]};
   throw Error('An admin must not access the mail provider');
  };
  const res=response();
  await handler({method:'POST',headers:{authorization:'Bearer test-token'},body},res);
  assert.equal(res.code,403);
  assert.match(res.body.error,/supervisor/);
  assert.equal(requests.some(url=>url.includes('api.resend.com')),false);
 }finally{
  globalThis.fetch=oldFetch;
  for(const [k,v] of Object.entries(old))v===undefined?delete process.env[k]:process.env[k]=v;
 }
});
