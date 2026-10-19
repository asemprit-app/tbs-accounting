import React,{useEffect,useState} from 'react';
import {supabase} from './supabaseClient';

// Pilot score: operational checklist signals, NOT bank transaction counts.
// Read-only. Never persist or label as verified financial health.
const box={background:'#fff',border:'1px solid #dde3eb',borderRadius:9,padding:18,marginBottom:16};
const completed=x=>x?.status==='DONE';
export default function TBSClientHealthScore({clientId,month,refreshKey=0}){
 const [state,setState]=useState({loading:true,error:'',data:null});
 useEffect(()=>{
  let active=true;
  async function load(){
   if(!clientId){setState({loading:false,error:'',data:null});return}
   setState({loading:true,error:'',data:null});
   const period=month+'-01';
   try{
    const [cl,rv,rq]=await Promise.all([
     supabase.from('tbs_monthly_closes').select('id,status').eq('client_id',clientId).eq('period_start',period).maybeSingle(),
     supabase.from('tbs_review_queue').select('id,status').eq('client_id',clientId).limit(1000),
     supabase.from('tbs_client_requests').select('id,status,due_date,created_at').eq('client_id',clientId).limit(1000)
    ]);
    for(const r of [cl,rv,rq])if(r.error)throw r.error;
    const close=cl.data;
    const tasks=close?await supabase.from('tbs_close_tasks').select('task_key,status').eq('close_id',close.id):{data:[],error:null};
    if(tasks.error)throw tasks.error;
    const list=tasks.data||[], byKey=Object.fromEntries(list.map(t=>[t.task_key,t]));
    const required=['statements','reconciliation','cards','uncategorized','payroll','journal','balance','income','report'];
    const sufficient=!!close&&required.every(k=>byKey[k]);
    const openReviews=(rv.data||[]).filter(x=>x.status!=='RESOLVED').length;
    const openRequests=(rq.data||[]).filter(x=>!['COMPLETED','CANCELLED'].includes(x.status)).length;
    const general=['statements','cards','payroll','journal','balance','income','report'];
    const done=general.filter(k=>completed(byKey[k])).length;
    const breakdown=[
     {label:'Monthly close checklist',points:sufficient?Math.round(done/7*30):null,max:30,detail:sufficient?`${done}/7 general tasks completed (reconciliation and categorization scored separately)`:'Checklist incomplete'},
     {label:'Reconciliation checklist',points:sufficient?(completed(byKey.reconciliation)?20:0):null,max:20,detail:'Checklist confirmation, not bank verification'},
     {label:'Uncategorized review checklist',points:sufficient?(completed(byKey.uncategorized)?15:0):null,max:15,detail:'Checklist confirmation, not transaction count'},
     {label:'Client requests',points:openRequests===0?15:Math.max(0,15-openRequests*5),max:15,detail:`${openRequests} open requests (all periods)`},
     {label:'Review queue',points:openReviews===0?20:Math.max(0,20-openReviews*5),max:20,detail:`${openReviews} unresolved items (all periods)`}
    ];
    const score=sufficient?breakdown.reduce((sum,x)=>sum+x.points,0):null;
    // Actual ledger diagnostics are informational only; they do not affect the pilot score.
    const lastDay=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
    const [allTx,uncatTx,recs]=await Promise.all([
      supabase.from('transactions').select('id',{count:'exact',head:true}).eq('client_id',clientId).gte('date',period).lte('date',lastDay),
      supabase.from('transactions').select('id',{count:'exact',head:true}).eq('client_id',clientId).gte('date',period).lte('date',lastDay).or('gl.is.null,gl.eq.'),
      supabase.from('reconciliations').select('id,status,period_end,gl').eq('client_id',clientId).gte('period_end',period).lte('period_end',lastDay).limit(1000)
    ]);
    const diagnosticsError=[allTx,uncatTx,recs].find(r=>r.error)?.error?.message||'';
    const ledger=diagnosticsError?{error:diagnosticsError}:{
      transactionCount:allTx.count,uncategorizedCount:uncatTx.count,
      reconciliations:(recs.data||[]).length,
      passed:(recs.data||[]).filter(r=>r.status==='PASS').length,
      passAccounts:[...new Set((recs.data||[]).filter(r=>r.status==='PASS').map(r=>r.gl).filter(Boolean))].length,
      pending:(recs.data||[]).filter(r=>r.status!=='PASS').length,
      limited:(recs.data||[]).length===1000,
      accounts:[...new Set((recs.data||[]).map(r=>r.gl).filter(Boolean))].length
    };
    if(active)setState({loading:false,error:'',data:{score,breakdown,sufficient,period,ledger}});
   }catch(e){if(active)setState({loading:false,error:e.message||String(e),data:null})}
  }
  load();return()=>{active=false};
 },[clientId,month,refreshKey]);
 if(state.loading)return <div style={box}>Loading operational score…</div>;
 if(state.error)return <div style={{...box,color:'#b91c1c'}}>Health Score unavailable: {state.error}</div>;
 if(!state.data)return null;
 const {score,breakdown,ledger}=state.data;
 const level=score===null?'Information pending':score>=80?'Satisfactory':score>=60?'Needs follow-up':'Action required';
 const ledgerAlerts=!ledger.error?[
  ...(ledger.transactionCount===0?['No transactions recorded for the selected month. This is missing activity, not evidence that the books are complete.']:[]),
  ...(ledger.uncategorizedCount>0?[`${ledger.uncategorizedCount} transaction(s) require categorization.`]:[]),
  ...(ledger.pending>0?[`${ledger.pending} reconciliation(s) have not reached PASS status.`]:[]),
  ...(ledger.reconciliations===0?['No reconciliation records found with an end date in this month; reconciliation coverage cannot be confirmed.']:[]),
  ...(ledger.limited?['Reconciliation query reached its 1,000-row limit; counts may be incomplete.']:[])
 ]:[];
 return <section style={box}>
  <h3 style={{marginTop:0}}>TBS Client Health Score — pilot</h3>
  <div style={{fontSize:32,fontWeight:700,color:score===null?'#64748b':score>=80?'#15803d':score>=60?'#a16207':'#b91c1c'}}>{score===null?'Insufficient Data':`${score}/100`}</div>
  <div style={{fontWeight:600,marginTop:4,marginBottom:8,color:score===null?'#64748b':score>=80?'#15803d':score>=60?'#a16207':'#b91c1c'}}>{level}</div>
  <p style={{fontSize:13,color:'#475569'}}>Operational follow-up indicator, not a financial rating. Read-only preview; no snapshot saved.</p>
  {breakdown.map(x=><div key={x.label} style={{display:'flex',justifyContent:'space-between',gap:14,borderTop:'1px solid #e2e8f0',padding:'10px 0'}}>
   <div><strong>{x.label}</strong><div style={{fontSize:12,color:'#64748b'}}>{x.detail}</div></div>
   <strong style={{whiteSpace:'nowrap'}}>{x.points===null?'N/A':`${x.points}/${x.max}`}</strong>
  </div>)}
  <div style={{borderTop:'1px solid #e2e8f0',marginTop:12,paddingTop:12}}>
   <strong>Actual accounting data — selected month (informational only)</strong>
   {ledger.error?<p style={{color:'#b91c1c'}}>Ledger diagnostics unavailable: {ledger.error}. No accounting values assumed.</p>:
    <p style={{fontSize:13,color:'#475569'}}>Transactions: <strong>{ledger.transactionCount}</strong> · Uncategorized: <strong>{ledger.uncategorizedCount}</strong> · Reconciliations recorded: <strong>{ledger.reconciliations}</strong> · PASS: <strong>{ledger.passed}</strong> · Not PASS: <strong>{ledger.pending}</strong> · Accounts with records: <strong>{ledger.accounts}</strong> · Accounts with PASS: <strong>{ledger.passAccounts}</strong>{ledger.limited?' · Results capped at 1,000':''}</p>}
   {!ledger.error&&ledgerAlerts.length>0&&<div style={{margin:'10px 0',padding:12,background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:6}}><strong style={{color:'#9a3412'}}>Accounting follow-up alerts</strong><ul style={{margin:'8px 0 0',paddingLeft:20}}>{ledgerAlerts.map(message=><li key={message} style={{marginBottom:5,fontSize:13}}>{message}</li>)}</ul></div>}
   <small style={{color:'#64748b'}}>Account counts only reflect accounts present in reconciliation records, not all active bank accounts. A PASS status is a recorded reconciliation result, not independent bank confirmation. These figures do not affect the pilot score.</small>
  </div>
  <small style={{color:'#64748b'}}>Requests and review items cover all periods; checklist applies to the selected month. The seven general checklist tasks, reconciliation and uncategorized review are mutually exclusive score components. All three remain checklist-based; no actual bank verification or transaction count is measured. Thresholds are pilot operational labels, not financial ratings.</small>
 </section>;
}
