import React,{useEffect,useMemo,useState} from 'react';
import {supabase} from './supabaseClient';
import {RETENTION_CATEGORIES,ASSESSMENT_CATEGORIES,retentionBalances,validPeriod,asMoney,cents,payrollGrossByPeriod,retentionPivot} from './tbsRetentionLedger.js';

const fmt=n=>Number(n||0).toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
const getDate=()=>new Date().toISOString().slice(0,10);
const blank=()=>({category:'services_contractor',tax_period:getDate().slice(0,7),paid_date:getDate(),amount:'',reference:'',notes:''});
const blankAssessment=()=>({category:'employer_unemployment_pr',tax_period:getDate().slice(0,7),amount:'',due_date:'',reference:'',notes:''});
const surface={border:'1px solid #E2E5E9',borderRadius:9,padding:16,background:'#fff',marginBottom:16};
const field={border:'1px solid #CBD5E1',borderRadius:5,padding:'8px 9px',maxWidth:'100%',boxSizing:'border-box'};
const btn={border:'1px solid #CBD5E1',background:'#fff',color:'#17365D',borderRadius:5,padding:'7px 11px',cursor:'pointer'};
const cell={borderBottom:'1px solid #E9EDF2',padding:'8px 7px',textAlign:'left'};
const label={fontSize:12,color:'#475569',display:'block',marginBottom:4};
const catLabel=id=>RETENTION_CATEGORIES.find(c=>c.id===id)?.label||id;

