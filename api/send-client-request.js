// Secure, staff-only notification for an existing Client Request.
// Only registered portal accounts linked to the request's client receive an email.
// No sensitive request details or attachments are sent by email.
import {createClient} from '@supabase/supabase-js';

const reply=(res,status,body)=>res.status(status).json(body);
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return reply(res,405,{error:'Method not allowed.'});}
  const bearer=req.headers.authorization||'';
  const token=typeof bearer==='string'&&/^Bearer\\s+\\S+$/.test(bearer)?bearer.replace(/^Bearer\\s+/,''):'';
  if(!token)return reply(res,401,{error:'Staff login required.'});
  const {requestId}=req.body||{};
  if(typeof requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))
    return reply(res,400,{error:'Valid request ID required.'});
  const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
  const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey=process.env.RESEND_API_KEY;
  if(!url||!key||!resendKey)return reply(res,503,{error:'Notification service is not configured.'});
  try{
    const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:caller,error:userError}=await admin.auth.getUser(token);
    if(userError||!caller?.user?.id)return reply(res,401,{error:'Invalid or expired session.'});
    const {data:staff,error:profileError}=await admin.from('profiles').select('role').eq('id',caller.user.id).maybeSingle();
    if(profileError)return reply(res,503,{error:'Could not verify staff access.'});
    if(staff?.role!=='staff')return reply(res,403,{error:'Only TBS staff can notify clients.'});
    const {data:request,error:requestError}=await admin.from('tbs_client_requests').select('id,client_id').eq('id',requestId).maybeSingle();
    if(requestError)return reply(res,503,{error:'Could not verify request.'});
    if(!request)return reply(res,404,{error:'Client Request not found.'});
    const {data:profiles,error:profilesError}=await admin.from('profiles').select('id').eq('client_id',request.client_id).eq('role','client').limit(20);
    if(profilesError)return reply(res,503,{error:'Could not retrieve assigned client accounts.'});
    if(!profiles?.length)return reply(res,409,{error:'No registered client portal account is linked to this business.'});
    const addresses=[];
    for(const p of profiles){
      const {data,error}=await admin.auth.admin.getUserById(p.id);
      if(!error&&data?.user?.email&&data?.user?.email_confirmed_at)addresses.push(data.user.email.trim().toLowerCase());
    }
    const distinct=[...new Set(addresses)].slice(0,20);
    if(!distinct.length)return reply(res,409,{error:'No verified client email address is available for this business.'});
    let accepted=0;
    for(const to of distinct){
      const mail=await fetch('https://api.resend.com/emails',{
        method:'POST',headers:{Authorization:'Bearer '+resendKey,'Content-Type':'application/json'},
        body:JSON.stringify({from:process.env.RESEND_FROM||'onboarding@resend.dev',to:[to],
          subject:'TBS — New request in your client portal',
          text:'Twelve Business Strategies has a new document or information request for your business. Sign in to your private portal to review and respond: https://tbs-accounting.vercel.app/\\n\\nThis email contains no sensitive financial information.'})
      });
      if(mail.ok)accepted++;
    }
    if(!accepted)return reply(res,502,{error:'The email provider did not accept the notification. Request remains saved.'});
    return reply(res,200,{success:true,accepted,attempted:distinct.length});
  }catch(e){return reply(res,503,{error:'Notification service temporarily unavailable.'});}
}
