// Email one final Payroll pay stub to its matching employee only.
// Never accept the recipient address from the browser; resolve it from the scoped database.
const reply = (res,status,body)=>res.status(status).json(body);
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return reply(res,405,{error:'Method not allowed.'});}
  const authorization=req.headers?.authorization||'';
  const token=typeof authorization==='string'&&/^Bearer\s+\S+$/i.test(authorization)?authorization.replace(/^Bearer\s+/i,''):'';
  if(!token)return reply(res,401,{error:'Sign in to send pay stubs.'});
  const {lineId,pdfBase64}=req.body||{};
  if(typeof lineId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(lineId))return reply(res,400,{error:'Valid payroll line required.'});
  if(typeof pdfBase64!=='string'||pdfBase64.length>7_200_000||pdfBase64.length<30||!/^[A-Za-z0-9+/]+={0,2}$/.test(pdfBase64))
    return reply(res,400,{error:'Invalid PDF attachment (max 5 MB).'});
  const pdf=Buffer.from(pdfBase64,'base64');
  if(pdf.length>5*1024*1024||pdf.subarray(0,5).toString()!=='%PDF-')return reply(res,400,{error:'A valid PDF is required.'});
  const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
  const key=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_ANON_KEY;
  const apiKey=process.env.RESEND_API_KEY;
  if(!url||!key||!apiKey)return reply(res,503,{error:'Email service is not configured.'});
  const headers={apikey:key,Authorization:`Bearer ${token}`};
  try{
    const auth=await fetch(`${url}/auth/v1/user`,{headers});
    if(!auth.ok)return reply(res,401,{error:'Session expired.'});
    const user=await auth.json();
    if(!user?.id)return reply(res,401,{error:'Invalid session.'});
    async function findOne(path){
      const r=await fetch(`${url}/rest/v1/${path}`,{headers});
      if(!r.ok)throw Error('Permission or database lookup failed.');
      const data=await r.json();
      return Array.isArray(data)?data[0]:null;
    }
    const profile=await findOne(`profiles?select=role,client_id&id=eq.${encodeURIComponent(user.id)}&limit=1`);
    if(!profile||!['staff','client'].includes(profile.role))return reply(res,403,{error:'Not authorized to send payroll.'});
    const line=await findOne(`payroll_lines?select=id,employee_id,payroll_run_id,client_id&id=eq.${encodeURIComponent(lineId)}&limit=1`);
    if(!line)return reply(res,404,{error:'Payroll line not found.'});
    const run=await findOne(`payroll_runs?select=id,client_id,pay_date,period_start,period_end,status&id=eq.${encodeURIComponent(line.payroll_run_id)}&limit=1`);
    if(!run)return reply(res,404,{error:'Payroll run not found.'});
    if(line.client_id!==run.client_id)return reply(res,403,{error:'Payroll line belongs to a different client.'});
    if(profile.role==='client'&&profile.client_id!==run.client_id)return reply(res,403,{error:'Not authorized for this client.'});
    if(run.status!=='FINAL')return reply(res,409,{error:'Finalize the payroll run before emailing pay stubs.'});
    const employee=await findOne(`employees?select=id,name,email,client_id&id=eq.${encodeURIComponent(line.employee_id)}&client_id=eq.${encodeURIComponent(run.client_id)}&limit=1`);
    if(!employee)return reply(res,404,{error:'Employee not found in this client.'});
    const to=String(employee.email||'').trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)||to.length>254)return reply(res,409,{error:'Employee is missing a valid email address.'});
    const result=await fetch('https://api.resend.com/emails',{
      method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        from:process.env.RESEND_FROM||'onboarding@resend.dev',
        to:[to],
        subject:`Pay Stub — ${run.pay_date}`,
        text:`Hello ${employee.name},\n\nAttached is your pay stub for ${run.period_start} through ${run.period_end} (pay date ${run.pay_date}).\n\nFor questions, please contact your employer.\n`,
        attachments:[{filename:`PayStub_${run.pay_date}.pdf`,content:pdfBase64}],
      })
    });
    const sent=await result.json().catch(()=>({}));
    if(!result.ok)return reply(res,502,{error:sent.message||'Email provider rejected this pay stub.'});
    return reply(res,200,{success:true,to,id:sent.id||null});
  }catch{
    return reply(res,503,{error:'Pay stub email service temporarily unavailable.'});
  }
}
