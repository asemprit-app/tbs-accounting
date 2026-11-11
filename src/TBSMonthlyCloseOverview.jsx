import React,{useEffect,useMemo,useState} from 'react';
import {supabase} from './supabaseClient';
import {buildCloseOverviewRows,closeOverviewTotals} from './tbsCloseOverview.js';

const panel={background:'#fff',border:'1px solid #DFE5ED',borderRadius:10,padding:18};
const input={padding:'9px 11px',borderRadius:6,border:'1px solid #CBD5E1',background:'#fff',color:'#1E293B'};
const styles={
  NOT_STARTED:{color:'#64748B',background:'#F1F5F9'},
  IN_PROGRESS:{color:'#945000',background:'#FFF2D7'},
  READY_FOR_REVIEW:{color:'#175A96',background:'#E7F2FF'},
  CLOSED:{color:'#08744E',background:'#E7F6ED'},
};
function previousMonth(){
  const date=new Date();date.setDate(1);date.setMonth(date.getMonth()-1);
  return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');
}
function monthLabel(month){
  const [y,m]=month.split('-').map(Number);
  return new Intl.DateTimeFormat('es-PR',{month:'long',year:'numeric'}).format(new Date(y,m-1,1));
}
async function pageThrough(makeQuery){
  const pageSize=1000,all=[];
  for(let page=0;page<500;page++){
    const result=await makeQuery().range(page*pageSize,(page+1)*pageSize-1);
    if(result.error)throw result.error;
    const block=result.data||[];
    all.push(...block);
    if(block.length<pageSize)return all;
  }
  throw new Error('Demasiados registros para cargar el resumen. Revise el período seleccionado.');
}
const userMessage=error=>error?.message||String(error);
export default function TBSMonthlyCloseOverview({clients=[],onOpenClient}){
  const [month,setMonth]=useState(previousMonth);
  const [data,setData]=useState({closes:[],tasks:[],reviews:[],staff:[]});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [reload,setReload]=useState(0);
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState('ALL');
  const clientKey=clients.map(c=>c.id).join(',');

  useEffect(()=>{
    let active=true;
    async function load(){
      setLoading(true);setError('');
      try{
        // RLS permits only authorized TBS staff to read cross-client closes.
        const start=month+'-01';
        const [closes,reviews,staffResponse]=await Promise.all([
          pageThrough(()=>supabase.from('tbs_monthly_closes')
            .select('id,client_id,period_start,status,assigned_to,updated_at')
            .eq('period_start',start).order('client_id')),
          pageThrough(()=>supabase.from('tbs_review_queue')
            .select('client_id,priority,status')
            .eq('period_start',start)
            .in('priority',['HIGH','URGENT'])),
          supabase.rpc('tbs_staff_directory'),
        ]);
        if(staffResponse.error)throw staffResponse.error;
        const tasks=[];
        // Avoid huge query strings and 1,000-row API limits for many clients.
        for(let i=0;i<closes.length;i+=80){
          const ids=closes.slice(i,i+80).map(c=>c.id);
          tasks.push(...await pageThrough(()=>supabase.from('tbs_close_tasks')
            .select('close_id,task_key,status').in('close_id',ids).order('close_id')));
        }
        if(active)setData({closes,tasks,reviews,staff:staffResponse.data||[]});
      }catch(e){
        if(active)setError(userMessage(e));
      }finally{
        if(active)setLoading(false);
      }
    }
    load();
    return()=>{active=false;};
  },[month,clientKey,reload]);

  const rows=useMemo(()=>buildCloseOverviewRows(clients,data.closes,data.tasks,data.reviews),[clients,data]);
  const totals=closeOverviewTotals(rows);
  const staff=new Map(data.staff.map(p=>[p.id,p.email]));
  const visible=rows.filter(r=>{
    const matches=(r.clientName||'').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
    return matches&&(filter==='ALL'||(filter==='CRITICAL'?r.critical>0:r.status===filter));
  }).sort((a,b)=>{
    if(a.critical!==b.critical)return b.critical-a.critical;
    const rank={NOT_STARTED:0,IN_PROGRESS:1,READY_FOR_REVIEW:2,CLOSED:3};
    const stateDiff=(rank[a.status]??4)-(rank[b.status]??4);
    return stateDiff||a.clientName.localeCompare(b.clientName,'es');
  });
  const cards=[
    {key:'ALL',label:'Total clientes',value:totals.clients},
    {key:'NOT_STARTED',label:'No iniciados',value:totals.notStarted},
    {key:'IN_PROGRESS',label:'En proceso',value:totals.inProgress},
    {key:'READY_FOR_REVIEW',label:'Listos para revisión',value:totals.ready},
    {key:'CLOSED',label:'Aprobados',value:totals.approved},
    {key:'CRITICAL',label:'Con asuntos críticos',value:totals.withCritical},
  ];
  return <section style={{maxWidth:1250}}>
    <h2 style={{marginTop:0,color:'#17365D'}}>Monthly Close — CFO Overview</h2>
    <p style={{fontSize:13,color:'#64748B',lineHeight:1.5}}>
      Resumen administrativo de cierres por cliente. Cada mes tiene 10 verificaciones:
      DONE y N/A cuentan como completas. Un asunto HIGH o URGENT pendiente bloquea el envío a revisión.
    </p>
    <div style={{...panel,display:'flex',gap:12,alignItems:'end',justifyContent:'space-between',flexWrap:'wrap',marginBottom:15}}>
      <div>
        <label style={{fontSize:12,color:'#475569',display:'block',marginBottom:5}}>Mes del cierre</label>
        <input aria-label="Mes del cierre" style={input} type="month" value={month} onChange={e=>e.target.value&&setMonth(e.target.value)}/>
      </div>
      <div style={{fontWeight:700,color:'#17365D',textTransform:'capitalize',fontSize:15}}>{monthLabel(month)}</div>
      <button style={{...input,cursor:'pointer',fontWeight:600,color:'#17365D'}} disabled={loading} onClick={()=>setReload(v=>v+1)}>Actualizar resumen</button>
    </div>
    {error&&<div role="alert" style={{...panel,marginBottom:15,color:'#B91C1C'}}>No se pudo cargar el resumen: {error}</div>}
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(155px,1fr))',gap:10,marginBottom:15}}>
      {cards.map(card=><button type="button" key={card.key} onClick={()=>setFilter(card.key)}
        style={{...panel,display:'flex',flexDirection:'column',gap:5,textAlign:'left',cursor:'pointer',
          borderColor:filter===card.key?'#17365D':'#DFE5ED',
          boxShadow:filter===card.key?'0 0 0 1px #17365D':'none'}}>
        <span style={{fontSize:12,color:'#64748B'}}>{card.label}</span>
        <span style={{fontSize:24,fontWeight:750,color:card.key==='CRITICAL'&&card.value>0?'#AE3B22':'#17365D'}}>{loading?'…':card.value}</span>
      </button>)}
    </div>
    <div style={{...panel}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap',alignItems:'center',marginBottom:12}}>
        <div style={{fontSize:15,fontWeight:700,color:'#17365D'}}>Estado por cliente {loading?'':`(${visible.length})`}</div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <input style={{...input,minWidth:185}} aria-label="Buscar cliente" placeholder="Buscar cliente…" value={search} onChange={e=>setSearch(e.target.value)}/>
          <select aria-label="Filtrar estado" style={input} value={filter} onChange={e=>setFilter(e.target.value)}>
            <option value="ALL">Todos</option>
            <option value="NOT_STARTED">No iniciados</option>
            <option value="IN_PROGRESS">En proceso</option>
            <option value="READY_FOR_REVIEW">Listos para revisión</option>
            <option value="CLOSED">Aprobados</option>
            <option value="CRITICAL">Con asuntos críticos</option>
          </select>
        </div>
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead><tr style={{background:'#F1F5F9',textAlign:'left'}}>
            {['Cliente','Estado','Progreso','Hecho / N/A','Pendientes','Críticos','Responsable','Acción'].map(x=>
              <th key={x} scope="col" style={{padding:10,whiteSpace:'nowrap'}}>{x}</th>)}
          </tr></thead>
          <tbody>{!loading&&visible.map(row=><tr key={row.clientId} style={{borderBottom:'1px solid #E2E8F0'}}>
            <td style={{padding:10,minWidth:160,fontWeight:600}}>{row.clientName}</td>
            <td style={{padding:10}}>
              <span style={{...(styles[row.status]||styles.NOT_STARTED),
                borderRadius:20,padding:'5px 8px',display:'inline-block',whiteSpace:'nowrap',
                fontSize:11,fontWeight:700}}>{row.statusLabel}</span>
            </td>
            <td style={{padding:10,minWidth:115}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:4}}>
                <span>{row.completed}/10</span><span>{row.progress}%</span>
              </div>
              <div style={{background:'#E2E8F0',height:7,borderRadius:6,overflow:'hidden'}}>
                <div style={{width:`${row.progress}%`,background:row.status==='CLOSED'?'#0F6E56':'#2D6DA4',height:'100%'}}/>
              </div>
            </td>
            <td style={{padding:10,whiteSpace:'nowrap'}}>{row.done} / {row.notApplicable}</td>
            <td style={{padding:10,fontWeight:row.pending>0?700:400}}>{row.pending}</td>
            <td style={{padding:10,color:row.critical>0?'#B91C1C':'#64748B',fontWeight:row.critical>0?700:400}}>
              {row.critical>0?`${row.critical} requieren acción`:'0'}
            </td>
            <td style={{padding:10,minWidth:135,overflowWrap:'anywhere'}}>{staff.get(row.preparerId)||'Sin asignar'}</td>
            <td style={{padding:10}}>
              <button type="button" style={{background:'#17365D',color:'#fff',border:0,borderRadius:5,
                fontSize:12,padding:'7px 9px',cursor:'pointer',whiteSpace:'nowrap'}}
                onClick={()=>onOpenClient?.(row.clientId,month)}>Abrir cierre</button>
            </td>
          </tr>)}</tbody>
        </table>
        {loading&&<p style={{fontSize:13,color:'#64748B',padding:10}}>Consultando cierres de todos los clientes…</p>}
        {!loading&&!error&&visible.length===0&&<p style={{fontSize:13,color:'#64748B',padding:10}}>No hay clientes que coincidan con los filtros.</p>}
      </div>
      {!loading&&totals.needSubmit>0&&<div style={{marginTop:12,fontSize:12,color:'#805500'}}>
        {totals.needSubmit} cliente(s) completaron las diez tareas y todavía necesitan marcar Ready for review.
      </div>}
    </div>
    <p style={{fontSize:12,color:'#64748B'}}>
      Este panel refleja registros de Monthly Close y Review Queue; no certifica automáticamente
      las conciliaciones ni los estados financieros. Solo puede ser consultado por personal autorizado de TBS.
    </p>
  </section>;
}
