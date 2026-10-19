import React,{useEffect,useState} from 'react';
import {supabase} from './supabaseClient';

const panel={background:'#fff',border:'1px solid #dde3eb',borderRadius:9,padding:18,marginBottom:15};
const btn={background:'#17365D',color:'#fff',border:0,borderRadius:6,padding:'9px 13px',cursor:'pointer'};
const input={padding:9,border:'1px solid #cbd5e1',borderRadius:6,maxWidth:'100%',boxSizing:'border-box'};
const unwrap=r=>{if(r.error)throw r.error;return r.data};
const closed=s=>['COMPLETED','CANCELLED'].includes(s);
export default function TBSClientRequests({clientId,isStaff=false}){
 const [requests,setRequests]=useState([]),[selected,setSelected]=useState(null),[messages,setMessages]=useState([]);
 const [title,setTitle]=useState(''),[details,setDetails]=useState(''),[dueDate,setDueDate]=useState(''),[reply,setReply]=useState('');
 const [statusFilter,setStatusFilter]=useState('ALL'),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function load(){
  if(!clientId)return;
  setLoading(true);
  const q=await supabase.from('tbs_client_requests').select('*').eq('client_id',clientId).order('created_at',{ascending:false}).limit(200);
  if(q.error)setError(q.error.message);else{setRequests(q.data||[]);setSelected(prev=>prev?(q.data||[]).find(x=>x.id===prev.id)||null:null)}
  setLoading(false);
 }
 useEffect(()=>{setSelected(null);setMessages([]);setError('');load()},[clientId]);
 useEffect(()=>{if(!selected){setMessages([]);return}let active=true;supabase.from('tbs_request_messages').select('*').eq('request_id',selected.id).order('created_at',{ascending:true}).then(({data,error})=>{if(active){if(error)setError(error.message);else setMessages(data||[])}});return()=>{active=false}},[selected?.id]);
 async function run(fn){
  setBusy(true);setError('');setNotice('');
  try{await fn();await load();setNotice('Saved successfully.')}catch(e){setError(e.message||String(e))}finally{setBusy(false)}
 }
 async function createRequest(){
  if(!title.trim())return;
  await run(async()=>{
   const {data:{user},error}=await supabase.auth.getUser();if(error)throw error;
   unwrap(await supabase.from('tbs_client_requests').insert({client_id:clientId,title:title.trim(),details:details.trim()||null,due_date:dueDate||null,status:'OPEN',created_by:user?.id}));
   setTitle('');setDetails('');setDueDate('');
  })
 }
 async function changeStatus(next){
  if(!selected||!isStaff)return;
  await run(async()=>{
   const {data:{user}}=await supabase.auth.getUser();
   unwrap(await supabase.from('tbs_client_requests').update({status:next,completed_by:next==='COMPLETED'?user?.id:null,completed_at:next==='COMPLETED'?new Date().toISOString():null}).eq('id',selected.id).eq('client_id',clientId));
   setSelected(x=>x?{...x,status:next}:x);
  })
 }
 async function sendMessage(){
  if(!selected||!reply.trim()||closed(selected.status))return;
  await run(async()=>{
   const {data:{user},error}=await supabase.auth.getUser();if(error)throw error;
   unwrap(await supabase.from('tbs_request_messages').insert({request_id:selected.id,author_id:user.id,body:reply.trim()}));
   setReply('');
   const m=unwrap(await supabase.from('tbs_request_messages').select('*').eq('request_id',selected.id).order('created_at',{ascending:true}));
   setMessages(m||[]);
  })
 }
 const visible=requests.filter(r=>statusFilter==='ALL'||(statusFilter==='OPEN'?!closed(r.status):r.status===statusFilter));
 return <section style={{maxWidth:1050}}>
  <h2>{isStaff?'TBS Client Requests':'Document & Information Requests'}</h2>
  <p style={{color:'#64748b',fontSize:13}}>Requests and messages are saved in Supabase. File uploads are not enabled yet; private Storage policies must be verified first.</p>
  {error&&<div role="alert" style={{...panel,color:'#b91c1c'}}>{error}</div>}
  {notice&&<p style={{color:'#166534'}}>{notice}</p>}
  {isStaff&&<div style={panel}><h3>New client request</h3>
   <div style={{display:'grid',gap:9,maxWidth:640}}>
    <input style={input} maxLength={180} placeholder="Requested document or information" value={title} onChange={e=>setTitle(e.target.value)}/>
    <textarea style={input} rows={3} placeholder="Instructions for the client" value={details} onChange={e=>setDetails(e.target.value)}/>
    <label style={{fontSize:13}}>Due date <input type="date" style={{...input,marginLeft:10}} value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label>
    <div><button style={btn} disabled={busy||!title.trim()} onClick={createRequest}>Send request</button></div>
   </div>
  </div>}
  <div style={panel}><div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
   <h3 style={{margin:'0 0 8px'}}>Requests ({visible.length})</h3>
   <select style={{...input,marginLeft:'auto'}} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
    <option value="ALL">All</option><option value="OPEN">Active</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option>
   </select>
   <button style={{...btn,background:'#64748b'}} onClick={load}>Refresh</button>
  </div>
  {loading?<p>Loading...</p>:!visible.length?<p>No requests found.</p>:visible.map(r=><button key={r.id} onClick={()=>setSelected(r)} style={{display:'block',width:'100%',textAlign:'left',padding:'12px 8px',border:'none',borderBottom:'1px solid #e2e8f0',background:selected?.id===r.id?'#eff6ff':'#fff',cursor:'pointer'}}>
   <strong>{r.title}</strong><div style={{fontSize:12,color:'#64748b'}}>{r.status} · Due: {r.due_date||'Not set'}</div>
  </button>)}
  </div>
  {selected&&<div style={panel}>
   <h3>{selected.title}</h3><p style={{whiteSpace:'pre-wrap'}}>{selected.details||'No additional instructions.'}</p>
   <p style={{fontSize:13,color:'#64748b'}}>Status: <strong>{selected.status}</strong> · Due: {selected.due_date||'Not set'}</p>
   {isStaff&&<div style={{display:'flex',gap:8,marginBottom:15}}>
    {!closed(selected.status)&&<button disabled={busy} style={btn} onClick={()=>changeStatus('COMPLETED')}>Mark completed</button>}
    {!closed(selected.status)&&<button disabled={busy} style={{...btn,background:'#9a3412'}} onClick={()=>changeStatus('CANCELLED')}>Cancel</button>}
    {closed(selected.status)&&<button disabled={busy} style={btn} onClick={()=>changeStatus('OPEN')}>Reopen</button>}
   </div>}
   <h4>Conversation</h4>
   {!messages.length&&<p style={{fontSize:13,color:'#64748b'}}>No messages yet.</p>}
   {messages.map(m=><div key={m.id} style={{padding:'10px 0',borderBottom:'1px solid #eee'}}><small style={{color:'#64748b'}}>{m.author_id} · {new Date(m.created_at).toLocaleString()}</small><div style={{whiteSpace:'pre-wrap'}}>{m.body}</div></div>)}
   {!closed(selected.status)?<div style={{marginTop:14}}><textarea rows={3} style={{...input,width:'100%'}} placeholder="Write a message" value={reply} onChange={e=>setReply(e.target.value)}/><p><button style={btn} disabled={busy||!reply.trim()} onClick={sendMessage}>Send message</button></p></div>:<p style={{fontSize:13,color:'#64748b'}}>This request is closed. Reopen it to continue the conversation.</p>}
  </div>}
 </section>;
}