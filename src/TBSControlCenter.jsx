import React, {useEffect,useMemo,useState} from 'react';
import {supabase} from './supabaseClient';
import {isCloseReadyForReview,completedCloseTaskCount,REQUIRED_CLOSE_TASK_KEYS} from './tbsCloseRules.js';
import {canRequestCloseReview,canApproveClose,reviewsForMonth,reviewCounts} from './tbsCloseReviewWorkflow.js';

const defaults=[
  ['statements','Bank statements received'],
  ['reconciliation','Bank reconciliations verified'],
  ['cards','Credit cards reconciled'],
  ['uncategorized','Uncategorized transactions reviewed'],
  ['payroll','Payroll and services verified'],
  ['journal','Journal entries validated'],
  ['balance','Balance Sheet validated'],
  ['income','Profit & Loss validated'],
  ['report','Client report delivered'],
];
const panel={background:'#fff',padding:18,border:'1px solid #dde3eb',borderRadius:8,marginBottom:16};
const btn={background:'#17365D',color:'#fff',border:0,borderRadius:6,padding:'9px 14px',cursor:'pointer'};
const field={padding:8,border:'1px solid #CBD5E1',borderRadius:5,minWidth:0};
const get=result=>{if(result.error)throw result.error;return result.data};
const currentMonth=()=>new Date().toLocaleDateString('en-CA',{year:'numeric',month:'2-digit'}).slice(0,7);
const endOfMonth=m=>new Date(Date.UTC(Number(m.slice(0,4)),Number(m.slice(5,7)),0)).toISOString().slice(0,10);
const dateOnly=v=>v||null;
function Status({value}){return <span style={{fontSize:11,fontWeight:700,color:['OPEN','HIGH','URGENT','BLOCKED'].includes(value)?'#9B3A25':'#17365D'}}>{value}</span>;}
function People({people,value,onChange,disabled=false,empty='Unassigned'}) {
 return <select style={{...field,width:'100%'}} value={value||''} disabled={disabled} onChange={e=>onChange(e.target.value||null)}>
  <option value="">{empty}</option>{people.map(p=><option key={p.id} value={p.id}>{p.email}</option>)}
 </select>;
}
export default function TBSControlCenter({clientId,view='close'}){
 const [month,setMonth]=useState(currentMonth);
 const [close,setClose]=useState(null),[tasks,setTasks]=useState([]),[reviews,setReviews]=useState([]);
 const [people,setPeople]=useState([]),[actorId,setActorId]=useState(null);
 const [title,setTitle]=useState(''),[description,setDescription]=useState(''),[priority,setPriority]=useState('NORMAL');
 const [assignedTo,setAssignedTo]=useState(''),[dueDate,setDueDate]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [historyFor,setHistoryFor]=useState(null),[history,setHistory]=useState([]);
 const [reviewNote,setReviewNote]=useState({});
 const start=month+'-01',end=endOfMonth(month);
 const periodReviews=useMemo(()=>reviewsForMonth(reviews,month),[reviews,month]);
 const counts=reviewCounts(periodReviews);
 const locked=close?.status==='CLOSED';

 async function load({scan=true}={}){
   if(!clientId)return;
   setError('');
   try{
     const {data:{user}}=await supabase.auth.getUser();
     setActorId(user?.id||null);
     const [c,peopleResult]=await Promise.all([
       supabase.from('tbs_monthly_closes').select('*').eq('client_id',clientId).eq('period_start',start).maybeSingle(),
       supabase.rpc('tbs_staff_directory'),
     ]);
     const found=get(c);setClose(found);
     if(peopleResult.error)throw peopleResult.error;
     setPeople(peopleResult.data||[]);
     // The SQL scan is idempotent, staff-only, and never changes accounting entries.
     if(scan && found?.status!=='CLOSED') {
       const result=await supabase.rpc('tbs_scan_close_exceptions',{p_client:clientId,p_period:start});
       if(result.error)throw result.error;
     }
     const [r,t]=await Promise.all([
       supabase.from('tbs_review_queue').select('*').eq('client_id',clientId).order('created_at',{ascending:false}).limit(500),
       found?supabase.from('tbs_close_tasks').select('*').eq('close_id',found.id).order('created_at'):Promise.resolve({data:[],error:null}),
     ]);
     setReviews(get(r)||[]);setTasks(get(t)||[]);
     // The scan can demote READY_FOR_REVIEW; refresh the close state after it.
     if(found?.status==='READY_FOR_REVIEW' && scan){
       const refreshed=get(await supabase.from('tbs_monthly_closes').select('*').eq('id',found.id).single());
       setClose(refreshed);
     }
   }catch(e){setError(e.message||String(e));}
 }
 useEffect(()=>{setHistoryFor(null);setHistory([]);load();},[clientId,month]);

 async function perform(action,success='Saved successfully.'){
   if(busy)return;
   setBusy(true);setError('');setNotice('');
   try{await action();await load({scan:false});setNotice(success);}
   catch(e){setError(e.message||String(e));}
   finally{setBusy(false);}
 }
 async function initialize(){
   await perform(async()=>{
     let row=get(await supabase.from('tbs_monthly_closes').select('id').eq('client_id',clientId).eq('period_start',start).maybeSingle());
     if(!row)row=get(await supabase.from('tbs_monthly_closes').insert({client_id:clientId,period_start:start,period_end:end,status:'IN_PROGRESS'}).select('id').single());
     const existing=get(await supabase.from('tbs_close_tasks').select('task_key').eq('close_id',row.id));
     const keys=new Set((existing||[]).map(x=>x.task_key));
     const missing=defaults.filter(([key])=>!keys.has(key)).map(([task_key,task_title])=>({close_id:row.id,task_key,title:task_title,status:'PENDING'}));
     if(missing.length)get(await supabase.from('tbs_close_tasks').insert(missing));
   },'Monthly close checklist initialized.');
 }
 async function updateClose(patch){
   if(!close||locked)return;
   await perform(async()=>get(await supabase.from('tbs_monthly_closes').update(patch).eq('id',close.id).eq('client_id',clientId)));
 }
 async function updateTask(t,patch){
   if(!close||locked)return;
   await perform(async()=>{
     const {data:{user}}=await supabase.auth.getUser();
     const next={...patch};
     if(Object.hasOwn(patch,'status')){
       next.completed_by=patch.status==='DONE'?user?.id:null;
       next.completed_at=patch.status==='DONE'?new Date().toISOString():null;
     }
     get(await supabase.from('tbs_close_tasks').update(next).eq('close_id',close.id).eq('id',t.id));
   });
 }
 async function markReady(){
   if(!close||!canRequestCloseReview(tasks,periodReviews)){
     setError('Finish all nine tasks and resolve HIGH/URGENT items for this period first.');return;
   }
   await updateClose({status:'READY_FOR_REVIEW'});
 }
 async function approveClose(){
   if(!canApproveClose(close,tasks,periodReviews,actorId)){
     setError('Approval requires nine completed tasks, no critical issues and a supervisor different from the assigned preparer.');return;
   }
   if(!window.confirm('Approve the monthly close? The checklist will be locked and this action is audited. Accounting transactions are NOT locked.'))return;
   await updateClose({status:'CLOSED'});
 }
 async function addReview(){
   if(!title.trim())return;
   await perform(async()=>{
     get(await supabase.from('tbs_review_queue').insert({
       client_id:clientId,period_start:start,title:title.trim(),description:description.trim()||null,
       due_date:dateOnly(dueDate),assigned_to:assignedTo||null,priority,source_type:'MANUAL',
       status:'OPEN',created_by:actorId,
     }));
     setTitle('');setDescription('');setDueDate('');setAssignedTo('');
   },'Review issue recorded.');
 }
 async function updateReview(r,patch){
   await perform(async()=>{
     const next={...patch};
     if(Object.hasOwn(next,'status')){
       next.reviewed_by=next.status==='RESOLVED'?actorId:null;
       next.reviewed_at=next.status==='RESOLVED'?new Date().toISOString():null;
       if(next.status==='RESOLVED'){
         const explanation=(reviewNote[r.id]||r.resolution_note||'').trim();
         if(!explanation)throw new Error('Add a resolution note before resolving this issue.');
         next.resolution_note=explanation;
       }else next.resolution_note=null;
     }
     get(await supabase.from('tbs_review_queue').update(next).eq('id',r.id).eq('client_id',clientId));
   });
 }
 async function loadHistory(r){
   try{
     const events=get(await supabase.from('tbs_review_events').select('*').eq('review_id',r.id).eq('client_id',clientId).order('created_at',{ascending:false}).limit(100));
     setHistory(events||[]);setHistoryFor(r.id);
   }catch(e){setError(e.message||String(e));}
 }
 const getPerson=id=>people.find(p=>p.id===id)?.email||'—';
 if(!clientId)return <div style={panel}>Select a client first.</div>;
 return <section style={{maxWidth:1120}}>
  <h2>{view==='close'?'Monthly Close':'TBS Review Queue'}</h2>
  <div style={{...panel,display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
    <label style={{fontSize:13}}>Accounting period <input type="month" style={field} value={month} onChange={e=>setMonth(e.target.value)}/></label>
    <span style={{fontSize:13}}>Status: <strong>{close?.status||'NOT STARTED'}</strong></span>
    <span style={{fontSize:13}}>Pending issues: <strong>{counts.open}</strong> | Critical: <strong style={{color:counts.critical?'#B91C1C':'#166534'}}>{counts.critical}</strong> | Overdue: <strong>{counts.overdue}</strong></span>
    <button style={{...btn,marginLeft:'auto',background:'#64748b'}} disabled={busy} onClick={()=>load()}>Refresh and scan</button>
  </div>
  {error&&<div role="alert" style={{...panel,color:'#B91C1C'}}>{error}</div>}
  {notice&&<p style={{color:'#166534'}}>{notice}</p>}
  {view==='close'?<>
    <p style={{fontSize:13,color:'#475569'}}>Checklist of nine activities, with responsibility and deadlines. Completing a task is a manual attestation, not an automatic balance validation.</p>
    {!close&&<button style={btn} disabled={busy} onClick={initialize}>Create monthly close</button>}
    {close&&<div style={panel}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
        <h3 style={{margin:0}}>Monthly Close: {completedCloseTaskCount(tasks)}/{REQUIRED_CLOSE_TASK_KEYS.length}</h3>
        <button style={{...btn,background:'#64748b'}} disabled={busy||locked} onClick={initialize}>Add missing tasks</button>
      </div>
      <label style={{display:'block',fontSize:13,marginTop:15,marginBottom:12}}>Preparer / Responsible
        <div style={{maxWidth:360,marginTop:5}}><People people={people} value={close.assigned_to} disabled={busy||locked} onChange={id=>updateClose({assigned_to:id})}/></div>
      </label>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead><tr style={{background:'#F1F5F9'}}><th style={{padding:8,textAlign:'left'}}>Done</th><th style={{padding:8,textAlign:'left'}}>Close task</th><th style={{padding:8,textAlign:'left'}}>Responsible</th><th style={{padding:8,textAlign:'left'}}>Due date</th><th style={{padding:8,textAlign:'left'}}>Status</th></tr></thead>
          <tbody>{tasks.map(t=><tr key={t.id} style={{borderBottom:'1px solid #E2E8F0'}}>
            <td style={{padding:8}}><input aria-label={'Mark '+t.title+' complete'} type="checkbox" checked={t.status==='DONE'} disabled={busy||locked} onChange={e=>updateTask(t,{status:e.target.checked?'DONE':'PENDING'})}/></td>
            <td style={{padding:8,minWidth:185}}>{t.title}</td>
            <td style={{padding:8,minWidth:165}}><People people={people} disabled={busy||locked} value={t.assigned_to} onChange={id=>updateTask(t,{assigned_to:id})}/></td>
            <td style={{padding:8}}><input type="date" style={field} defaultValue={t.due_date||''} key={t.id+'date'+(t.due_date||'')} disabled={busy||locked} onBlur={e=>{if((t.due_date||'')!==e.target.value)updateTask(t,{due_date:dateOnly(e.target.value)})}}/></td>
            <td style={{padding:8}}><Status value={t.status}/>{t.completed_at&&<div style={{color:'#64748b',fontSize:10}}>{new Date(t.completed_at).toLocaleDateString()}</div>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',marginTop:18}}>
        <button style={{...btn,background:canRequestCloseReview(tasks,periodReviews)?'#17365D':'#94A3B8'}} disabled={busy||locked||!canRequestCloseReview(tasks,periodReviews)} onClick={markReady}>Ready for review</button>
        <button style={{...btn,background:canApproveClose(close,tasks,periodReviews,actorId)?'#0F6E56':'#94A3B8'}} disabled={busy||!canApproveClose(close,tasks,periodReviews,actorId)} onClick={approveClose}>Supervisor: Approve close</button>
      </div>
      {counts.critical>0&&<p style={{color:'#B91C1C',fontSize:12}}>Resolve {counts.critical} HIGH/URGENT issue(s) before submitting or approving this month.</p>}
      {locked?<p style={{color:'#166534',fontSize:12}}>Approved by {getPerson(close.reviewed_by)} on {close.closed_at?new Date(close.closed_at).toLocaleString():'—'}. Checklist locked.</p>
       :<p style={{color:'#64748b',fontSize:12}}>The supervisor must be a different staff member from the assigned preparer. Closing this checklist does not lock transactions or certify audited financial statements.</p>}
    </div>}
  </>:<>
    <div style={panel}>
      <h3 style={{marginTop:0}}>New review issue — {month}</h3>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10}}>
        <label style={{gridColumn:'1 / -1'}}>Issue title<input style={{...field,display:'block',width:'100%'}} value={title} onChange={e=>setTitle(e.target.value)} placeholder="What needs review?"/></label>
        <label style={{gridColumn:'1 / -1'}}>Context / required action<textarea style={{...field,display:'block',width:'100%',minHeight:60}} value={description} onChange={e=>setDescription(e.target.value)}/></label>
        <label>Priority<select style={{...field,width:'100%'}} value={priority} onChange={e=>setPriority(e.target.value)}>{['LOW','NORMAL','HIGH','URGENT'].map(p=><option key={p}>{p}</option>)}</select></label>
        <label>Responsible<People people={people} value={assignedTo} onChange={setAssignedTo}/></label>
        <label>Due date<input type="date" style={{...field,width:'100%'}} value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label>
      </div>
      <button style={{...btn,marginTop:13}} disabled={busy||!title.trim()} onClick={addReview}>Add review item</button>
    </div>
    <div style={panel}>
      <h3>Issues for {month} ({periodReviews.length})</h3>
      {!periodReviews.length&&<p>No review issues for this period.</p>}
      {periodReviews.map(r=><div key={r.id} style={{borderTop:'1px solid #E2E8F0',padding:'14px 0'}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}>
          <div style={{flex:1,minWidth:220}}><strong>{r.title}</strong><div style={{fontSize:11,color:'#64748b',marginTop:4}}>{r.source_type} · <Status value={r.status}/> · {r.created_at?new Date(r.created_at).toLocaleDateString():''}</div>{r.description&&<p style={{fontSize:12,marginBottom:4}}>{r.description}</p>}</div>
          <div style={{fontSize:12,color:'#475569'}}>{r.reviewed_at?'Resolved '+new Date(r.reviewed_at).toLocaleDateString():''}</div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:9,marginTop:9}}>
          <label style={{fontSize:12}}>Priority<select style={{...field,width:'100%'}} value={r.priority} disabled={busy||locked} onChange={e=>updateReview(r,{priority:e.target.value})}>{['LOW','NORMAL','HIGH','URGENT'].map(p=><option key={p}>{p}</option>)}</select></label>
          <label style={{fontSize:12}}>Responsible<People people={people} value={r.assigned_to} disabled={busy||locked} onChange={id=>updateReview(r,{assigned_to:id})}/></label>
          <label style={{fontSize:12}}>Due date<input type="date" key={r.id+'due'+(r.due_date||'')} defaultValue={r.due_date||''} style={{...field,width:'100%'}} disabled={busy||locked} onBlur={e=>{if((r.due_date||'')!==e.target.value)updateReview(r,{due_date:dateOnly(e.target.value)})}}/></label>
        </div>
        <label style={{display:'block',fontSize:12,marginTop:8}}>Resolution / follow-up note<input style={{...field,width:'100%',display:'block'}} disabled={busy||locked} placeholder="Describe the correction before Resolve" value={reviewNote[r.id]===undefined?(r.resolution_note||''):reviewNote[r.id]} onChange={e=>setReviewNote(prev=>({...prev,[r.id]:e.target.value}))}/></label>
        <div style={{display:'flex',alignItems:'center',gap:8,marginTop:9,flexWrap:'wrap'}}>
          <button style={btn} disabled={busy||locked} onClick={()=>updateReview(r,{status:r.status==='RESOLVED'?'OPEN':'RESOLVED'})}>{r.status==='RESOLVED'?'Reopen':'Resolve'}</button>
          <button style={{...btn,background:'#64748b'}} disabled={busy||locked} onClick={()=>updateReview(r,{resolution_note:(reviewNote[r.id]===undefined?r.resolution_note||'':reviewNote[r.id]).trim()})}>Save note</button>
          <button style={{...btn,background:'#64748b'}} disabled={busy} onClick={()=>loadHistory(r)}>History</button>
          {r.due_date&&<span style={{fontSize:11,color:r.due_date<new Date().toISOString().slice(0,10)&&r.status!=='RESOLVED'?'#B91C1C':'#64748b'}}>Due: {r.due_date}</span>}
        </div>
        {historyFor===r.id&&<div style={{background:'#F8FAFC',padding:12,marginTop:10,fontSize:12,borderRadius:6}}>
          <strong>Change history</strong>
          {!history.length&&<p>No history yet.</p>}
          {history.map(ev=><div key={ev.id} style={{borderBottom:'1px solid #E2E8F0',padding:'5px 0'}}>{new Date(ev.created_at).toLocaleString()} · {ev.event_type} · {getPerson(ev.actor_id)} {ev.detail?'— '+ev.detail:''}</div>)}
        </div>}
      </div>)}
    </div>
    {reviews.some(r=>!r.period_start)&&<p style={{fontSize:12,color:'#64748b'}}>Legacy review issues without an accounting month: {reviews.filter(r=>!r.period_start).length}. These remain in the database and require period assignment before they can affect a monthly close.</p>}
  </>}
 </section>;
}
