import React,{useEffect,useMemo,useState} from 'react';
import {supabase} from './supabaseClient';
import {KPI_OPTIONS,DEFAULT_KPIS,INDUSTRY_OPTIONS,executiveMetrics,executiveNarrative,comparisonChange} from './tbsExecutiveReportRules.js';
import {executivePdfBlob,executivePdfFilename,blobToPdfBase64} from './tbsExecutiveReportPdf.js';
import {downloadExecutiveWord} from './tbsExecutiveReportWord.js';
import {executiveEmailMessage,executiveEmailSubject,validRecipientEmail} from './tbsExecutiveEmail.js';
import {resolveExecutiveClientRecipient} from './tbsExecutiveClientRecipient.js';
import {MAX_MONTHS,addSelectedMonth,normalizeSelectedMonths,buildMonthlyComparison,buildMonthKpiRows,monthlyComparisonFindings} from './tbsExecutiveMonths.js';
import {monthRange,validComparisonRange,comparisonRows,comparisonFindings} from './tbsExecutiveComparison.js';
import {EXECUTIVE_SECTIONS,DEFAULT_CLIENT_SECTIONS,normalizeClientSections,simpleExecutiveSummary} from './tbsExecutiveSections.js';
import {monthlySalesSeries} from './tbsExecutiveMonthlySales.js';
import TBSMonthlySalesVisual from './TBSMonthlySalesVisual.jsx';
import {useOperationalData} from './TBSOperationalKPIs.jsx';
import {operationalMetricSummary,operationalMetricFormat} from './tbsOperationalMetrics.js';
import {fiveLargestExpenses} from './tbsExecutiveExpenseFocus.js';
import {BarChart as VerticalBarChart,Bar,XAxis,YAxis,CartesianGrid,ResponsiveContainer,Tooltip,ReferenceLine,Cell} from 'recharts';

