import React,{useEffect,useState} from 'react';
import {supabase} from './supabaseClient';
import TBSClientHealthScore from './TBSClientHealthScore';
const defaults=[['statements','Bank statements received'],['reconciliation','Bank reconciliations verified'],['cards','Credit cards reconciled'],['uncategorized','Uncategorized transactions reviewed'],['payroll','Payroll and services verified'],['journal','Journal entries validated'],['balance','Balance Sheet validated'],['income','Profit & Loss validated'],['report','Client report delivered']];
const panel={background:'#fff',padding:18,border:'1px solid #dde3eb',borderRadius:8,marginBottom:16};
const btn={background:'#17365D',color:'#fff',border:0,borderRadius:6,padding:'9px 14px',cursor:'pointer'};
const get=r=>{if(r.error)throw r.error;return r.data};
export default function TBSControlCenter({clientId,view='close'}){
 const [refreshKey,setRefreshKey]=useState(0),[month,setMonth]=useState(new Date().toISOString().slice(0,7)),[close,setClose]=useState(null),[tasks,setTasks]=useState([]),[reviews,setReviews]=useState([]),[title,setTitle]=useState(''),[priority,setPriority]=useState('NORMAL'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const start=month+'-01',end=new Date(Date.UTC(+month.slice(0,4),+month.slice(5,7),0)).toISOString().slice(0,10);
 async function load(){
  if(!clientId)return;
  setError('');const [c,r]=await Promise.all([supabase.from('tbs_monthly_closes').select('*').eq('client_id',clientId).eq('period_start',start).maybeSingle(),supabase.from('tbs_review_queue').select('*').eq('client_id',clientId).order('created_at',{ascending:false}).limit(200)]);
  if(c.error||r.error){setError((c.error||r.error).message);return}
  setClose(c.data);setReviews(r.data||[]);
  if(c.data){const t=await supabase.from('tbs_close_tasks').select('*').eq('close_id',c.data.id).order('created_at');if(t.error)setError(t.error.message);else setTasks(t.data||[])}else setTasks([]);
  setRefreshKey(v=>v+1);
 }
 useEffect(()=>{load()},[clientId,month]);
 async function save(fn){setBusy(true);setError('');setNotice('');try{await fn();await load();setNotice('Saved successfully.')}catch(e){setError(e.message||String(e))}finally{setBusy(false)}}
 async function initialize(){await save(async()=>{
  let found=get(await supabase.from('tbs_monthly_closes').select('id').eq('client_id',clientId).eq('period_start',start).maybeSingle()),id=found?.id;
  if(!id){const c=get(await supabase.from('tbs_monthly_closes').insert({client_id:clientId,period_start:start,period_end:end,status:'IN_PROGRESS'}).select('id').single());id=c.id}
  const existing=get(await supabase.from('tbs_close_tasks').select('task_key').eq('close_id',id)),keys=new Set((existing||[]).map(x=>x.task_key));
  const missing=defaults.filter(([k])=>!keys.has(k)).map(([task_key,title])=>({close_id:id,task_key,title,status:'PENDING'}));
  if(missing.length)get(await supabase.from('tbs_close_tasks').insert(missing));
 })}
 async function toggleTask(t,done){await save(async()=>{const {data:{user}}=await supabase.auth.getUser();get(await supabase.from('tbs_close_tasks').update({status:done?'DONE':'PENDING',completed_by:done?user?.id:null,completed_at:done?new Date().toISOString():null}).eq('id',t.id).eq('close_id',close.id));if(!done&&close.status==='READY_FOR_REVIEW')get(await supabase.from('tbs_monthly_closes').update({status:'IN_PROGRESS'}).eq('id',close.id).eq('client_id',clientId))})}
 async function markReady(){if(!close||defaults.some(([key])=>!tasks.some(t=>t.task_key===key&&t.status==='DONE'))){setError('Complete all nine required checklist tasks first.');return}await save(async()=>get(await supabase.from('tbs_monthly_closes').update({status:'READY_FOR_REVIEW'}).eq('id',close.id).eq('client_id',clientId)))}
 async function addReview(){if(!title.trim())return;await save(async()=>{const {data:{user}}=await supabase.auth.getUser();get(await supabase.from('tbs_review_queue').insert({client_id:clientId,title:title.trim(),priority,source_type:'MANUAL',status:'OPEN',created_by:user?.id}));setTitle('')})}
 async function toggleReview(r){await save(async()=>{const {data:{user}}=await supabase.auth.getUser(),done=r.status!=='RESOLVED';get(await supabase.from('tbs_review_queue').update({status:done?'RESOLVED':'OPEN',reviewed_by:done?user?.id:null,reviewed_at:done?new Date().toISOString():null}).eq('id',r.id))})}
 if(!clientId)return <div style={panel}>Select a client first.</div>;
 return <section style={{maxWidth:1040}}><h2>{view==='close'?'Monthly Close':'TBS Review Queue'}</h2>
 {error&&<div role="alert" style={{...panel,color:'#b91c1c'}}>{error}</div>}{notice&&<p style={{color:'#166534'}}>{notice}</p>}
 {view==='close'?<><TBSClientHealthScore clientId={clientId} month={month} refreshKey={refreshKey}/><div style={panel}><label>Period: <input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><p>Status: <strong>{close?.status||'NOT STARTED'}</strong></p><button style={btn} disabled={busy||close?.status==='CLOSED'} onClick={initialize}>{close?'Add missing checklist tasks':'Create monthly close'}</button></div>
 {close&&<div style={panel}><h3>Checklist ({tasks.filter(t=>t.status==='DONE').length}/{tasks.length})</h3>{tasks.map(t=><label key={t.id} style={{display:'flex',gap:10,padding:'9px 0',borderBottom:'1px solid #eee'}}><input type="checkbox" checked={t.status==='DONE'} disabled={busy||close.status==='CLOSED'} onChange={e=>toggleTask(t,e.target.checked)}/><span style={{flex:1}}>{t.title}</span><small>{t.status}</small></label>)}<p><button style={btn} disabled={busy||close.status==='CLOSED'} onClick={markReady}>Ready for review</button></p><small>Final period locking and approval are not enabled in this pilot.</small></div>}</>:
 <><div style={panel}><h3>New review item</h3><input placeholder="What needs review?" value={title} onChange={e=>setTitle(e.target.value)} style={{padding:8,width:'55%'}}/><select value={priority} onChange={e=>setPriority(e.target.value)} style={{padding:8,margin:8}}>{['LOW','NORMAL','HIGH','URGENT'].map(p=><option key={p}>{p}</option>)}</select><button style={btn} disabled={busy||!title.trim()} onClick={addReview}>Add</button></div><div style={panel}><h3>Review items ({reviews.length})</h3>{!reviews.length&&<p>No review items for this client.</p>}{reviews.map(r=><div key={r.id} style={{display:'flex',gap:12,alignItems:'center',padding:'10px 0',borderBottom:'1px solid #eee'}}><div style={{flex:1}}><strong>{r.title}</strong><div style={{fontSize:12,color:'#64748b'}}>{r.priority} · {r.status} · {r.source_type}</div></div><button style={btn} disabled={busy} onClick={()=>toggleReview(r)}>{r.status==='RESOLVED'?'Reopen':'Resolve'}</button></div>)}</div></>}
 <button style={{...btn,background:'#64748b'}} disabled={busy} onClick={load}>Refresh</button></section>
}