export default function RetentionsView({clientId,services,payrollRuns,payrollLines,businessName}) {
  const [payments,setPayments]=useState([]);
  const [assessments,setAssessments]=useState([]);
  const [assessmentForm,setAssessmentForm]=useState(blankAssessment);
  const [editingAssessmentId,setEditingAssessmentId]=useState('');
  const [assessmentMessage,setAssessmentMessage]=useState('');
  const [assessmentBusy,setAssessmentBusy]=useState(false);
  const [loadState,setLoadState]=useState('loading');
  const [loadMessage,setLoadMessage]=useState('');
  const [form,setForm]=useState(blank);
  const [editingId,setEditingId]=useState('');
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');
  const [periodFilter,setPeriodFilter]=useState('all');
  const [groupFilter,setGroupFilter]=useState('all');
  const [showHistory,setShowHistory]=useState(true);
  const [pivotGrouping,setPivotGrouping]=useState('month');

  useEffect(()=>{
    let active=true;
    setLoadState('loading');setPayments([]);setAssessments([]);setLoadMessage('');setMessage('');
    setEditingId('');setForm(blank());setEditingAssessmentId('');setAssessmentForm(blankAssessment());
    setAssessmentMessage('');setPeriodFilter('all');setGroupFilter('all');
    (async()=>{
      const [paymentResult,assessmentResult]=await Promise.all([
        supabase.from('retention_payments')
          .select('id,client_id,category,tax_period,paid_date,amount,reference,notes,created_at')
          .eq('client_id',clientId).order('paid_date',{ascending:false}),
        supabase.from('retention_assessments')
          .select('id,client_id,category,tax_period,amount,due_date,reference,notes,created_at')
          .eq('client_id',clientId).order('tax_period',{ascending:false})
      ]);
      if(!active)return;
      if(paymentResult.error||assessmentResult.error){
        setLoadState('error');
        setLoadMessage(paymentResult.error?.message||assessmentResult.error?.message||'Could not load employer obligations');
        return;
      }
      setPayments((paymentResult.data||[]).map(p=>({...p,amount:Number(p.amount)||0})));
      setAssessments((assessmentResult.data||[]).map(a=>({...a,amount:Number(a.amount)||0})));
      setLoadState('ready');
    })();
    return ()=>{active=false;};
  },[clientId]);

  const summary=useMemo(()=>retentionBalances({services,payrollRuns,payrollLines,assessments},payments),
    [services,payrollRuns,payrollLines,assessments,payments]);

  const months=useMemo(()=>Array.from(new Set([
    ...summary.rows.map(r=>r.period),...payments.map(p=>p.tax_period),...assessments.map(a=>a.tax_period)
  ])).sort().reverse(),[summary.rows,payments,assessments]);
  const fits=(cat,period)=>(groupFilter==='all'||RETENTION_CATEGORIES.some(x=>
    x.id===cat && (groupFilter===x.group || groupFilter===cat))) &&
    (periodFilter==='all'||period===periodFilter);
  const summaryRows=summary.rows.filter(r=>fits(r.category,r.period));
  const visiblePayments=payments.filter(p=>fits(p.category,p.tax_period));
  const visibleAssessments=assessments.filter(a=>fits(a.category,a.tax_period));
  const grossMonths=useMemo(()=>payrollGrossByPeriod(payrollRuns,payrollLines),
    [payrollRuns,payrollLines]);
  const pivotRows=useMemo(()=>{
    const filtered={...summary,rows:summary.rows.filter(r=>
      groupFilter==='all'||RETENTION_CATEGORIES.some(c=>c.id===r.category &&
        (c.group===groupFilter||c.id===groupFilter)))};
    return retentionPivot(filtered,grossMonths,pivotGrouping);
  },[summary,grossMonths,pivotGrouping,groupFilter]).filter(r=>{
      if(periodFilter==='all')return true;
      return pivotGrouping==='month' ? r.period===periodFilter :
        r.period===periodFilter.slice(0,4)+'-Q'+Math.ceil(Number(periodFilter.slice(5))/3);
    });
  const totals=summaryRows.reduce((a,r)=>({
    accrued:a.accrued+cents(r.accrued),paid:a.paid+cents(r.paid),
    pending:a.pending+cents(r.pending),overpaid:a.overpaid+cents(r.overpaid),
  }),{accrued:0,paid:0,pending:0,overpaid:0});
  const total=(type)=>fmt(asMoney(totals[type]));
  const change=(name,val)=>setForm(f=>({...f,[name]:val}));

  function startEdit(payment){
    setForm({category:payment.category,tax_period:payment.tax_period,
      paid_date:payment.paid_date,amount:String(payment.amount),
      reference:payment.reference||'',notes:payment.notes||''});
    setEditingId(payment.id);setMessage('');
    window.scrollTo?.({top:0,behavior:'smooth'});
  }
  function resetForm(){setForm(blank());setEditingId('');setMessage('');}

  async function savePayment(e){
    e.preventDefault();if(saving)return;
    const amount=Math.round(Number(form.amount)*100)/100;
    if(!RETENTION_CATEGORIES.some(c=>c.id===form.category)||!validPeriod(form.tax_period)||
       !/^\d{4}-\d{2}-\d{2}$/.test(form.paid_date)||!Number.isFinite(amount)||amount<=0){
      setMessage('Verifica categoría, período YYYY-MM, fecha y una cantidad mayor que $0.00.');return;
    }
    const otherPayments=payments.filter(p=>p.id!==editingId);
    const outstanding=retentionBalances({services,payrollRuns,payrollLines,assessments},otherPayments).rows
      .find(r=>r.period===form.tax_period&&r.category===form.category);
    const available=outstanding?.pending||0;
    if(amount>available+0.009){
      const excess=fmt(amount-available);
      if(!window.confirm('Este pago excede el balance registrado de ese período en '+excess+
        '. Quedará identificado como pago en exceso, sin aplicarse a otros períodos. ¿Continuar?'))return;
    }
    if(!window.confirm((editingId?'Actualizar':'Registrar')+' pago de '+fmt(amount)+' ('+
      catLabel(form.category)+', '+form.tax_period+') con fecha '+form.paid_date+'?'))return;
    setSaving(true);setMessage('');
    try{
      const payload={category:form.category,tax_period:form.tax_period,paid_date:form.paid_date,
        amount,reference:form.reference.trim().slice(0,250),notes:form.notes.trim().slice(0,1000)};
      if(editingId){
        const {data,error}=await supabase.from('retention_payments').update(payload)
          .eq('client_id',clientId).eq('id',editingId).select('*').single();
        if(error)throw error;
        setPayments(prev=>prev.map(p=>p.id===editingId?{...data,amount:Number(data.amount)}:p));
      }else{
        const {data:{user},error:authError}=await supabase.auth.getUser();
        if(authError||!user?.id)throw new Error('La sesión expiró. Vuelve a iniciar sesión.');
        const {data,error}=await supabase.from('retention_payments')
          .insert({...payload,client_id:clientId,created_by:user.id}).select('*').single();
        if(error)throw error;
        setPayments(prev=>[{...data,amount:Number(data.amount)},...prev]);
      }
      setForm(blank());setEditingId('');setMessage('Pago registrado correctamente. El balance fue recalculado.');
    }catch(err){setMessage('No se guardó el pago: '+(err?.message||String(err)));}
    finally{setSaving(false);}
  }
  async function deletePayment(row){
    if(saving)return;
    if(!window.confirm('¿Eliminar el pago de '+fmt(row.amount)+' de '+catLabel(row.category)+
      ' ('+row.tax_period+')? Se recalculará el saldo.'))return;
    setSaving(true);setMessage('');
    try{
      const {data,error}=await supabase.from('retention_payments').delete()
        .eq('client_id',clientId).eq('id',row.id).select('id');
      if(error)throw error;
      if(!data?.length)throw new Error('No se eliminó ningún pago. Comprueba los permisos.');
      setPayments(prev=>prev.filter(p=>p.id!==row.id));
      if(editingId===row.id)resetForm();
      setMessage('Pago eliminado; saldo pendiente actualizado.');
    }catch(err){setMessage('Error al eliminar: '+err.message);}
    finally{setSaving(false);}
  }
  function resetAssessment(){
    setAssessmentForm(blankAssessment());setEditingAssessmentId('');setAssessmentMessage('');
  }
  function editAssessment(row){
    setEditingAssessmentId(row.id);
    setAssessmentForm({category:row.category,tax_period:row.tax_period,
      amount:String(row.amount),due_date:row.due_date||'',
      reference:row.reference||'',notes:row.notes||''});
    setAssessmentMessage('');
  }
  async function saveAssessment(e){
    e.preventDefault();
    if(assessmentBusy)return;
    const amount=Math.round(Number(assessmentForm.amount)*100)/100;
    if(!ASSESSMENT_CATEGORIES.some(c=>c.id===assessmentForm.category)||
       !validPeriod(assessmentForm.tax_period)||!Number.isFinite(amount)||amount<=0||
       (assessmentForm.due_date&&!/^\d{4}-\d{2}-\d{2}$/.test(assessmentForm.due_date))){
      setAssessmentMessage('Verifica la categoría patronal, período, importe y fecha de vencimiento.');return;
    }
    if(!window.confirm((editingAssessmentId?'Actualizar':'Registrar')+' obligación patronal de '+fmt(amount)+
      ' ('+catLabel(assessmentForm.category)+', '+assessmentForm.tax_period+')?'))return;
    setAssessmentBusy(true);setAssessmentMessage('');
    try{
      const payload={category:assessmentForm.category,tax_period:assessmentForm.tax_period,amount,
        due_date:assessmentForm.due_date||null,
        reference:assessmentForm.reference.trim().slice(0,250),
        notes:assessmentForm.notes.trim().slice(0,1000)};
      if(editingAssessmentId){
        const {data,error}=await supabase.from('retention_assessments').update(payload)
          .eq('client_id',clientId).eq('id',editingAssessmentId).select('*').single();
        if(error)throw error;
        setAssessments(prev=>prev.map(a=>a.id===editingAssessmentId?{...data,amount:Number(data.amount)}:a));
      }else{
        const {data:{user},error:authError}=await supabase.auth.getUser();
        if(authError||!user?.id)throw new Error('La sesión expiró. Inicia sesión nuevamente.');
        const {data,error}=await supabase.from('retention_assessments')
          .insert({...payload,client_id:clientId,created_by:user.id}).select('*').single();
        if(error)throw error;
        setAssessments(prev=>[{...data,amount:Number(data.amount)},...prev]);
      }
      setAssessmentForm(blankAssessment());setEditingAssessmentId('');
      setAssessmentMessage('Obligación guardada. El balance se recalculó sin modificar los Journal Entries.');
    }catch(error){setAssessmentMessage('No se guardó: '+(error?.message||String(error)));}
    finally{setAssessmentBusy(false);}
  }
  async function deleteAssessment(row){
    if(assessmentBusy||!window.confirm('¿Eliminar la obligación de '+fmt(row.amount)+' para '+
      catLabel(row.category)+' ('+row.tax_period+')? Los pagos registrados no se eliminarán.'))return;
    setAssessmentBusy(true);setAssessmentMessage('');
    try{
      const {data,error}=await supabase.from('retention_assessments').delete()
        .eq('client_id',clientId).eq('id',row.id).select('id');
      if(error)throw error;
      if(!data?.length)throw new Error('No se eliminó ningún registro; verifica permisos.');
      setAssessments(prev=>prev.filter(a=>a.id!==row.id));
      if(editingAssessmentId===row.id)resetAssessment();
      setAssessmentMessage('Obligación eliminada. Pagos conservados y saldo recalculado.');
    }catch(error){setAssessmentMessage('Error: '+error.message);}
    finally{setAssessmentBusy(false);}
  }

  function exportCSV(){
    const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
    const columns=[['Período','Categoría','Obligación','Pagado','Pendiente','A favor'],
      ...summaryRows.map(r=>[r.period,catLabel(r.category),
        r.accrued.toFixed(2),r.paid.toFixed(2),r.pending.toFixed(2),r.overpaid.toFixed(2)])];
    const detail=[['Fecha de pago','Período aplicado','Categoría','Cantidad','Referencia','Notas'],
      ...visiblePayments.map(p=>[p.paid_date,p.tax_period,catLabel(p.category),
        Number(p.amount).toFixed(2),p.reference,p.notes])];
    const pivot=[['Período','Gross Pay','Retenciones empleado/servicios','Patronal','Pagos','Pendiente','Pagos en exceso'],
      ...pivotRows.map(r=>[r.period,...['gross','retained','employer','paid','pending','overpaid']
        .map(key=>Number(r[key]).toFixed(2))])];
    const assessed=[['Período','Obligación patronal','Total determinado','Vencimiento','Referencia','Notas'],
      ...visibleAssessments.map(a=>[a.tax_period,catLabel(a.category),Number(a.amount).toFixed(2),
        a.due_date||'',a.reference,a.notes])];
    const csv=[...pivot.map(row=>row.map(quote).join(',')),'',
      ...columns.map(row=>row.map(quote).join(',')),'',
      ...detail.map(row=>row.map(quote).join(',')),'',
      ...assessed.map(row=>row.map(quote).join(','))].join('\r\n');
    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;
    a.download='Retenciones_'+(businessName||'Client').replace(/[^a-z0-9_-]/gi,'_')+'.csv';
    a.click();URL.revokeObjectURL(url);
  }

  return <div style={{maxWidth:1180}}>
    <h2 style={{margin:'0 0 6px'}}>Retenciones y Obligaciones Patronales</h2>
    <p style={{color:'#64748B',fontSize:13,margin:'0 0 16px'}}>
      Control por cliente basado en Gross Pay, retenciones de Payroll/Services, aportaciones
      patronales, desempleo y CFSE. Las retenciones automáticas proceden de períodos FINAL;
      los pagos y las obligaciones determinadas por agencias se registran por separado.
    </p>
    {loadState==='loading' && <p>Consultando pagos registrados…</p>}
    {loadState==='error' && <div style={{...surface,color:'#B00020'}}>
      No se pudieron obtener los pagos de retenciones: {loadMessage}. No se mostrarán balances incompletos.
    </div>}
    {loadState==='ready' && <>
      <div style={{...surface}}>
        <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'end',justifyContent:'space-between'}}>
          <div><label style={label}>Período contributivo</label>
            <select style={field} value={periodFilter} onChange={e=>setPeriodFilter(e.target.value)}>
              <option value="all">Todos los períodos</option>
              {months.map(m=><option key={m} value={m}>{m}</option>)}
            </select></div>
          <div><label style={label}>Origen</label>
            <select style={field} value={groupFilter} onChange={e=>setGroupFilter(e.target.value)}>
              <option value="all">Todos los conceptos</option>
              <option value="Payroll">Retenciones de Payroll</option>
              <option value="Services">Retenciones de Services</option>
              <option value="Patronal">Obligaciones patronales</option>
              {RETENTION_CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
            </select></div>
          <button style={btn} onClick={exportCSV}>Exportar CSV</button>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:10,marginBottom:16}}>
        {[
          ['Obligaciones acumuladas',total('accrued'),'#17365D'],
          ['Pagos registrados',total('paid'),'#0F6E56'],
          ['Pendiente de pagar',total('pending'),'#A16207'],
          ['Pagos en exceso',total('overpaid'),'#475569'],
        ].map(([name,value,color])=><div key={name} style={{...surface,margin:0}}>
          <div style={{fontSize:12,color:'#64748B'}}>{name}</div>
          <div style={{fontSize:21,fontWeight:700,color,marginTop:7}}>{value}</div>
        </div>)}
      </div>
      <div style={surface}>
        <div style={{display:'flex',gap:12,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap'}}>
          <h3 style={{margin:'0 0 10px',fontSize:17}}>Resumen dinámico desde Gross Pay</h3>
          <div><label style={label}>Agrupar</label>
            <select style={field} value={pivotGrouping} onChange={e=>setPivotGrouping(e.target.value)}>
              <option value="month">Mensual</option>
              <option value="quarter">Trimestral</option>
            </select>
          </div>
        </div>
        <p style={{fontSize:12,color:'#64748B',margin:'0 0 12px',lineHeight:1.5}}>
          Gross Pay es el total bruto de Payroll FINAL, agrupado por fecha de pago.
          Las retenciones y la participación patronal se muestran separadas.
          Gross Pay no equivale necesariamente a salarios tributables para FICA, SINOT,
          desempleo ni a la nómina cubierta por CFSE; verifica los topes y las planillas oficiales.
        </p>
        <div style={{overflowX:'auto'}}>
          <table style={{borderCollapse:'collapse',width:'100%',fontSize:12.5}}>
            <thead><tr style={{background:'#F5F7FA'}}>
              {['Período','Gross Pay','Retenciones','Patronal','Pagos','Pendiente','A favor'].map(t=>
                <th key={t} style={cell}>{t}</th>)}
            </tr></thead>
            <tbody>{pivotRows.map(row=><tr key={row.period}>
              <td style={cell}><strong>{row.period}</strong></td>
              {['gross','retained','employer','paid','pending','overpaid'].map(name=>
                <td key={name} style={{...cell,textAlign:'right',fontVariantNumeric:'tabular-nums'}}>
                  {fmt(row[name])}
                </td>)}
            </tr>)}</tbody>
          </table>
        </div>
        {!pivotRows.length&&<p style={{fontSize:12,color:'#64748B'}}>No hay nóminas u obligaciones para este período.</p>}
      </div>
      <div style={surface}>
        <h3 style={{margin:'0 0 12px',fontSize:17}}>Balances por período y obligación</h3>
        <div style={{overflowX:'auto'}}><table style={{borderCollapse:'collapse',width:'100%',fontSize:13}}>
          <thead><tr style={{background:'#F5F7FA'}}>
            {['Período','Concepto','Obligación','Pagado','Pendiente','A favor','Estado'].map(x=>
              <th key={x} style={cell}>{x}</th>)}
          </tr></thead>
          <tbody>{summaryRows.map(r=><tr key={r.category+'|'+r.period}>
            <td style={cell}>{r.period}</td><td style={cell}>{catLabel(r.category)}</td>
            {['accrued','paid','pending','overpaid'].map(key=>
              <td key={key} style={{...cell,textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{fmt(r[key])}</td>)}
            <td style={cell}><strong style={{color:r.pending>0.009?'#A16207':r.overpaid>0.009?'#475569':'#0F6E56'}}>
              {r.pending>0.009?'Pendiente':r.overpaid>0.009?'A favor':'Pagado'}</strong></td>
          </tr>)}</tbody>
        </table></div>
        {summaryRows.length===0 && <p style={{color:'#64748B',fontSize:13}}>No hay retenciones ni pagos para los filtros seleccionados.</p>}
      </div>
      <div style={surface}>
        <h3 style={{margin:'0 0 8px',fontSize:17}}>
          {editingAssessmentId?'Editar obligación determinada':'Registrar obligaciones patronales (DTRH / FUTA / CFSE)'}
        </h3>
        <p style={{fontSize:12,color:'#64748B',margin:'0 0 12px',lineHeight:1.5}}>
          Registra el importe determinado en la planilla de desempleo, aportación especial o
          notificación de la CFSE. En aportaciones trimestrales utiliza el mes de cierre del
          trimestre como referencia; para CFSE usa el mes inicial de la póliza y anota su
          período de cobertura. No se estima automáticamente una tasa sin la determinación.
        </p>
        <form onSubmit={saveAssessment}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:12}}>
            <div><label style={label}>Obligación patronal</label>
              <select required style={{...field,width:'100%'}} value={assessmentForm.category}
                onChange={e=>setAssessmentForm(x=>({...x,category:e.target.value}))}>
                {ASSESSMENT_CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
              </select></div>
            <div><label style={label}>Período de referencia</label>
              <input required type="month" style={{...field,width:'100%'}} value={assessmentForm.tax_period}
                onChange={e=>setAssessmentForm(x=>({...x,tax_period:e.target.value}))}/></div>
            <div><label style={label}>Importe determinado ($)</label>
              <input required type="number" min="0.01" step="0.01" style={{...field,width:'100%'}}
                value={assessmentForm.amount} onChange={e=>setAssessmentForm(x=>({...x,amount:e.target.value}))}/></div>
            <div><label style={label}>Fecha límite (opcional)</label>
              <input type="date" style={{...field,width:'100%'}} value={assessmentForm.due_date}
                onChange={e=>setAssessmentForm(x=>({...x,due_date:e.target.value}))}/></div>
            <div><label style={label}>Planilla, póliza o referencia</label>
              <input maxLength={250} style={{...field,width:'100%'}} value={assessmentForm.reference}
                onChange={e=>setAssessmentForm(x=>({...x,reference:e.target.value}))}/></div>
            <div><label style={label}>Notas</label>
              <input maxLength={1000} style={{...field,width:'100%'}} value={assessmentForm.notes}
                onChange={e=>setAssessmentForm(x=>({...x,notes:e.target.value}))}/></div>
          </div>
          <div style={{display:'flex',gap:8,marginTop:13}}>
            <button type="submit" disabled={assessmentBusy} style={{...btn,background:'#17365D',color:'#fff'}}>
              {assessmentBusy?'Guardando…':editingAssessmentId?'Actualizar obligación':'Guardar obligación'}</button>
            {editingAssessmentId&&<button type="button" style={btn} disabled={assessmentBusy} onClick={resetAssessment}>
              Cancelar</button>}
          </div>
        </form>
        {assessmentMessage&&<p role="status" style={{fontSize:12,color:assessmentMessage.startsWith('No se')||assessmentMessage.startsWith('Error')?'#B00020':'#0F6E56'}}>
          {assessmentMessage}</p>}
        <div style={{overflowX:'auto',marginTop:15}}>
          <table style={{borderCollapse:'collapse',width:'100%',fontSize:12.5}}>
            <thead><tr style={{background:'#F5F7FA'}}>
              {['Período','Concepto','Importe','Vencimiento','Referencia','Notas','Acciones'].map(x=>
                <th key={x} style={cell}>{x}</th>)}
            </tr></thead>
            <tbody>{visibleAssessments.map(row=><tr key={row.id}>
              <td style={cell}>{row.tax_period}</td><td style={cell}>{catLabel(row.category)}</td>
              <td style={cell}>{fmt(row.amount)}</td><td style={cell}>{row.due_date||'—'}</td>
              <td style={cell}>{row.reference||'—'}</td><td style={cell}>{row.notes||'—'}</td>
              <td style={{...cell,whiteSpace:'nowrap'}}>
                <button type="button" style={btn} disabled={assessmentBusy} onClick={()=>editAssessment(row)}>Editar</button>{' '}
                <button type="button" style={{...btn,color:'#B00020'}} disabled={assessmentBusy} onClick={()=>deleteAssessment(row)}>Eliminar</button>
              </td>
            </tr>)}</tbody>
          </table>
        </div>
        {!visibleAssessments.length&&<p style={{fontSize:12,color:'#64748B'}}>
          Todavía no hay obligaciones determinadas para el período seleccionado.</p>}
      </div>
      <div style={surface}>
        <h3 style={{margin:'0 0 8px',fontSize:17}}>{editingId?'Editar pago realizado':'Registrar pago realizado'}</h3>
        <form onSubmit={savePayment}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:12}}>
            <div><label style={label}>Tipo de retención</label>
              <select required style={{...field,width:'100%'}} value={form.category}
                onChange={e=>change('category',e.target.value)}>
                {RETENTION_CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
              </select></div>
            <div><label style={label}>Período que cubre (YYYY-MM)</label>
              <input required type="month" style={{...field,width:'100%'}} value={form.tax_period}
                onChange={e=>change('tax_period',e.target.value)}/></div>
            <div><label style={label}>Fecha de pago</label>
              <input required type="date" style={{...field,width:'100%'}} value={form.paid_date}
                onChange={e=>change('paid_date',e.target.value)}/></div>
            <div><label style={label}>Cantidad pagada ($)</label>
              <input required type="number" min="0.01" step="0.01" style={{...field,width:'100%'}}
                value={form.amount} onChange={e=>change('amount',e.target.value)}/></div>
            <div><label style={label}>Confirmación / Referencia</label>
              <input style={{...field,width:'100%'}} maxLength={250} placeholder="Número de confirmación"
                value={form.reference} onChange={e=>change('reference',e.target.value)}/></div>
            <div><label style={label}>Notas</label>
              <input style={{...field,width:'100%'}} maxLength={1000} placeholder="Agencia o detalles"
                value={form.notes} onChange={e=>change('notes',e.target.value)}/></div>
          </div>
          <div style={{display:'flex',gap:8,marginTop:14,flexWrap:'wrap'}}>
            <button type="submit" disabled={saving} style={{...btn,background:'#17365D',color:'#fff'}}>
              {saving?'Guardando…':editingId?'Actualizar pago':'Registrar pago'}</button>
            {editingId && <button type="button" disabled={saving} onClick={resetForm} style={btn}>Cancelar edición</button>}
          </div>
        </form>
        {message && <div role="status" style={{fontSize:12,color:message.startsWith('Error')||message.startsWith('No se')||message.startsWith('Verifica')?'#B00020':'#0F6E56',marginTop:10}}>{message}</div>}
      </div>
      <div style={surface}>
        <button style={{...btn,fontWeight:700}} onClick={()=>setShowHistory(x=>!x)}>
          {showHistory?'Ocultar':'Mostrar'} historial de pagos ({visiblePayments.length})
        </button>
        {showHistory && <>
          <div style={{overflowX:'auto',marginTop:10}}>
            <table style={{borderCollapse:'collapse',width:'100%',fontSize:12.5}}>
              <thead><tr style={{background:'#F5F7FA'}}>
                {['Fecha','Período','Retención','Pagado','Referencia','Notas','Acciones'].map(x=>
                  <th key={x} style={cell}>{x}</th>)}
              </tr></thead>
              <tbody>{visiblePayments.map(p=><tr key={p.id}>
                <td style={cell}>{p.paid_date}</td><td style={cell}>{p.tax_period}</td>
                <td style={cell}>{catLabel(p.category)}</td>
                <td style={cell}>{fmt(p.amount)}</td>
                <td style={cell}>{p.reference||'—'}</td><td style={cell}>{p.notes||'—'}</td>
                <td style={{...cell,whiteSpace:'nowrap'}}>
                  <button style={btn} disabled={saving} onClick={()=>startEdit(p)}>Editar</button>{' '}
                  <button style={{...btn,color:'#B00020'}} disabled={saving} onClick={()=>deletePayment(p)}>Eliminar</button>
                </td>
              </tr>)}</tbody>
            </table>
          </div>
          {visiblePayments.length===0 && <p style={{fontSize:13,color:'#64748B'}}>Todavía no hay pagos registrados para este filtro.</p>}
        </>}
      </div>
      <div style={{fontSize:12,color:'#64748B',lineHeight:1.5,marginBottom:14}}>
        <strong>Alcance y verificación:</strong> FICA patronal y SINOT patronal muestran cálculos de
        referencia basados en Payroll FINAL. Valida salarios sujetos, topes anuales,
        exenciones y aportación patronal real antes de radicar o pagar. Las obligaciones
        de desempleo y CFSE se registran según las planillas o pólizas oficiales.
        No se generan Journal Entries ni se aplican pagos a otro período automáticamente.
        Los pagos previamente contabilizados deben registrarse aquí para descontarlos del control.
        Las retenciones combinadas de empleados de Services se revisan para evitar duplicarlas con Payroll.
      </div>
    </>}
  </div>;
}