const blankNotes=()=>({sector:'general',selectedKpis:[...DEFAULT_KPIS],marketContext:'',marketSource:'',marketSourceDate:'',ownerDiscussion:'',agreements:'',followupDate:'',comparisonMode:'previous',comparisonFrom:'',comparisonTo:'',selectedMonths:[],clientSections:[...DEFAULT_CLIENT_SECTIONS]});
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
 const input=items.map((item,index)=>({label:item.label,value:Number(item.value)||0,index}));
 const colors=['#3C78AC','#D1A354','#237B70','#7795B0'];
 return <div style={{border:'1px solid #DEE6EF',borderRadius:7,padding:12,minWidth:0}}>
  <strong style={{fontSize:13,color:'#17365D'}}>{title}</strong>
  <div style={{width:'100%',height:236,marginTop:10}}>
   <ResponsiveContainer width="100%" height="100%">
    <VerticalBarChart data={input} margin={{top:8,bottom:30,left:1,right:8}}>
     <CartesianGrid strokeDasharray="3 3" vertical={false}/>
     <XAxis dataKey="label" interval={0} tick={{fontSize:10}} height={43}/>
     <YAxis width={55} tick={{fontSize:10}} tickFormatter={v=>new Intl.NumberFormat('en-US',{notation:'compact'}).format(v)}/>
     <Tooltip formatter={v=>money(v)}/>
     <ReferenceLine y={0} stroke="#566A7B"/>
     <Bar dataKey="value" name="Importe" maxBarSize={51} isAnimationActive={false}>
      {input.map(r=><Cell key={r.label} fill={r.value<0?'#AE5045':colors[r.index%colors.length]}/>)}
     </Bar>
    </VerticalBarChart>
   </ResponsiveContainer>
  </div>
 </div>;
}
export default function TBSExecutiveFinancialReport({clientId,businessName,from,to,financials,prior,financialsForRange,isStaff=false,onClose,onOpenPeriod}){
 const [notes,setNotes]=useState(blankNotes);
 const {definitions:operationalDefinitions,values:operationalValues,loading:operationalLoading,error:operationalError} = useOperationalData(clientId);
 const [monthToAdd,setMonthToAdd]=useState('');
 const [emailOpen,setEmailOpen]=useState(false);
 const [emailTo,setEmailTo]=useState('');
 const [recipientStatus,setRecipientStatus]=useState('');
 const [resolvingEmail,setResolvingEmail]=useState(false);
 const [emailSubject,setEmailSubject]=useState('');
 const [emailMessage,setEmailMessage]=useState('');
 const [confirmRecipient,setConfirmRecipient]=useState(false);
 const [emailSending,setEmailSending]=useState(false);
 const [exportingWord,setExportingWord]=useState(false);
 const [exportingPdf,setExportingPdf]=useState(false);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[dirty,setDirty]=useState(false);
 const [historyOpen,setHistoryOpen]=useState(false);
 const [historyLoading,setHistoryLoading]=useState(true);
 const [historyError,setHistoryError]=useState('');
 const [savedHistory,setSavedHistory]=useState([]);
 const [archiveHistory,setArchiveHistory]=useState([]);
 const [staffEmails,setStaffEmails]=useState({});
 const [historyRefresh,setHistoryRefresh]=useState(0);
 const [downloadingArchive,setDownloadingArchive]=useState('');
 const historyStamp=timestamp=>timestamp?new Date(timestamp).toLocaleString('es-PR',{dateStyle:'medium',timeStyle:'short'}):'N/D';
 const historyActor=id=>staffEmails[id]||'Personal TBS';
 const metrics=useMemo(()=>executiveMetrics(financials),[financials]);
 const selected=KPI_OPTIONS.filter(k=>notes.selectedKpis.includes(k.key));
 const comparisonPeriod=['none','months'].includes(notes.comparisonMode)?null:
   notes.comparisonMode==='previous'?prior?.from&&prior?.to?{from:prior.from,to:prior.to}:null:
   validComparisonRange(notes.comparisonFrom,notes.comparisonTo)?
     {from:notes.comparisonFrom,to:notes.comparisonTo}:null;
 const compared=useMemo(()=>comparisonPeriod&&financialsForRange?
   financialsForRange(comparisonPeriod.from,comparisonPeriod.to):null,
   [comparisonPeriod?.from,comparisonPeriod?.to,financialsForRange]);
 const baseline=compared?executiveMetrics(compared):null;
 const comparison=baseline?comparisonRows(selected,metrics,baseline):[];
 const comparisonNotes=baseline?comparisonFindings(comparison,comparisonPeriod.from,comparisonPeriod.to):[];
 const comparisonHasActivity=Boolean(compared?.periodRecords);
 const effectivePrior=comparisonPeriod&&compared?{
   ...compared,from:comparisonPeriod.from,to:comparisonPeriod.to,
   hasActivity:comparisonHasActivity,
 }: {hasActivity:false};
 const narrative=executiveNarrative(financials,effectivePrior,notes.sector);
 const summary=useMemo(()=>simpleExecutiveSummary(financials,metrics),[financials,metrics]);
 const monthlyRows=notes.comparisonMode==='months'&&financialsForRange?
   buildMonthlyComparison(notes.selectedMonths,financialsForRange):[];
 const monthlyKpis=buildMonthKpiRows(selected,monthlyRows);
 const monthlyFindings=monthlyComparisonFindings(monthlyRows);
 let monthlySales={rows:[],totalSales:0,error:''};
 try{monthlySales=monthlySalesSeries(from,to,financialsForRange);}catch(e){monthlySales={rows:[],totalSales:0,totalExpenses:0,totalNet:0,error:e.message||String(e)};}
 const topExpenses=fiveLargestExpenses(financials.expenseRows,financials.expenses);
 const operationalRows=useMemo(()=>
  operationalMetricSummary(operationalDefinitions,operationalValues,from,to,financials?.revenue),
  [operationalDefinitions,operationalValues,from,to,financials?.revenue]);
 const exportError=operationalLoading&&notes.clientSections.includes('operational')?'Espera a que se carguen los indicadores operacionales.':
   operationalError&&notes.clientSections.includes('operational')?'Los indicadores operacionales no se pudieron cargar: '+operationalError:
   loading?'Espera a que cargue el reporte.':
   !notes.selectedKpis.length?'Selecciona al menos un indicador financiero.':
   notes.clientSections.includes('monthlySales')&&monthlySales.error?monthlySales.error:
   normalizeClientSections(notes.clientSections).length===0?'Selecciona al menos una sección para compartir con el cliente.':
   ['month','custom'].includes(notes.comparisonMode)&&!comparisonPeriod?'Selecciona un período comparativo válido.':
   notes.comparisonMode==='months'&&monthlyRows.length<2?'Selecciona al menos dos meses para la comparación mes a mes.':'';
 function makeReportPayload(){
   return {businessName,from,to,clientId,industryLabel:getSector(notes.sector),
     metrics:selected,metricValues:metrics,prior:effectivePrior,
     financials,narrative,notes,clientSections:normalizeClientSections(notes.clientSections),
     comparisonPeriod,comparison,comparisonHasActivity,
     monthlyRows,monthlyKpis,monthlyFindings,
     monthlySalesRows:monthlySales.rows,monthlySalesTotal:monthlySales.totalSales,
     monthlyExpenseTotal:monthlySales.totalExpenses,monthlyNetTotal:monthlySales.totalNet,
     topExpenses,operationalRows};
 }


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
  setLoading(true);setError('');setNotice('');setDirty(false);setNotes(blankNotes());setEmailOpen(false);
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
      comparisonMode:row.comparison_mode||'previous',comparisonFrom:row.comparison_from||'',comparisonTo:row.comparison_to||'',
      selectedMonths:normalizeSelectedMonths(row.selected_months||[]),
      clientSections:normalizeClientSections(row.client_sections),
     });
    }
   }catch(e){if(active)setError('No se pudieron recuperar las notas: '+(e.message||String(e)));}
   finally{if(active)setLoading(false);}
  })();
  return()=>{active=false;};
 },[clientId,from,to]);

 useEffect(()=>{
  let active=true;
  setHistoryLoading(true);setHistoryError('');
  (async()=>{
   try{
    const [analyses,archives,directory]=await Promise.all([
     supabase.from('tbs_executive_report_notes')
      .select('id,period_from,period_to,sector,created_at,updated_at,updated_by')
      .eq('client_id',clientId).order('updated_at',{ascending:false}).limit(100),
     supabase.from('tbs_executive_report_archives')
      .select('id,period_from,period_to,sent_at,sent_by,recipient_email,subject,filename,storage_path,sha256,provider_message_id')
      .eq('client_id',clientId).order('sent_at',{ascending:false}).limit(100),
     supabase.rpc('tbs_staff_directory'),
    ]);
    if(analyses.error)throw analyses.error;
    if(archives.error)throw archives.error;
    if(!active)return;
    setSavedHistory(analyses.data||[]);
    setArchiveHistory(archives.data||[]);
    if(!directory.error && Array.isArray(directory.data)){
     setStaffEmails(Object.fromEntries(directory.data.map(person=>[person.id,person.email])));
    }
   }catch(e){
    if(active)setHistoryError('No se pudo consultar el historial: '+(e.message||String(e)));
   }finally{if(active)setHistoryLoading(false);}
  })();
  return()=>{active=false;};
 },[clientId,historyRefresh]);

 async function saveNotes(){
  if(loading||saving)return;
  if(!notes.selectedKpis.length){setError('Selecciona al menos un indicador.');return;}
  if(['month','custom'].includes(notes.comparisonMode)&&!comparisonPeriod){setError('Selecciona un período comparativo válido.');return;}
  if(notes.comparisonMode==='months'&&monthlyRows.length<2){setError('Selecciona al menos dos meses para comparar.');return;}
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
    selected_months:normalizeSelectedMonths(notes.selectedMonths),
    client_sections:normalizeClientSections(notes.clientSections),
    comparison_mode:notes.comparisonMode,comparison_from:notes.comparisonFrom||null,
    comparison_to:notes.comparisonTo||null,
    updated_by:auth.data.user.id,updated_at:new Date().toISOString(),
   };
   const result=await supabase.from('tbs_executive_report_notes')
     .upsert(row,{onConflict:'client_id,period_from,period_to'});
   if(result.error)throw result.error;
   setDirty(false);setNotice('Reporte y notas guardados para este cliente y período.');
   setHistoryRefresh(value=>value+1);
  }catch(e){setError('No se pudo guardar: '+(e.message||String(e)));}
  finally{setSaving(false);}
 }
 function openSavedPeriod(periodFrom,periodTo){
   if(dirty&&!window.confirm('Hay cambios sin guardar en el análisis actual. ¿Deseas descartarlos para abrir otro período?'))return;
   if(!onOpenPeriod){setError('No se pudo cambiar el período del reporte.');return;}
   setHistoryOpen(false);setError('');setNotice('');
   onOpenPeriod(periodFrom,periodTo);
 }
 function saveBlob(blob,filename){
   const url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),5000);
 }
 async function downloadArchive(row){
  if(downloadingArchive)return;
  if(!row.storage_path?.startsWith(clientId+'/')){setError('La ruta del archivo no corresponde al cliente seleccionado.');return;}
  setDownloadingArchive(row.id);setError('');
  try{
   const result=await supabase.storage.from('tbs-executive-reports').download(row.storage_path);
   if(result.error||!result.data)throw result.error||new Error('No se obtuvo el archivo.');
   saveBlob(result.data,row.filename||'Reporte_Ejecutivo_Archivado.pdf');
  }catch(e){setError('No se pudo descargar la copia archivada: '+(e.message||String(e)));}
  finally{setDownloadingArchive('');}
 }
 async function downloadPdf(){
   if(exportError){setError(exportError);return;}
   setExportingPdf(true);setError('');
   try{
     const payload=makeReportPayload();
     const blob=executivePdfBlob(payload);
     saveBlob(blob,executivePdfFilename(payload));
     setNotice('PDF generado correctamente con los períodos y las notas actuales.');
   }catch(e){setError('No se pudo generar el PDF: '+(e.message||String(e)));}
   finally{setExportingPdf(false);}
 }
 async function downloadWord(){
   if(exportError){setError(exportError);return;}
   setExportingWord(true);setError('');
   try{
     await downloadExecutiveWord(makeReportPayload());
     setNotice('Word editable (.docx) generado correctamente.');
   }catch(e){setError('No se pudo generar Word: '+(e.message||String(e)));}
   finally{setExportingWord(false);}
 }
 async function prepareEmail(){
   if(!isStaff){setError('Solo el personal autorizado de TBS puede enviar reportes.');return;}
   if(exportError){setError(exportError);return;}
   if(resolvingEmail)return;
   setResolvingEmail(true);
   setEmailSubject(executiveEmailSubject(businessName,from,to));
   setEmailMessage(executiveEmailMessage(businessName,from,to,
     notes.comparisonMode==='months'?normalizeSelectedMonths(notes.selectedMonths):[],
     normalizeClientSections(notes.clientSections)));
   setEmailTo('');setRecipientStatus('');setConfirmRecipient(false);
   setError('');setNotice('');
   try{
     // The linked customer profile of the TBS workspace is the recipient source.
     // clients.sending_email and clients.reply_to_email are invoice sender settings.
     const tbs=await supabase.from('clients').select('id')
       .eq('name','Twelve Business Strategies').maybeSingle();
     if(tbs.error)throw tbs.error;
     if(!tbs.data?.id){
       setRecipientStatus('missing');
     }else{
       const linked=await supabase.from('customers').select('linked_client_id,email')
         .eq('client_id',tbs.data.id).eq('linked_client_id',clientId);
       if(linked.error)throw linked.error;
       const chosen=resolveExecutiveClientRecipient(linked.data||[],clientId);
       setEmailTo(chosen.email);
       setRecipientStatus(chosen.status);
     }
   }catch(err){
     setRecipientStatus('unavailable');
   }finally{
     setResolvingEmail(false);
     setEmailOpen(true);
   }
 }
 async function sendReportEmail(){
   if(!isStaff||emailSending||resolvingEmail)return;
   if(exportError){setError(exportError);return;}
   if(!validRecipientEmail(emailTo)){setError('Confirma un único correo electrónico válido del cliente.');return;}
   if(!confirmRecipient){setError('Confirma que revisaste el destinatario y el reporte antes de enviarlo.');return;}
   if(!emailSubject.trim()||!emailMessage.trim()){setError('El asunto y el mensaje son obligatorios.');return;}
   setEmailSending(true);setError('');setNotice('');
   try{
     const auth=await supabase.auth.getSession();
     const token=auth?.data?.session?.access_token;
     if(auth.error||!token)throw Error('Tu sesión venció. Inicia sesión de nuevo.');
     // Native jsPDF is created once per send and validated as nonblank; no HTML
     // print window or screenshot is attached to the email.
     const blob=executivePdfBlob(makeReportPayload());
     const pdfBase64=await blobToPdfBase64(blob);
     const response=await fetch('/api/send-executive-report',{
       method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
       body:JSON.stringify({
         clientId,from,to,toEmail:emailTo.trim(),subject:emailSubject.trim(),
         message:emailMessage,pdfBase64,
       }),
     });
     const result=await response.json().catch(()=>({}));
     if(!response.ok||!result.accepted)throw Error(result.error||'El servicio de correo no aceptó el reporte.');
     setEmailOpen(false);setConfirmRecipient(false);
     setNotice('El proveedor de correo aceptó el envío del PDF a '+result.to+
       (result.id?' (referencia '+result.id+').':'.')+
       (result.archived?' Se conservó una copia PDF en el archivo del cliente.':
       ' AVISO: '+(result.archiveWarning||'La copia PDF no se pudo registrar en el historial.'))+
       ' La entrega final depende del destinatario.');
     setHistoryRefresh(value=>value+1);
   }catch(e){setError('No se pudo enviar el reporte: '+(e.message||String(e)));}
   finally{setEmailSending(false);}
 }
 const section=(title,content)=> <div style={panel}><h3 style={{margin:'0 0 8px',color:'#17365D',fontSize:15}}>{title}</h3>{content}</div>;
 const trend=effectivePrior?.hasActivity?comparisonChange(metrics.revenue,effectivePrior.revenue):null;
 return <section style={{maxWidth:1140,margin:'0 auto',fontFamily:'Calibri,Arial,sans-serif',color:'#26394D'}}>
  <div style={{...panel,marginTop:0,borderTop:'4px solid #17365D'}}>
   <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
    <div>
     <div style={{fontSize:11,color:'#517298',fontWeight:700,letterSpacing:1}}>TBS | CONSULTORÍA FINANCIERA</div>
     <h2 style={{fontSize:22,color:'#17365D',margin:'5px 0'}}>Reporte Financiero Ejecutivo</h2>
     <div style={{fontSize:13}}><strong>{businessName}</strong> · {from} al {to}</div>
     <div style={{fontSize:12,color:'#64748B',marginTop:5}}>
      {notes.comparisonMode==='months'?monthlyRows.length+' meses seleccionados para comparar':comparisonPeriod?'Comparación seleccionada: '+comparisonPeriod.from+' al '+comparisonPeriod.to:notes.comparisonMode==='none'?'Sin comparación':'Selecciona un período comparativo válido'}
     </div>
    </div>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'start'}}>
     <button style={{...button,color:'#17365D',background:'#EBF0F5'}} onClick={onClose}>Volver a Reports</button>
     <button style={{...button,background:'#507290'}} disabled={loading||saving} onClick={saveNotes}>{saving?'Guardando…':'Guardar análisis'}</button>
     <button style={{...button,background:'#E6EDF5',color:'#17365D'}} onClick={()=>setHistoryOpen(v=>!v)}>{historyOpen?'Ocultar historial':'Historial de reportes'}</button>
     <button style={button} disabled={exportingPdf||exportingWord||emailSending} onClick={downloadPdf}>{exportingPdf?'Generando PDF…':'Descargar PDF'}</button>
     <button style={{...button,background:'#507290'}} disabled={exportingWord||exportingPdf||emailSending} onClick={downloadWord}>{exportingWord?'Generando Word…':'Descargar Word'}</button>
     {isStaff&&<button style={{...button,background:'#0F6E56'}} disabled={emailSending||resolvingEmail||exportingPdf||exportingWord} onClick={prepareEmail}>{resolvingEmail?'Buscando correo del cliente…':'Enviar PDF por email'}</button>}
    </div>
   </div>
   {loading&&<p style={{fontSize:12,color:'#64748B'}}>Cargando notas de este período…</p>}
   <p style={{fontSize:12,color:'#506579',margin:'9px 0 0'}}>
    {historyLoading?'Consultando último análisis guardado…':savedHistory.length?
      <>Último análisis guardado: <strong>{savedHistory[0].period_from} al {savedHistory[0].period_to}</strong>
      {' · '}Actualizado {historyStamp(savedHistory[0].updated_at)} por {historyActor(savedHistory[0].updated_by)}.</>:
      'Este cliente no tiene análisis guardados.'}
   </p>
   {dirty&&<p style={{fontSize:12,color:'#946200'}}>Cambios sin guardar: el PDF mostrará el borrador actual, pero debes guardar para conservarlo en TBS.</p>}
   {error&&<p role="alert" style={{fontSize:12,color:'#B91C1C'}}>{error}</p>}
   {notice&&<p role="status" style={{fontSize:12,color:'#0F6E56'}}>{notice}</p>}
  </div>
  {historyOpen&&section('Historial de reportes',<>
   <p style={{fontSize:12,color:'#64748B'}}>Los análisis guardados se organizan por cliente y período. Al abrir uno, las cifras financieras se recalculan con los registros contables actuales. Los PDF enviados y archivados son copias fijas del documento original.</p>
   <button type="button" style={{...button,background:'#E6EDF5',color:'#17365D'}} onClick={()=>setHistoryRefresh(v=>v+1)} disabled={historyLoading}>Actualizar historial</button>
   {historyLoading&&<p style={{fontSize:12}}>Consultando historial…</p>}
   {historyError&&<p role="alert" style={{color:'#B91C1C',fontSize:12}}>{historyError}</p>}
   <h4 style={{color:'#17365D',marginBottom:8}}>Análisis guardados por período</h4>
   {!historyLoading&&savedHistory.length===0&&<p style={{fontSize:12,color:'#64748B'}}>No hay análisis guardados para este cliente.</p>}
   <div style={{display:'grid',gap:8}}>
    {savedHistory.map(row=><div key={row.id} style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',padding:10,border:'1px solid #E1E7EF',borderRadius:7}}>
     <div style={{fontSize:12}}>
      <strong>{row.period_from} al {row.period_to}</strong>
      <div style={{color:'#64748B',marginTop:4}}>Actualizado: {historyStamp(row.updated_at)} · {historyActor(row.updated_by)}</div>
     </div>
     <button type="button" style={{...button,padding:'7px 10px'}} onClick={()=>openSavedPeriod(row.period_from,row.period_to)} disabled={loading||saving||emailSending||((row.period_from===from)&&(row.period_to===to))}>
      {row.period_from===from&&row.period_to===to?'Período actual':'Abrir análisis'}
     </button>
    </div>)}
   </div>
   <h4 style={{color:'#17365D',margin:'20px 0 8px'}}>PDF enviados y archivados</h4>
   {!historyLoading&&archiveHistory.length===0&&<p style={{fontSize:12,color:'#64748B'}}>Todavía no hay copias PDF de correos aceptados por el proveedor desde la activación del archivo.</p>}
   <div style={{display:'grid',gap:8}}>
    {archiveHistory.map(row=><div key={row.id} style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',padding:10,border:'1px solid #E1E7EF',borderRadius:7}}>
     <div style={{fontSize:12,minWidth:0}}>
      <strong>{row.period_from} al {row.period_to}</strong>
      <div style={{color:'#64748B',marginTop:4}}>Envío aceptado: {historyStamp(row.sent_at)} · {historyActor(row.sent_by)}</div>
      <div style={{color:'#64748B',marginTop:3}}>Destinatario: {row.recipient_email}</div>
     </div>
     <button type="button" style={{...button,padding:'7px 10px'}} onClick={()=>downloadArchive(row)} disabled={Boolean(downloadingArchive)}>
      {downloadingArchive===row.id?'Descargando…':'Descargar PDF original'}
     </button>
    </div>)}
   </div>
  </>)}
  {warnings.length>0&&<div style={{...panel,background:'#FFFAF0',borderColor:'#E8C58A'}}>
   <h3 style={{color:'#965500',marginTop:0}}>Validaciones contables pendientes</h3>
   <List entries={warnings}/>
   <p style={{fontSize:12}}>Las conclusiones deben considerarse provisionales hasta verificar estas partidas. No se registran ajustes automáticos.</p>
  </div>}
  {section('Resumen ejecutivo',<>
    <p style={{fontSize:12,color:'#64748B'}}>Este texto se genera a partir de las ventas, gastos y ganancia neta del período. No utiliza conclusiones de mercado no verificadas.</p>
    <div style={{borderLeft:'3px solid #50769B',padding:'10px 15px',background:'#F3F7FB',borderRadius:5}}>
      {summary.map((sentence,i)=><p key={i} style={{fontSize:13,lineHeight:1.6,margin:'5px 0'}}>{sentence}</p>)}
    </div>
  </>)}
  {section('Seleccionar las partes que deseas compartir con el cliente',<>
    <p style={{fontSize:12,color:'#64748B'}}>
      El reporte completo se conserva en TBS. Estas selecciones afectan solamente el contenido
      de los documentos PDF y Word que descargues o envíes al cliente. Las advertencias contables
      no se pueden ocultar cuando exista alguna validación pendiente.
    </p>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:9}}>
      {EXECUTIVE_SECTIONS.map(item=><label key={item.key} style={{
        display:'flex',gap:8,padding:'10px 12px',alignItems:'start',
        border:'1px solid #DAE4EC',borderRadius:7,cursor:'pointer',
        background:notes.clientSections.includes(item.key)?'#EFF6FD':'#FFF'}}>
        <input aria-label={'Compartir '+item.label} type="checkbox"
          checked={notes.clientSections.includes(item.key)}
          onChange={e=>change('clientSections',e.target.checked?
            normalizeClientSections([...notes.clientSections,item.key]):
            notes.clientSections.filter(key=>key!==item.key))}/>
        <span>
          <strong style={{display:'block',fontSize:12}}>{item.label}</strong>
          <small style={{color:item.confidential?'#98521A':'#64748B',fontSize:11}}>
            {item.confidential?'Confidencial: ':''}{item.description}
          </small>
        </span>
      </label>)}
    </div>
    <div style={{display:'flex',gap:8,marginTop:12,alignItems:'center',flexWrap:'wrap'}}>
      <button type="button" style={{...button,background:'#EEF3F8',color:'#17365D'}}
        onClick={()=>change('clientSections',[...DEFAULT_CLIENT_SECTIONS])}>Restablecer selección recomendada</button>
      <span style={{fontSize:12,color:'#64748B'}}>
        {notes.clientSections.length} sección(es) seleccionadas.
        {' '}Las notas y acuerdos internos están excluidos por defecto.
      </span>
    </div>
    {notes.clientSections.length===0&&<p style={{color:'#B91C1C',fontSize:12}}>Selecciona al menos una sección antes de exportar o enviar.</p>}
  </>)}
  {section('Comparar meses y períodos',<>
    <p style={{fontSize:12,color:'#64748B'}}>Elige el período de referencia. Las cuentas de resultados reflejan actividad de cada intervalo; efectivo, activos, pasivos y A/R se comparan al cierre de cada uno. No se suman balances de meses diferentes.</p>
    <div style={{display:'flex',gap:14,flexWrap:'wrap',alignItems:'end'}}>
      <label style={{fontSize:12,minWidth:210}}>Tipo de comparación
        <select style={{...field,display:'block',marginTop:4}} value={notes.comparisonMode}
          onChange={e=>change('comparisonMode',e.target.value)}>
          <option value="previous">Período anterior equivalente</option>
          <option value="month">Mes específico</option>
          <option value="months">Comparar varios meses seleccionados</option>
          <option value="custom">Período personalizado</option>
          <option value="none">Sin comparación</option>
        </select>
      </label>
      {notes.comparisonMode==='month'&&<label style={{fontSize:12}}>Mes a comparar
        <input aria-label="Mes a comparar" type="month" style={{...field,display:'block',marginTop:4}}
          value={notes.comparisonFrom.slice(0,7)}
          onChange={e=>{
            const range=monthRange(e.target.value);
            if(range)setNotes(old=>({...old,comparisonFrom:range.from,comparisonTo:range.to}));
            setDirty(true);
          }}/>
      </label>}
      {notes.comparisonMode==='months'&&<div style={{minWidth:290,flex:'1 1 290px'}}>
        <label style={{fontSize:12,display:'block'}}>Añadir mes para comparar (máximo {MAX_MONTHS})
          <div style={{display:'flex',gap:8,marginTop:5}}>
            <input type="month" aria-label="Añadir mes" value={monthToAdd} style={{...field,maxWidth:190}}
              onChange={e=>setMonthToAdd(e.target.value)}/>
            <button type="button" style={button} disabled={!monthToAdd||notes.selectedMonths.length>=MAX_MONTHS}
              onClick={()=>{
                const selectedMonths=addSelectedMonth(notes.selectedMonths,monthToAdd);
                change('selectedMonths',selectedMonths);setMonthToAdd('');
              }}>Añadir</button>
          </div>
        </label>
        <div style={{display:'flex',gap:7,flexWrap:'wrap',marginTop:9}}>
          {notes.selectedMonths.map(month=><button type="button" key={month} title={'Quitar '+month}
            onClick={()=>change('selectedMonths',notes.selectedMonths.filter(item=>item!==month))}
            style={{border:'1px solid #C7D8E6',borderRadius:18,background:'#EEF5FC',
              color:'#17365D',padding:'6px 9px',cursor:'pointer',fontSize:12}}>
            {month} ×
          </button>)}
          {notes.selectedMonths.length===0&&<span style={{fontSize:12,color:'#64748B'}}>Todavía no hay meses seleccionados.</span>}
        </div>
      </div>}
      {notes.comparisonMode==='custom'&&<>
        <label style={{fontSize:12}}>Desde
          <input aria-label="Comparación desde" type="date" style={{...field,display:'block',marginTop:4}}
            value={notes.comparisonFrom} onChange={e=>change('comparisonFrom',e.target.value)}/>
        </label>
        <label style={{fontSize:12}}>Hasta
          <input aria-label="Comparación hasta" type="date" style={{...field,display:'block',marginTop:4}}
            value={notes.comparisonTo} onChange={e=>change('comparisonTo',e.target.value)}/>
        </label>
      </>}
    </div>
    {['month','custom'].includes(notes.comparisonMode)&&!comparisonPeriod&&
      <p style={{color:'#B91C1C',fontSize:12}}>Selecciona un mes o intervalo válido antes de guardar o imprimir.</p>}
    {notes.comparisonMode==='months'&&<div style={{marginTop:12}}>
      {monthlyRows.length<2&&<p style={{color:'#B91C1C',fontSize:12}}>
        Selecciona al menos dos meses. Puedes elegir meses no consecutivos, de diferentes años, hasta un máximo de 12.
      </p>}
      {monthlyRows.length>=2&&<>
        <p style={{fontSize:12,color:'#64748B'}}>
          Valores de cada mes elegido, ordenados cronológicamente. La cifra pequeña indica
          el cambio respecto al mes anterior seleccionado. Los balances son al cierre de cada mes.
        </p>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead><tr style={{background:'#EDF3F8',color:'#17365D'}}>
              <th style={{padding:8,textAlign:'left',position:'sticky',left:0,background:'#EDF3F8'}}>Indicador</th>
              {monthlyRows.map(r=><th key={r.month} style={{padding:8,textAlign:'right',whiteSpace:'nowrap'}}>{r.label}</th>)}
            </tr></thead>
            <tbody>{monthlyKpis.map(row=><tr key={row.key} style={{borderBottom:'1px solid #E1E7EE'}}>
              <td style={{padding:8,whiteSpace:'nowrap',fontWeight:600,position:'sticky',left:0,background:'white'}}>{row.label}</td>
              {row.values.map((amount,i)=>{
                const c=row.changes[i];
                const changeLabel=!c||c.delta===null?'—':
                  c.changePoints!==null?(c.changePoints>0?'+':'')+c.changePoints.toFixed(2)+' pp':
                  c.changePercent!==null?(c.changePercent>0?'+':'')+c.changePercent.toFixed(1)+'%':'N/D';
                return <td key={monthlyRows[i].month} style={{padding:8,textAlign:'right',whiteSpace:'nowrap'}}>
                  <strong>{value(row.key,amount)}</strong>
                  {i>0&&<div style={{fontSize:10,color:c?.delta<0?'#AB3C29':'#4D6988'}}>{changeLabel} vs anterior</div>}
                </td>;
              })}
            </tr>)}</tbody>
          </table>
        </div>
        <div style={{marginTop:11}}>
          <h4 style={{color:'#17365D',margin:'3px 0'}}>Hallazgos mes a mes</h4>
          <List entries={monthlyFindings} empty="No hay actividad suficiente para interpretar cambios entre los meses seleccionados."/>
        </div>
      </>}
    </div>}
    {comparisonPeriod&&<p style={{fontSize:12,color:'#17365D'}}>
      <strong>Período principal:</strong> {from} al {to} · <strong>Período comparado:</strong> {comparisonPeriod.from} al {comparisonPeriod.to}
      {comparisonHasActivity?'':' · Sin movimientos suficientes de ingresos/gastos en el período comparado'}
    </p>}
    {comparisonPeriod&&baseline&&<div style={{overflowX:'auto',marginTop:12}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
        <thead><tr style={{background:'#EDF3F8',color:'#17365D'}}>
          {['Indicador','Comparado','Principal','Diferencia $ / pp','Variación %'].map(t=>
            <th key={t} style={{padding:9,textAlign:t==='Indicador'?'left':'right'}}>{t}</th>)}
        </tr></thead>
        <tbody>{comparison.map(r=><tr key={r.key} style={{borderBottom:'1px solid #E1E7EE'}}>
          <td style={{padding:8}}>{r.label}</td>
          <td style={{padding:8,textAlign:'right',whiteSpace:'nowrap'}}>{value(r.key,r.prior)}</td>
          <td style={{padding:8,textAlign:'right',whiteSpace:'nowrap'}}>{value(r.key,r.current)}</td>
          <td style={{padding:8,textAlign:'right',whiteSpace:'nowrap'}}>{r.delta===null?'N/D':r.changePoints!==null?r.changePoints.toFixed(2)+' pp':money(r.delta)}</td>
          <td style={{padding:8,textAlign:'right',whiteSpace:'nowrap'}}>{r.changePercent===null?'N/D':r.changePercent.toFixed(2)+'%'}</td>
        </tr>)}</tbody>
      </table>
      <p style={{fontSize:11,color:'#64748B'}}>Variación % no disponible cuando la base comparada es cero; los márgenes se expresan en puntos porcentuales (pp).</p>
      <h4 style={{color:'#17365D'}}>Hallazgos de la comparación</h4>
      <List entries={comparisonHasActivity?comparisonNotes:[]} empty="No hay actividad suficiente para interpretar las variaciones de ingresos y gastos."/>
    </div>}
  </>)}
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
   {trend!==null&&<p style={{fontSize:12,color:'#64748B'}}>Variación de ventas frente al período seleccionado: <strong>{trend>0?'+':''}{trend.toFixed(1)}%</strong>. No es una comparación contra el mercado.</p>}
  </>)}
  {operationalRows.length>0&&section('Productividad e indicadores operacionales',<>
   <p style={{fontSize:12,color:'#64748B'}}>
    Información mensual registrada para este cliente. Las ventas por unidad solo se calculan cuando
    el período abarca meses completos y todos los meses tienen mediciones.
   </p>
   <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
    <thead><tr style={{background:'#EDF3F8',color:'#17365D'}}>
     <th style={{textAlign:'left',padding:9}}>Indicador</th>
     <th style={{textAlign:'right',padding:9}}>Resultado</th>
     <th style={{textAlign:'right',padding:9}}>Meses cubiertos</th>
     <th style={{textAlign:'right',padding:9}}>Ventas por unidad</th>
    </tr></thead>
    <tbody>{operationalRows.map(r=><tr key={r.metricId} style={{borderBottom:'1px solid #E2E8F0'}}>
     <td style={{padding:8}}>{r.name}</td>
     <td style={{textAlign:'right',padding:8}}>{operationalMetricFormat(r.result,r.unit)}</td>
     <td style={{textAlign:'right',padding:8}}>{r.periodCount} / {r.expectedMonths}</td>
     <td style={{textAlign:'right',padding:8}}>{r.revenuePerUnit===null?'N/D':money(r.revenuePerUnit)}</td>
    </tr>)}</tbody>
   </table></div>
  </>)}
  {section('Resultados mensuales — gráfica de barras verticales y tabla',monthlySales.error?
    <p style={{color:'#B91C1C',fontSize:12}}>{monthlySales.error}</p>:
    <TBSMonthlySalesVisual data={monthlySales} from={from} to={to}/>)}
  {section('Gráficas para la reunión',<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(290px,1fr))',gap:12}}>
   <BarChart title="Ingresos, gastos y ganancia neta" items={[{label:'Ventas',value:metrics.revenue},{label:'Gastos',value:metrics.expenses},{label:'Ganancia neta',value:metrics.net_income}]}/>
   <BarChart title="Balances contables al cierre" items={[{label:'Efectivo',value:metrics.cash},{label:'A/R',value:metrics.receivables},{label:'Pasivos',value:metrics.liabilities}]}/>
  </div>)}
  {section('Cinco gastos principales del período',<>
    <p style={{fontSize:12,color:'#64748B'}}>
      Las cuentas se ordenan según su importe de gasto registrado entre {from} y {to},
      incluyendo costos de ventas. Se muestran solo gastos positivos; los créditos
      o ajustes negativos no se presentan como categorías principales.
    </p>
    {topExpenses.rows.length>0?<div style={{overflowX:'auto'}}>
     <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
      <thead><tr style={{background:'#EDF3F8',color:'#17365D'}}>
       <th style={{padding:9,textAlign:'left'}}>Cuenta de gasto</th>
       <th style={{padding:9,textAlign:'right'}}>Importe</th>
       <th style={{padding:9,textAlign:'right'}}>% del total de gastos</th>
      </tr></thead>
      <tbody>{topExpenses.rows.map(r=><tr key={r.code} style={{borderBottom:'1px solid #E2E8F0'}}>
       <td style={{padding:8}}>{r.code} · {r.name}{r.isCogs?' (Costo de ventas)':''}</td>
       <td style={{padding:8,textAlign:'right'}}>{money(r.amount)}</td>
       <td style={{padding:8,textAlign:'right'}}>{r.percent===null?'N/D':r.percent.toFixed(1)+'%'}</td>
      </tr>)}</tbody>
     </table>
    </div>:<p style={{fontSize:12,color:'#64748B'}}>No hay cuentas de gasto positivo que analizar en este período.</p>}
    <strong style={{fontSize:13,color:'#17365D'}}>Hallazgos y prioridades</strong>
    <List entries={topExpenses.findings}/>
   </>)}
  {section('Hallazgos principales',<List entries={narrative.findings}/>)}
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
    <button style={button} disabled={exportingPdf||exportingWord||emailSending} onClick={downloadPdf}>{exportingPdf?'Generando PDF…':'Descargar PDF'}</button>
     <button style={{...button,background:'#507290'}} disabled={exportingWord||exportingPdf||emailSending} onClick={downloadWord}>{exportingWord?'Generando Word…':'Descargar Word'}</button>
     {isStaff&&<button style={{...button,background:'#0F6E56'}} disabled={emailSending||resolvingEmail||exportingPdf||exportingWord} onClick={prepareEmail}>{resolvingEmail?'Buscando correo del cliente…':'Enviar PDF por email'}</button>}
   </div>
  </>)}
  {emailOpen&&isStaff&&<div role="presentation" style={{position:'fixed',inset:0,
    background:'rgba(10,23,39,0.56)',zIndex:100,display:'flex',alignItems:'center',
    justifyContent:'center',padding:18}}>
    <div role="dialog" aria-modal="true" aria-label="Enviar Reporte Financiero Ejecutivo"
      style={{background:'white',borderRadius:10,padding:22,maxWidth:650,width:'100%',
        maxHeight:'90vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,.2)'}}>
      <h3 style={{color:'#17365D',marginTop:0}}>Enviar Reporte Financiero Ejecutivo en PDF</h3>
      <p style={{color:'#64748B',fontSize:12}}>
        Revisa el destinatario, las secciones seleccionadas y el mensaje. Se adjuntará un PDF válido del reporte
        del cliente {businessName}, desde {from} hasta {to}. No se enviará automáticamente.
      </p>
      <p style={{fontSize:11,background:'#EFF6FD',padding:10,borderRadius:6}}>
        <strong>Secciones incluidas:</strong> {EXECUTIVE_SECTIONS.filter(item=>notes.clientSections.includes(item.key))
          .map(item=>item.label).join(' · ')}
      </p>
      <label style={{fontSize:12,display:'block',marginBottom:11}}>Correo del cliente
        <input type="email" aria-label="Correo del cliente" style={{...field,display:'block',marginTop:4}}
          placeholder="correo@cliente.com" autoComplete="off" value={emailTo}
          onChange={e=>{setEmailTo(e.target.value);setRecipientStatus('manual');setConfirmRecipient(false);}}/>
      </label>
      {recipientStatus==='found'&&<p role="status" style={{fontSize:12,color:'#166534'}}>Correo predeterminado cargado del perfil del cliente en Twelve Business Strategies. Verifique el destinatario antes de enviarlo.</p>}
      {recipientStatus==='missing'&&<p role="status" style={{fontSize:12,color:'#805500'}}>Este cliente no tiene un correo registrado en su perfil vinculado de Twelve Business Strategies. Ingrese y confirme el destinatario.</p>}
      {recipientStatus==='invalid'&&<p role="alert" style={{fontSize:12,color:'#B91C1C'}}>El correo del perfil del cliente no tiene un formato válido. Corríjalo en Customers o ingrese manualmente un destinatario válido.</p>}
      {recipientStatus==='ambiguous'&&<p role="alert" style={{fontSize:12,color:'#B91C1C'}}>El cliente tiene más de un correo diferente en sus perfiles vinculados. Seleccione y confirme manualmente el destinatario antes de enviar.</p>}
      {recipientStatus==='unavailable'&&<p role="alert" style={{fontSize:12,color:'#B91C1C'}}>No fue posible consultar el correo del perfil del cliente. Puede introducirlo manualmente y verificarlo antes de enviar.</p>}
      <label style={{fontSize:12,display:'block',marginBottom:11}}>Asunto
        <input aria-label="Asunto del email" style={{...field,display:'block',marginTop:4}}
          value={emailSubject} onChange={e=>setEmailSubject(e.target.value)}/>
      </label>
      <label style={{fontSize:12,display:'block',marginBottom:10}}>Mensaje editable para el cliente
        <textarea aria-label="Mensaje del reporte" rows={10}
          style={{...field,display:'block',marginTop:4,resize:'vertical'}}
          value={emailMessage} onChange={e=>setEmailMessage(e.target.value)}/>
      </label>
      <p style={{fontSize:11,color:'#64748B'}}>
        El mensaje incluye cómo comunicarse con Twelve Business Strategies LLC:
        admin@twelvestrategies.com. El remitente se obtiene de la configuración segura de correo de TBS.
      </p>
      <label style={{fontSize:12,display:'flex',gap:8,alignItems:'start',margin:'13px 0',cursor:'pointer'}}>
        <input type="checkbox" checked={confirmRecipient}
          onChange={e=>setConfirmRecipient(e.target.checked)}/>
        Confirmo que revisé el destinatario, los números y el archivo PDF antes de enviarlo.
      </label>
      <div style={{display:'flex',justifyContent:'flex-end',gap:9,flexWrap:'wrap'}}>
        <button type="button" style={{...button,background:'#E9EEF4',color:'#17365D'}}
          disabled={emailSending} onClick={()=>{setEmailOpen(false);setConfirmRecipient(false);}}>Cancelar</button>
        <button type="button" style={button} disabled={emailSending||!confirmRecipient||!validRecipientEmail(emailTo)}
          onClick={sendReportEmail}>{emailSending?'Enviando…':'Enviar PDF al cliente'}</button>
      </div>
    </div>
  </div>}
  <p style={{fontSize:11,lineHeight:1.5,color:'#64748B'}}>
   Fuente financiera: TBS Accounting Engine. Las cifras están sujetas a clasificaciones, conciliaciones y ajustes posteriores.
   El efectivo se identifica según el nombre de las cuentas. Las referencias de mercado son aportadas por la gerencia;
   no hay consultas automáticas a fuentes externas. Reporte gerencial, no auditoría.
  </p>
 </section>;
}
