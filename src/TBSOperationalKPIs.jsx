import React,{useState,useEffect,useMemo} from 'react';
import {BarChart,Bar,XAxis,YAxis,CartesianGrid,Tooltip,ResponsiveContainer} from 'recharts';
import {supabase} from './supabaseClient.js';
import {isoMonth,operationalMetricSummary,operationalMetricFormat} from './tbsOperationalMetrics.js';

const panel={background:'#fff',border:'1px solid #DDE5EC',borderRadius:9,padding:20,marginBottom:16};
const input={padding:'9px 10px',border:'1px solid #CED6E0',borderRadius:6,boxSizing:'border-box',width:'100%',fontSize:13};
const btn={padding:'10px 15px',background:'#17365D',border:'none',borderRadius:6,color:'white',cursor:'pointer'};
const displayMonth=date=>String(date||'').slice(0,7);
const defaultMonth=()=>new Date().toISOString().slice(0,7);

export function useOperationalData(clientId) {
 const [definitions,setDefinitions]=useState([]);
 const [values,setValues]=useState([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [version,setVersion]=useState(0);
 useEffect(()=>{
  let alive=true;
  setLoading(true);setError('');setDefinitions([]);setValues([]);
  if(!clientId){setLoading(false);return;}
  (async()=>{
   const [m,v]=await Promise.all([
    supabase.from('tbs_operational_metrics').select('*').eq('client_id',clientId).order('name'),
    supabase.from('tbs_operational_metric_values').select('*').eq('client_id',clientId).order('period_month',{ascending:false}),
   ]);
   if(!alive)return;
   if(m.error||v.error)setError(m.error?.message||v.error?.message||'No se pudieron cargar los indicadores.');
   else {setDefinitions(m.data||[]);setValues(v.data||[]);}
   setLoading(false);
  })();
  return()=>{alive=false;};
 },[clientId,version]);
 return {definitions,values,loading,error,reload:()=>setVersion(n=>n+1)};
}

export function TBSOperationalKPIs({clientId,businessName}) {
 const {definitions,values,loading,error,reload}=useOperationalData(clientId);
 const [metricName,setMetricName]=useState('');
 const [unit,setUnit]=useState('unidades');
 const [aggregation,setAggregation]=useState('sum');
 const [description,setDescription]=useState('');
 const [editingId,setEditingId]=useState('');
 const [metricId,setMetricId]=useState('');
 const [month,setMonth]=useState(defaultMonth);
 const [number,setNumber]=useState('');
 const [notes,setNotes]=useState('');
 const [saving,setSaving]=useState(false);
 const [notice,setNotice]=useState('');
 const [problem,setProblem]=useState('');
 const [showInactive,setShowInactive]=useState(false);
 const active=definitions.filter(m=>m.active);
 const selected=definitions.find(m=>m.id===metricId);
 const currentValue=values.find(v=>v.metric_id===metricId&&v.period_month===isoMonth(month));
 const focus=useMemo(()=>operationalMetricSummary(selected?[selected]:[],values,month.slice(0,4)+'-01-01',month.slice(0,4)+'-12-31'),[selected,values,month]);
 function clearDefinition(){setEditingId('');setMetricName('');setUnit('unidades');setAggregation('sum');setDescription('');}
 function editDefinition(m){setEditingId(m.id);setMetricName(m.name);setUnit(m.unit);setAggregation(m.aggregation);setDescription(m.description||'');setNotice('');setProblem('');}
 function chooseMetric(id){
  setMetricId(id);setNotice('');setProblem('');
  const found=values.find(v=>v.metric_id===id&&v.period_month===isoMonth(month));
  setNumber(found?String(found.value):'');setNotes(found?.notes||'');
 }
 function chooseMonth(ym){
  setMonth(ym);setNotice('');setProblem('');
  const found=values.find(v=>v.metric_id===metricId&&v.period_month===isoMonth(ym));
  setNumber(found?String(found.value):'');setNotes(found?.notes||'');
 }
 async function saveDefinition(e){
  e.preventDefault();setProblem('');setNotice('');
  if(!metricName.trim()||!unit.trim())return setProblem('Indique un nombre y una unidad.');
  setSaving(true);
  const payload={name:metricName.trim(),unit:unit.trim(),aggregation,description:description.trim()};
  const query=editingId?supabase.from('tbs_operational_metrics').update(payload).eq('id',editingId).eq('client_id',clientId):
   supabase.from('tbs_operational_metrics').insert({...payload,client_id:clientId});
  const {error:err}=await query;
  setSaving(false);
  if(err)return setProblem('No se pudo guardar: '+err.message);
  setNotice(editingId?'Indicador actualizado.':'Indicador creado.');
  clearDefinition();reload();
 }
 async function toggleActive(m){
  if(!window.confirm((m.active?'Desactivar':'Activar')+' '+m.name+'? Las mediciones históricas se conservarán.'))return;
  setSaving(true);setProblem('');
  const {error:err}=await supabase.from('tbs_operational_metrics').update({active:!m.active}).eq('id',m.id).eq('client_id',clientId);
  setSaving(false);
  if(err)return setProblem(err.message);
  if(m.active&&metricId===m.id){setMetricId('');setNumber('');}
  reload();
 }
 async function saveValue(e){
  e.preventDefault();setProblem('');setNotice('');
  const parsed=Number(number);
  const date=isoMonth(month);
  if(!metricId||!date||!number.trim()||!Number.isFinite(parsed))return setProblem('Seleccione indicador, mes y un valor numérico válido.');
  setSaving(true);
  const payload={client_id:clientId,metric_id:metricId,period_month:date,value:parsed,notes:notes.trim()};
  const {error:err}=await supabase.from('tbs_operational_metric_values').upsert(payload,{onConflict:'metric_id,period_month'});
  setSaving(false);
  if(err)return setProblem('No se pudo registrar el dato: '+err.message);
  setNotice('Medición mensual guardada.');reload();
 }
 async function removeValue(row){
  if(!window.confirm('¿Eliminar la medición de '+displayMonth(row.period_month)+'? Esta acción no afecta los asientos contables.'))return;
  setSaving(true);
  const {error:err}=await supabase.from('tbs_operational_metric_values').delete().eq('id',row.id).eq('client_id',clientId);
  setSaving(false);
  if(err)return setProblem(err.message);
  if(row.metric_id===metricId&&row.period_month===isoMonth(month)){setNumber('');setNotes('');}
  setNotice('Medición eliminada.');reload();
 }
 return <div style={{maxWidth:1180}}>
  <h2 style={{color:'#17365D'}}>Indicadores operacionales y productividad</h2>
  <p style={{fontSize:13,color:'#53667B'}}>Cliente: <b>{businessName}</b>. Registre pacientes, recetas, ocupación u otra medida cada mes. Los indicadores se almacenan por cliente y no afectan la contabilidad.</p>
  {loading&&<p>Cargando indicadores...</p>}
  {error&&<p role="alert" style={{color:'#B00020'}}>{error}</p>}
  {problem&&<p role="alert" style={{color:'#B00020'}}>{problem}</p>}
  {notice&&<p role="status" style={{color:'#177155'}}>{notice}</p>}
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(310px,1fr))',gap:16,alignItems:'start'}}>
   <section style={panel}>
    <h3 style={{marginTop:0,color:'#17365D'}}>{editingId?'Editar indicador':'Crear un indicador'}</h3>
    <form onSubmit={saveDefinition}>
     <label>Nombre del indicador (ej. Recetas dispensadas, Pacientes atendidos, Ocupación)</label>
     <input required maxLength={100} value={metricName} onChange={e=>setMetricName(e.target.value)} style={input} placeholder="Pacientes atendidos"/>
     <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:12}}>
      <div><label>Unidad</label><input required maxLength={40} value={unit} onChange={e=>setUnit(e.target.value)} style={input} placeholder="pacientes"/></div>
      <div><label>Resumen entre meses</label><select value={aggregation} onChange={e=>setAggregation(e.target.value)} style={input}>
       <option value="sum">Sumar (recetas, visitas, pacientes)</option>
       <option value="average">Promedio (ocupación, porcentajes)</option>
       <option value="last">Último mes (saldo/censo)</option>
      </select></div>
     </div>
     <label style={{display:'block',marginTop:12}}>Descripción opcional</label>
     <textarea maxLength={600} value={description} onChange={e=>setDescription(e.target.value)} rows={2} style={input}/>
     <div style={{display:'flex',gap:10,marginTop:12}}>
      <button disabled={saving} style={btn}>{editingId?'Actualizar indicador':'Crear indicador'}</button>
      {editingId&&<button type="button" onClick={clearDefinition}>Cancelar</button>}
     </div>
    </form>
    <h4>Indicadores del cliente</h4>
    <label><input type="checkbox" checked={showInactive} onChange={e=>setShowInactive(e.target.checked)}/> Mostrar desactivados</label>
    <div style={{marginTop:12}}>
     {definitions.filter(m=>showInactive||m.active).map(m=><div key={m.id} style={{display:'flex',gap:6,alignItems:'center',justifyContent:'space-between',padding:'8px 0',borderTop:'1px solid #EDF0F3'}}>
      <div><b>{m.name}</b><div style={{fontSize:12,color:'#5C6A79'}}>{m.unit} · {m.aggregation==='sum'?'Suma':m.aggregation==='average'?'Promedio':'Último valor'}{m.active?'':' · Desactivado'}</div></div>
      <div><button type="button" onClick={()=>editDefinition(m)} style={{marginRight:6}}>Editar</button><button type="button" onClick={()=>toggleActive(m)}>{m.active?'Desactivar':'Activar'}</button></div>
     </div>)}
     {!definitions.length&&!loading&&<p>No hay indicadores configurados. Comience creando uno.</p>}
    </div>
   </section>
   <section style={panel}>
    <h3 style={{marginTop:0,color:'#17365D'}}>Registrar resultado mensual</h3>
    <form onSubmit={saveValue}>
     <label>Indicador</label>
     <select required value={metricId} onChange={e=>chooseMetric(e.target.value)} style={input}>
      <option value="">Seleccione</option>
      {active.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
     </select>
     <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:12}}>
      <div><label>Mes</label><input required type="month" value={month} onChange={e=>chooseMonth(e.target.value)} style={input}/></div>
      <div><label>Resultado ({selected?.unit||'unidad'})</label><input required type="number" step="any" value={number} onChange={e=>setNumber(e.target.value)} style={input}/></div>
     </div>
     <label style={{display:'block',marginTop:12}}>Observaciones (opcionales)</label>
     <textarea maxLength={800} rows={2} value={notes} onChange={e=>setNotes(e.target.value)} style={input}/>
     <button disabled={saving||!active.length} style={{...btn,marginTop:12}}>{currentValue?'Actualizar mes':'Guardar mes'}</button>
    </form>
    {focus[0]&&<div style={{marginTop:18}}>
     <h4>Tendencia {month.slice(0,4)} — {focus[0].name}</h4>
     <div style={{width:'100%',height:210}}>
      <ResponsiveContainer><BarChart data={focus[0].series.map(x=>({...x,label:x.month.slice(5,7)}))} margin={{top:15,right:15,left:8,bottom:10}}>
       <CartesianGrid strokeDasharray="3 3" vertical={false}/>
       <XAxis dataKey="label" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}}/>
       <Tooltip formatter={v=>operationalMetricFormat(v,selected?.unit)}/>
       <Bar dataKey="value" fill="#3C78AC" maxBarSize={38} name={selected?.name}/>
      </BarChart></ResponsiveContainer>
     </div>
    </div>}
    <h4>Historial {selected?.name||''}</h4>
    <div style={{maxHeight:340,overflowY:'auto'}}>
     <table style={{width:'100%',fontSize:12,borderCollapse:'collapse'}}>
      <thead><tr><th>Mes</th><th>Resultado</th><th>Nota</th><th></th></tr></thead>
      <tbody>{values.filter(v=>v.metric_id===metricId).map(v=><tr key={v.id} style={{borderTop:'1px solid #EDF0F3'}}>
       <td>{displayMonth(v.period_month)}</td><td>{operationalMetricFormat(v.value,selected?.unit)}</td><td>{v.notes||'—'}</td>
       <td><button type="button" onClick={()=>{chooseMonth(displayMonth(v.period_month));setMetricId(v.metric_id);}}>Editar</button> <button type="button" onClick={()=>removeValue(v)}>Eliminar</button></td>
      </tr>)}</tbody>
     </table>
     {metricId&&!values.some(v=>v.metric_id===metricId)&&<p>No hay resultados registrados.</p>}
    </div>
   </section>
  </div>
 </div>;
}

