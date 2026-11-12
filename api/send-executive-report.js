// Email a validated executive report PDF to an explicitly selected recipient.
// Staff-only JWT validation, client existence, PDF header/pages/EOF and bounded
// attachment size. No emails are sent on page load, report preview, or save.
import {ensureCompanyContact,validRecipientEmail} from '../src/tbsExecutiveEmail.js';

const respond=(res,status,body)=>res.status(status).json(body);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const iso=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'');
const fileSafe=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
 .replace(/[^A-Za-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,46);

export function validateExecutiveEmailRequest(body={}){
 if(!uuid.test(String(body.clientId||'')))return 'Invalid client ID.';
 if(!iso(body.from)||!iso(body.to)||body.from>body.to)return 'A valid report period is required.';
 if(!validRecipientEmail(body.toEmail))return 'Enter one valid recipient email address.';
 if(typeof body.subject!=='string'||!body.subject.trim()||body.subject.length>190)return 'A valid subject is required.';
 if(typeof body.message!=='string'||!body.message.trim()||body.message.length>7000)return 'A valid email message is required.';
 const b64=body.pdfBase64;
 if(typeof b64!=='string'||b64.length<1800||b64.length>4_100_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(b64))
  return 'Invalid or oversized PDF attachment (max 3 MB).';
 return null;
}
export function isRealPdf(buffer){
 if(!Buffer.isBuffer(buffer)||buffer.length<1500||buffer.length>3*1024*1024)return false;
 const prefix=buffer.subarray(0,5).toString('ascii');
 const end=buffer.subarray(Math.max(0,buffer.length-1500)).toString('latin1');
 const sample=buffer.toString('latin1');
 return prefix==='%PDF-'&&end.includes('%%EOF')&&/\/Type\s*\/Page\b/.test(sample);
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return respond(res,405,{error:'Method not allowed.'});}
 const token=(String(req.headers?.authorization||'').match(/^Bearer\s+(\S+)$/i)||[])[1];
 if(!token)return respond(res,401,{error:'Staff sign-in is required.'});
 const body=req.body||{};
 const invalid=validateExecutiveEmailRequest(body);
 if(invalid)return respond(res,400,{error:invalid});
 const pdf=Buffer.from(body.pdfBase64,'base64');
 if(!isRealPdf(pdf))return respond(res,400,{error:'The attachment must be a complete, nonempty PDF.'});
 const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
 const key=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_ANON_KEY;
 const resend=process.env.RESEND_API_KEY;
 if(!url||!key||!resend)return respond(res,503,{error:'The secure email service is not configured.'});
 const headers={apikey:key,Authorization:'Bearer '+token};
 try{
  const auth=await fetch(url+'/auth/v1/user',{headers});
  if(!auth.ok)return respond(res,401,{error:'Your session has expired.'});
  const user=await auth.json();
  if(!user?.id)return respond(res,401,{error:'Invalid session.'});
  const profileRes=await fetch(url+'/rest/v1/profiles?select=role&id=eq.'+encodeURIComponent(user.id)+'&limit=1',{headers});
  if(!profileRes.ok)return respond(res,503,{error:'Could not verify staff permissions.'});
  const profiles=await profileRes.json();
  if(!Array.isArray(profiles)||profiles[0]?.role!=='staff')
   return respond(res,403,{error:'Only authorized TBS staff may email executive reports.'});
  const clientRes=await fetch(url+'/rest/v1/clients?select=id,name&id=eq.'+
    encodeURIComponent(body.clientId)+'&limit=1',{headers});
  if(!clientRes.ok)return respond(res,503,{error:'Could not verify client scope.'});
  const clients=await clientRes.json();
  if(!Array.isArray(clients)||clients.length!==1)
   return respond(res,404,{error:'Client not found.'});
  const name=String(clients[0].name||'Cliente').trim();
  const filename='Reporte_Ejecutivo_'+fileSafe(name)+'_'+body.from+'_a_'+body.to+'.pdf';
  const replyTo='admin@twelvestrategies.com';
  const from=process.env.RESEND_FROM||'onboarding@resend.dev';
  const data={
   from,to:[body.toEmail.trim().toLowerCase()],reply_to:replyTo,
   subject:body.subject.trim(),text:ensureCompanyContact(body.message),
   attachments:[{filename,content:body.pdfBase64,content_type:'application/pdf'}],
  };
  const response=await fetch('https://api.resend.com/emails',{
   method:'POST',headers:{Authorization:'Bearer '+resend,'Content-Type':'application/json'},
   body:JSON.stringify(data),
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)return respond(res,502,{error:result.message||result.error||'Email provider rejected the request.'});
  return respond(res,200,{accepted:true,to:body.toEmail.trim().toLowerCase(),id:result.id||null,filename});
 }catch(err){
  return respond(res,503,{error:'Executive email service temporarily unavailable.'});
 }
}
