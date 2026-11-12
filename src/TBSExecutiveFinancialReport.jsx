import React,{useEffect,useMemo,useState} from 'react';
import {supabase} from './supabaseClient';
import {KPI_OPTIONS,DEFAULT_KPIS,INDUSTRY_OPTIONS,executiveMetrics,executiveNarrative,comparisonChange} from './tbsExecutiveReportRules.js';
import {printExecutiveFinancialReport} from './tbsExecutiveReportPrint.js';

const blankNotes=()=>({sector:'general',selectedKpis:[...DEFAULT_KPIS],marketContext:'',marketSource:'',marketSourceDate:'',ownerDiscussion:'',agreements:'',followupDate:''});
const field={width:'100%',boxSizing:'border-box',padding:9,border:'1px solid #CBD5E1',borderRadius:6,fontSize:13};
const panel={background:'#fff',border:'1px solid #DFE5ED',borderRadius:9,padding:17,marginTop:14};
const button={background:'#17365D',color:'#fff',padding:'9px 13px',border:0,borderRadius:6,cursor:'pointer',fontWeight:600};
const fmt=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
const money=x=>fmt.format(Number(x)||0);
const value=(key,x)=>x===null||x===undefined?'N/D':key.includes('margin')?Number(x).toFixed(1)+'%':money(x);
const getSector=x=>INDUSTRY_OPTIONS.find(o=>o[0]===x)?.[1]||INDUSTRY_OPTIONS[0][1];
function List({entries,empty='Sin hallazgos adicionales respaldados por el período.'}){
 return entries?.length?<ul style={{paddingLeft:20,fontSize:13,lineHeight:1.6,margin:'8px 0'}}>
  {entries.map((entry,index)=><li key={index} style={{marginBottom:5}}>{entry}</li>)}
 </ul>:<p style={{fontSize:12,color:'#64748B'}}>{empty}</p>;
}
function BarChart({title,items}){
 const max=Math.max(1,...items.map(o=>Math.max(0,Number(o.value)||0)));
 return <div style={{border:'1px solid #E0E8F0',borderRadius:7,padding:13}}>
  <strong style={{color:'#17365D',fontSize:13}}>{title}</strong>
  {items.map((entry,i)=><div key={entry.label} style={{marginTop:11}}>
   <div style={{fontSize:11,display:'flex',justifyContent:'space-between',gap:7}}>
    <span>{entry.label}</span><strong>{entry.value==null?'N/D':money(entry.value)}</strong>
   </div>
   <div style={{height:9,background:'#E8EEF4',borderRadius:4,overflow:'hidden',marginTop:4}}>
    <div style={{background:i===2?'#819FBD':i===1?'#4D7CA5':'#17365D',height:'100%',
      width:(Math.max(0,Number(entry.value)||0)/max*100)+'%'}}/>
   </div>
  </div>)}
  <div style={{color:'#64748B',fontSize:10,marginTop:10}}>Las barras muestran magnitudes positivas; los números negativos mantienen su signo.</div>
 </div>;
}
export default function TBSExecutiveFinancialReport({clientId,businessName,from,to,financials,prior,onClose}){
 const [notes,setNotes]=useState(blankNotes);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[dirty,setDirty]=useState(false);
 const metrics=useMemo(()=>executiveMetrics(financials),[financials]);
 const narrative=useMemo(()=>executiveNarrative(financials,prior,notes.sector),[financials,prior,notes.sector]);
 const selected=KPI_OPTIONS.filter(k=>notes.selectedKpis.includes(k.key));
 const warnings=[];
 if(Math.abs(financials.balanceDifference||0)>=.01)warnings.push('Balance Sheet con diferencia de '+money(financials.balanceDifference));
 if(financials.reconciliationAlerts>0)warnings.push(financials.reconciliationAlerts+' conciliación(es) con discrepancia de validación');
 if(financials.arMismatch)warnings.push('El mayor de A/R no coincide con el submayor de facturas');
 if(financials.uncategorizedCount>0)warnings.push(financials.uncategorizedCount+' transacciones sin categorizar');
 function change(key,newValue){
  setNotes(old=>({...old,[key]:newValue}));setDirty(true);setNotice('');
 }
 useEffect(()=>{
  let active=true;
  setLoading(true);setError('');setNotice('');setDirty(false);setNotes(blankNotes());
  (async()=>{
   try{
    const r=await supabase.from('tbs_executive_report_notes').select('*')
      .eq('client_id',clientId).eq('period_from',from).eq('period_to',to).maybeSingle();
    if(r.error)throw r.error;
    if(active&&r.data){
     const row=r.data;
     setNotes({
      sector:row.sector||'general',
      selectedKpis:(Array.isArray(row.selected_kpis)?row.selected_kpis:[...DEFAULT_KPIS])
        .filter(key=>KPI_OPTIONS.some(option=>option.key===key)),
      marketContext:row.market_context||'',marketSource:row.market_source||'',
      marketSourceDate:row.market_source_date||'',ownerDiscussion:row.owner_discussion||'',
      agreements:row.agreements||'',followupDate:row.followup_date||'',
     });
    }
   }catch(e){if(active)setError('No se pudieron recuperar las notas: '+(e.message||String(e)));}
   finally{if(active)setLoading(false);}
  })();
  return()=>{active=false;};
 },[clientId,from,to]);

 async function saveNotes(){
  if(loading||saving)return;
  if(!notes.selectedKpis.length){setError('Selecciona al menos un indicador.');return;}
  setError('');setNotice('');setSaving(true);
  try{
   const auth=await supabase.auth.getUser();
   if(auth.error||!auth.data?.user)throw new Error('Debes iniciar sesión como personal autorizado.');
   const row={
    client_id:clientId,period_from:from,period_to:to,sector:notes.sector,
    selected_kpis:notes.selectedKpis,
    market_context:notes.marketContext.trim().slice(0,8000),
    market_source:notes.marketSource.trim().slice(0,1000),
    market_source_date:notes.marketSourceDate||null,
    owner_discussion:notes.ownerDiscussion.trim().slice(0,8000),
    agreements:notes.agreements.trim().slice(0,8000),
    followup_date:notes.followupDate||null,
    updated_by:auth.data.user.id,updated_at:new Date().toISOString(),
   };
   const result=await supabase.from('tbs_executive_report_notes')
     .upsert(row,{onConflict:'client_id,period_from,period_to'});
   if(result.error)throw result.error;
   setDirty(false);setNotice('Reporte y notas guardados para este cliente y período.');
  }catch(e){setError('No se pudo guardar: '+(e.message||String(e)));}
  finally{setSaving(false);}
 }
 function printReport(){
  if(!notes.selectedKpis.length){setError('Selecciona al menos un indicador.');return;}
  try{
   printExecutiveFinancialReport({
    businessName,from,to,industryLabel:getSector(notes.sector),
    metrics:selected,metricValues:metrics,prior,narrative,financials,notes,
   });
  }catch(e){setError(e.message||String(e));}
 }
 const section=(title,content)=> <div style={panel}><h3 style={{margin:'0 0 8px',color:'#17365D',fontSize:15}}>{title}</h3>{content}</div>;
 const trend=prior?.hasActivity?comparisonChange(metrics.revenue,prior.revenue):null;
 return <section style={{maxWidth:1140,margin:'0 auto',fontFamily:'Calibri,Arial,sans-serif',color:'#26394D'}}>
  <div style={{...panel,marginTop:0,borderTop:'4px solid #17365D'}}>
   <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
    <div>
     <div style={{fontSize:11,color:'#517298',fontWeight:700,letterSpacing:1}}>TBS | CONSULTORÍA FINANCIERA</div>
     <h2 style={{fontSize:22,color:'#17365D',margin:'5px 0'}}>Reporte Financiero Ejecutivo</h2>
     <div style={{fontSize:13}}><strong>{businessName}</strong> · {from} al {to}</div>
     <div style={{fontSize:12,color:'#64748B',marginTop:5}}>
      {prior?.hasActivity?'Comparación: '+prior.from+' al '+prior.to+' (misma duración)':'Sin actividad suficiente para comparar con el período anterior'}
     </div>
    </div>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'start'}}>
     <button style={{...button,color:'#17365D',background:'#EBF0F5'}} onClick={onClose}>Volver a Reports</button>
     <button style={{...button,background:'#507290'}} disabled={loading||saving} onClick={saveNotes}>{saving?'Guardando…':'Guardar análisis'}</button>
     <button style={button} onClick={printReport}>Imprimir / Guardar PDF</button>
    </div>
   </div>
   {loading&&<p style={{fontSize:12,color:'#64748B'}}>Cargando notas de este período…</p>}
   {dirty&&<p style={{fontSize:12,color:'#946200'}}>Cambios sin guardar: el PDF mostrará el borrador actual, pero debes guardar para conservarlo en TBS.</p>}
   {error&&<p role="alert" style={{fontSize:12,color:'#B91C1C'}}>{error}</p>}
   {notice&&<p role="status" style={{fontSize:12,color:'#0F6E56'}}>{notice}</p>}
  </div>
  {warnings.length>0&&<div style={{...panel,background:'#FFFAF0',borderColor:'#E8C58A'}}>
   <h3 style={{color:'#965500',marginTop:0}}>Validaciones contables pendientes</h3>
   <List entries={warnings}/>
   <p style={{fontSize:12}}>Las conclusiones deben considerarse provisionales hasta verificar estas partidas. No se registran ajustes automáticos.</p>
  </div>}
  {section('Indicadores financieros seleccionados',<>
   <p style={{fontSize:12,color:'#64748B'}}>Selecciona los indicadores que resulten relevantes para la conversación con el dueño. Los valores utilizan el mismo período y los mismos cálculos del P&L y Balance Sheet.</p>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(195px,1fr))',gap:8}}>
    {KPI_OPTIONS.map(k=><label key={k.key} style={{display:'flex',gap:7,alignItems:'center',padding:8,
     border:'1px solid #E0E7EF',borderRadius:6,background:notes.selectedKpis.includes(k.key)?'#F2F7FC':'white',
     fontSize:12,cursor:'pointer'}}>
     <input type="checkbox" disabled={loading} checked={notes.selectedKpis.includes(k.key)}
      onChange={e=>change('selectedKpis',e.target.checked?
        [...notes.selectedKpis,k.key]:notes.selectedKpis.filter(id=>id!==k.key))}/>
     {k.label}</label>)}
   </div>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(178px,1fr))',gap:10,marginTop:14}}>
    {selected.map(k=><div key={k.key} title={k.meaning} style={{background:'#F9FBFD',border:'1px solid #E3E9EF',borderRadius:7,padding:12}}>
     <div style={{fontSize:11,color:'#64748B'}}>{k.label}</div>
     <div style={{fontSize:19,color:'#17365D',fontWeight:700,margin:'4px 0'}}>{value(k.key,metrics[k.key])}</div>
     <div style={{fontSize:11,color:'#64748B',lineHeight:1.45}}>{k.meaning}</div>
    </div>)}
   </div>
   {trend!==null&&<p style={{fontSize:12,color:'#64748B'}}>Variación de ventas frente al período anterior de igual duración: <strong>{trend>0?'+':''}{trend.toFixed(1)}%</strong>. No es una comparación contra el mercado.</p>}
  </>)}
  {section('Gráficas para la reunión',<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(290px,1fr))',gap:12}}>
   <BarChart title="Ingresos, gastos y ganancia neta" items={[{label:'Ventas',value:metrics.revenue},{label:'Gastos',value:metrics.expenses},{label:'Ganancia neta',value:metrics.net_income}]}/>
   <BarChart title="Balances contables al cierre" items={[{label:'Efectivo',value:metrics.cash},{label:'A/R',value:metrics.receivables},{label:'Pasivos',value:metrics.liabilities}]}/>
  </div>)}
  {section('Hallazgos — interpretación sencilla',<List entries={narrative.findings}/>)}
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(290px,1fr))',gap:13,marginTop:14}}>
   <div style={{...panel,marginTop:0}}><h3 style={{color:'#17365D',marginTop:0}}>Oportunidades</h3><List entries={narrative.opportunities}/></div>
   <div style={{...panel,marginTop:0}}><h3 style={{color:'#17365D',marginTop:0}}>Amenazas y riesgos</h3><List entries={narrative.risks}/></div>
  </div>
  {section('Análisis de mercado e industria',<>
   <p style={{fontSize:12,color:'#64748B'}}>No se importan automáticamente datos de mercado en tiempo real. Las hipótesis sectoriales deben contrastarse con clientes, competidores y fuentes verificables antes de adoptarse como hechos.</p>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12}}>
    <label style={{fontSize:12}}>Industria<select value={notes.sector} disabled={loading} style={{...field,display:'block',marginTop:5}} onChange={e=>change('sector',e.target.value)}>
     {INDUSTRY_OPTIONS.map(([id,label])=><option value={id} key={id}>{label}</option>)}
    </select></label>
    <label style={{fontSize:12}}>Fuente externa consultada<input value={notes.marketSource} disabled={loading}
      onChange={e=>change('marketSource',e.target.value)} placeholder="Informe, enlace o entidad" style={{...field,display:'block',marginTop:5}}/></label>
    <label style={{fontSize:12}}>Fecha de la fuente<input type="date" value={notes.marketSourceDate} disabled={loading}
      onChange={e=>change('marketSourceDate',e.target.value)} style={{...field,display:'block',marginTop:5}}/></label>
   </div>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))',gap:10,margin:'13px 0'}}>
    <div style={{background:'#F1F6FB',padding:11,borderRadius:6,fontSize:12}}><strong>Oportunidad por validar</strong><p style={{margin:'6px 0 0'}}>{narrative.sectorOpportunities}</p></div>
    <div style={{background:'#FFF7EC',padding:11,borderRadius:6,fontSize:12}}><strong>Amenaza por monitorear</strong><p style={{margin:'6px 0 0'}}>{narrative.sectorThreats}</p></div>
   </div>
   <label style={{fontSize:12}}>Observaciones concretas del mercado<textarea disabled={loading} rows={4} style={{...field,display:'block',marginTop:5}}
     placeholder="Demanda observada, competencia, precios, clientes, suplidores y cómo se verificó"
     value={notes.marketContext} onChange={e=>change('marketContext',e.target.value)}/></label>
   {!notes.marketSource.trim()&&<p style={{fontSize:11,color:'#9B6300'}}>No se registró una fuente externa. El reporte distinguirá las hipótesis sectoriales de los hallazgos contables.</p>}
  </>)}
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(290px,1fr))',gap:13,marginTop:14}}>
   <div style={{...panel,marginTop:0}}><h3 style={{color:'#17365D',marginTop:0}}>Estrategias a corto plazo (0–90 días)</h3><List entries={narrative.shortTerm}/></div>
   <div style={{...panel,marginTop:0}}><h3 style={{color:'#17365D',marginTop:0}}>Estrategias a mediano plazo (3–12 meses)</h3><List entries={narrative.mediumTerm}/></div>
  </div>
  {section('Discusión con el dueño y acuerdos de seguimiento',<>
   <h4 style={{margin:'5px 0',color:'#17365D'}}>Preguntas para la reunión</h4><List entries={narrative.questions}/>
   <label style={{display:'block',marginTop:13,fontSize:12}}>Comentarios y hallazgos discutidos
    <textarea rows={3} style={{...field,display:'block',marginTop:5}} disabled={loading}
     value={notes.ownerDiscussion} onChange={e=>change('ownerDiscussion',e.target.value)}
     placeholder="¿Qué explicó la gerencia? ¿Qué información adicional debe verificarse?"/>
   </label>
   <label style={{display:'block',marginTop:12,fontSize:12}}>Decisiones, responsables y fechas
    <textarea rows={3} style={{...field,display:'block',marginTop:5}} disabled={loading}
     value={notes.agreements} onChange={e=>change('agreements',e.target.value)}
     placeholder="Acción — responsable — fecha — indicador de seguimiento"/>
   </label>
   <label style={{display:'block',marginTop:12,maxWidth:240,fontSize:12}}>Próxima revisión
    <input type="date" value={notes.followupDate} disabled={loading} onChange={e=>change('followupDate',e.target.value)}
     style={{...field,display:'block',marginTop:5}}/>
   </label>
   <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:14}}>
    <button style={button} disabled={loading||saving} onClick={saveNotes}>Guardar reunión y acuerdos</button>
    <button style={{...button,background:'#507290'}} onClick={printReport}>Imprimir / Guardar PDF</button>
   </div>
  </>)}
  <p style={{fontSize:11,lineHeight:1.5,color:'#64748B'}}>
   Fuente financiera: TBS Accounting Engine. Las cifras están sujetas a clasificaciones, conciliaciones y ajustes posteriores.
   El efectivo se identifica según el nombre de las cuentas. Las referencias de mercado son aportadas por la gerencia;
   no hay consultas automáticas a fuentes externas. Reporte gerencial, no auditoría.
  </p>
 </section>;
}