export function TBSOperationalKPIReport({clientId,from,to,sales}) {
 const {definitions,values,loading,error}=useOperationalData(clientId);
 const rows=useMemo(()=>operationalMetricSummary(definitions,values,from,to,sales),[definitions,values,from,to,sales]);
 if(loading)return null;
 if(error)return <p style={{fontSize:12,color:'#B00020'}}>Indicadores operacionales: {error}</p>;
 if(!rows.length)return null;
 return <section style={{...panel,marginTop:17}}>
  <h3 style={{color:'#17365D',marginTop:0}}>Productividad e indicadores operacionales</h3>
  <p style={{color:'#596A7D',fontSize:12}}>Información mensual registrada para este cliente. La comparación de ventas por unidad solo se presenta cuando todos los meses del período están completos.</p>
  <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
   <thead><tr style={{borderBottom:'1px solid #DDE5EC',textAlign:'left'}}><th>Indicador</th><th>Resultado</th><th>Meses con datos</th><th>Ventas por unidad</th><th>Cambio primer/último mes</th></tr></thead>
   <tbody>{rows.map(row=><tr key={row.metricId} style={{borderBottom:'1px solid #EDF1F4'}}>
    <td style={{padding:'9px 4px'}}>{row.name}</td>
    <td>{operationalMetricFormat(row.result,row.unit)}</td>
    <td>{row.periodCount} de {row.expectedMonths}</td>
    <td>{row.revenuePerUnit===null?'N/D':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(row.revenuePerUnit)}</td>
    <td>{row.trendPct===null?'N/D':row.trendPct.toFixed(1)+'%'}</td>
   </tr>)}</tbody>
  </table></div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))',gap:14,marginTop:15}}>
   {rows.slice(0,4).map(row=><div key={row.metricId} style={{border:'1px solid #E2E8EF',borderRadius:7,padding:10}}>
    <b style={{fontSize:12,color:'#17365D'}}>{row.name} ({row.unit})</b>
    <div style={{height:160,width:'100%'}}><ResponsiveContainer><BarChart data={row.series.map(x=>({...x,month:x.month.slice(0,7)}))}>
     <CartesianGrid strokeDasharray="3 3" vertical={false}/>
     <XAxis dataKey="month" tick={{fontSize:9}}/><YAxis tick={{fontSize:9}}/>
     <Tooltip formatter={v=>operationalMetricFormat(v,row.unit)}/>
     <Bar dataKey="value" fill="#3C78AC" maxBarSize={30}/>
    </BarChart></ResponsiveContainer></div>
   </div>)}
  </div>
  {rows.some(r=>!r.coverageComplete)&&<p style={{fontSize:12,color:'#8B5E16'}}>Cuando falten meses o el período sea parcial, la relación ventas por unidad se muestra como N/D para evitar conclusiones engañosas.</p>}
 </section>;
}
