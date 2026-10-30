import React,{useMemo,useState} from 'react';
import {validPeriod,cents,asMoney} from './tbsRetentionLedger.js';
import {supabase} from './supabaseClient';
const fmt=n=>Number(n||0).toLocaleString('en-US',{style:'currency',currency:'USD'});
const now=()=>new Date().toISOString().slice(0,7);
const amounts=['gross_pay','fica_employee','fica_employer','sinot_employee','sinot_employer',
  'pr_tax','services_retention','planned_fica','planned_sinot','planned_pr','planned_services'];
const labels={
 gross_pay:'Gross Pay ($)',
 fica_employee:'FICA Employee (Seguro Social + Medicare)',
 fica_employer:'FICA Employer (Seguro Social + Medicare)',
 sinot_employee:'SINOT Employee',sinot_employer:'SINOT Employer',
 pr_tax:'PR Tax retenido',services_retention:'Retenciones Services',
 planned_fica:'FICA: cantidad que se pagará',
 planned_sinot:'SINOT: cantidad que se pagará',
 planned_pr:'PR Tax: cantidad que se pagará',
 planned_services:'Services: cantidad que se pagará',
};
const empty=()=>({tax_period:now(),mode:'reference',reference:'',notes:'',
  ...Object.fromEntries(amounts.map(k=>[k,'']))});
const field={boxSizing:'border-box',border:'1px solid #CBD5E1',borderRadius:5,
  padding:'8px',width:'100%',fontSize:12};
const btn={border:'1px solid #CBD5E1',background:'#fff',color:'#17365D',padding:'7px 11px',
  borderRadius:5,cursor:'pointer'};
const groupMap=[
 {key:'fica',label:'FICA',planned:'planned_fica',category:'fica_remittance',
  due:f=>Number(f.fica_employee||0)+Number(f.fica_employer||0)},
 {key:'sinot',label:'SINOT',planned:'planned_sinot',category:'sinot_remittance',
  due:f=>Number(f.sinot_employee||0)+Number(f.sinot_employer||0)},
 {key:'pr',label:'PR Tax',planned:'planned_pr',category:'payroll_pr',due:f=>Number(f.pr_tax||0)},
 {key:'services',label:'Services',planned:'planned_services',
  category:'services_remittance',due:f=>Number(f.services_retention||0)},
];
export default function TBSRetentionManualBases({
  clientId,entries,onChange,onPreparePayment,payrollRuns=[]
}){
  const [form,setForm]=useState(empty);
  const [editId,setEditId]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [expanded,setExpanded]=useState(false);
  const totalWithheld=useMemo(()=>[
    'fica_employee','fica_employer','sinot_employee','sinot_employer','pr_tax','services_retention'
  ].reduce((a,k)=>a+cents(form[k]),0),[form]);
  const totalPlanned=groupMap.reduce((a,g)=>a+cents(form[g.planned]),0);
  const totalOutstanding=Math.max(0,totalWithheld-totalPlanned);
  const change=(name,value)=>setForm(f=>({...f,[name]:value}));
  const reset=()=>{setEditId('');setForm(empty());setMessage('');};

  function edit(row){
    setExpanded(true);setEditId(row.id);
    setForm({...empty(),...row,...Object.fromEntries(amounts.map(k=>[k,String(row[k]||'')]))});
    setMessage('');
    document.getElementById('partial-retention-base')?.scrollIntoView({behavior:'smooth'});
  }
  async function save(e){
    e.preventDefault();if(busy)return;
    const payload={
      tax_period:form.tax_period,mode:form.mode,
      reference:form.reference.trim().slice(0,250),notes:form.notes.trim().slice(0,1000),
      ...Object.fromEntries(amounts.map(k=>[k:asMoney(cents(form[k]))])),
    };
    if(!validPeriod(payload.tax_period)||!['reference','additional'].includes(payload.mode)||
      amounts.some(k=>form[k]!==''&&(!Number.isFinite(Number(form[k]))||Number(form[k])<0))||
      amounts.every(k=>payload[k]===0)){
      setMessage('Ingresa el período y cantidades válidas. Se requiere al menos un importe.');
      return;
    }
    if(groupMap.some(g=>cents(payload[g.planned])>cents(g.due(payload)))){
      if(!window.confirm('El pago previsto excede las retenciones de esta base en uno o más conceptos. ¿Deseas continuar?'))return;
    }
    if(payload.mode==='additional'){
      const finalized=payrollRuns.some(r=>r.status==='FINAL'&&String(r.payDate||r.pay_date||'').slice(0,7)===payload.tax_period);
      const warning=finalized
        ? 'Ya existe Payroll FINAL en este período. SUMAR obligaciones podría duplicar retenciones.'
        : 'Se añadirán nuevas obligaciones al balance de retenciones de este período.';
      if(!window.confirm(warning+' ¿Confirmas?'))return;
    }
    if(!window.confirm((editId?'Actualizar':'Guardar')+' base de pago parcial de '+payload.tax_period+
      '? Los importes previstos NO son pagos realizados.'))return;
    setBusy(true);setMessage('');
    try{
      let row;
      if(editId){
        const {data,error}=await supabase.from('tbs_retention_manual_bases').update(payload)
          .eq('client_id',clientId).eq('id',editId).select('*').single();
        if(error)throw error;row=data;
        onChange(prev=>prev.map(x=>x.id===editId?row:x));
      }else{
        const {data:{user},error:authError}=await supabase.auth.getUser();
        if(authError||!user?.id)throw new Error('Sesión no disponible.');
        const {data,error}=await supabase.from('tbs_retention_manual_bases')
          .insert({...payload,client_id:clientId,created_by:user.id}).select('*').single();
        if(error)throw error;row=data;
        onChange(prev=>[row,...prev]);
      }
      reset();setMessage('Base guardada. Puedes registrar cada pago efectivo desde el historial de bases.');
    }catch(error){setMessage('No se guardó: '+(error?.message||String(error)));}
    finally{setBusy(false);}
  }
  async function remove(row){
    if(busy||!window.confirm('¿Eliminar esta base de pago de '+row.tax_period+
      '? No se eliminarán los pagos registrados por separado.'))return;
    setBusy(true);setMessage('');
    try{
      const {data,error}=await supabase.from('tbs_retention_manual_bases').delete()
        .eq('client_id',clientId).eq('id',row.id).select('id');
      if(error)throw error;
      if(!data?.length)throw new Error('La base no fue eliminada.');
      onChange(prev=>prev.filter(x=>x.id!==row.id));
      if(editId===row.id)reset();
      setMessage('Base eliminada; los pagos realizados se conservaron.');
    }catch(error){setMessage('Error al eliminar: '+error.message);}
    finally{setBusy(false);}
  }
  return <section id="partial-retention-base" style={{background:'#fff',border:'1px solid #DCE4EE',
    borderRadius:9,padding:16,marginBottom:16}}>
    <div style={{display:'flex',gap:12,justifyContent:'space-between',alignItems:'center',flexWrap:'wrap'}}>
      <div><h3 style={{margin:'0 0 4px',fontSize:17}}>Base de pago parcial: Gross Pay y retenciones</h3>
        <p style={{fontSize:12,color:'#64748B',margin:0,maxWidth:810,lineHeight:1.5}}>
          Introduce la nómina bruta y las retenciones a cubrir. Indica cuánto se podrá pagar
          ahora y conserva la diferencia para seguimiento. El pago previsto no se considera
          realizado hasta que lo registres con fecha y confirmación.
        </p></div>
      <button type="button" style={btn} onClick={()=>setExpanded(x=>!x)}>
        {expanded?'Ocultar formulario':'+ Nueva base de pago parcial'}</button>
    </div>
    {expanded&&<form onSubmit={save} style={{marginTop:16}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(225px,1fr))',gap:12}}>
        <label style={{fontSize:12}}>Período contributivo
          <input type="month" required style={field} value={form.tax_period}
            onChange={e=>change('tax_period',e.target.value)}/></label>
        <label style={{fontSize:12}}>Uso de esta entrada
          <select style={field} value={form.mode} onChange={e=>change('mode',e.target.value)}>
            <option value="reference">Base para planificar pago (sin duplicar obligaciones)</option>
            <option value="additional">Obligaciones adicionales no incluidas en Payroll</option>
          </select></label>
        {amounts.slice(0,7).map(key=><label key={key} style={{fontSize:12}}>{labels[key]}
          <input type="number" min="0" step="0.01" placeholder="0.00" style={field}
            value={form[key]} onChange={e=>change(key,e.target.value)}/></label>)}
      </div>
      <h4 style={{fontSize:14,margin:'18px 0 6px'}}>¿Cuánto se podrá pagar ahora?</h4>
      <p style={{fontSize:12,color:'#64748B',margin:'0 0 10px'}}>
        Son cantidades previstas. Cuando se realice el pago, registra el importe efectivo
        desde el botón de cada concepto en la tabla inferior.</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12}}>
        {amounts.slice(7).map(key=><label key={key} style={{fontSize:12}}>{labels[key]}
          <input type="number" min="0" step="0.01" placeholder="0.00" style={field}
            value={form[key]} onChange={e=>change(key,e.target.value)}/></label>)}
        <label style={{fontSize:12}}>Referencia
          <input maxLength={250} style={field} value={form.reference}
            onChange={e=>change('reference',e.target.value)}/></label>
        <label style={{fontSize:12}}>Notas
          <input maxLength={1000} style={field} value={form.notes}
            onChange={e=>change('notes',e.target.value)}/></label>
      </div>
      <div style={{display:'flex',gap:18,flexWrap:'wrap',background:'#F4F7FB',padding:12,
        borderRadius:6,margin:'14px 0',fontSize:13}}>
        <span>Retenciones de esta base: <strong>{fmt(asMoney(totalWithheld))}</strong></span>
        <span>Pago previsto: <strong>{fmt(asMoney(totalPlanned))}</strong></span>
        <span>Resta por cubrir: <strong>{fmt(asMoney(totalOutstanding))}</strong></span>
      </div>
      {form.mode==='additional'&&<p style={{fontSize:12,color:'#9A5C00'}}>
        Esta modalidad SUMA al Gross Pay y a los balances del período. Úsala solo cuando
        esos importes no estén ya incluidos en Payroll o Services FINAL.</p>}
      <div style={{display:'flex',gap:10}}>
        <button type="submit" disabled={busy} style={{...btn,background:'#17365D',color:'#fff'}}>
          {busy?'Guardando…':editId?'Actualizar base':'Guardar base de pago'}</button>
        {editId&&<button type="button" style={btn} disabled={busy} onClick={reset}>Cancelar edición</button>}
      </div>
    </form>}
    {message&&<p role="status" style={{fontSize:12,color:message.startsWith('Error')||message.startsWith('No se')?'#A00020':'#0F6E56'}}>{message}</p>}
    <div style={{overflowX:'auto',marginTop:16}}>
      <table style={{borderCollapse:'collapse',width:'100%',minWidth:890,fontSize:12}}>
        <thead><tr style={{background:'#F3F6FA'}}>
          {['Período','Modalidad','Gross Pay','Retenciones','Previsto','Por cubrir','Acciones'].map(t=>
            <th key={t} style={{padding:'9px 8px',borderBottom:'1px solid #CBD5E1',textAlign:'left'}}>{t}</th>)}
        </tr></thead>
        <tbody>{entries.map(row=>{
          const due=groupMap.reduce((a,g)=>a+cents(g.due(row)),0);
          const planned=groupMap.reduce((a,g)=>a+cents(row[g.planned]),0);
          return <tr key={row.id}>
            <td style={{padding:8,borderBottom:'1px solid #E2E8F0'}}>{row.tax_period}</td>
            <td style={{padding:8,borderBottom:'1px solid #E2E8F0'}}>{row.mode==='additional'?'Adicional':'Referencia de pago'}</td>
            <td style={{padding:8,borderBottom:'1px solid #E2E8F0'}}>{fmt(row.gross_pay)}</td>
            <td style={{padding:8,borderBottom:'1px solid #E2E8F0'}}>{fmt(asMoney(due))}</td>
            <td style={{padding:8,borderBottom:'1px solid #E2E8F0'}}>{fmt(asMoney(planned))}</td>
            <td style={{padding:8,borderBottom:'1px solid #E2E8F0'}}>{fmt(asMoney(Math.max(0,due-planned)))}</td>
            <td style={{padding:8,borderBottom:'1px solid #E2E8F0'}}>
              <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                <button type="button" disabled={busy} style={btn} onClick={()=>edit(row)}>Editar</button>
                <button type="button" disabled={busy} style={{...btn,color:'#B00020'}} onClick={()=>remove(row)}>Eliminar</button>
                {groupMap.filter(g=>cents(row[g.planned])>0).map(g=>
                  <button type="button" key={g.key} disabled={busy}
                    style={{...btn,background:'#EAF2FC'}} title={'Preparar pago efectivo de '+g.label}
                    onClick={()=>onPreparePayment({
                      category:g.category,tax_period:row.tax_period,
                      amount:asMoney(cents(row[g.planned])),
                      reference:row.reference||'',
                      notes:'Base manual '+row.tax_period+(row.notes?' · '+row.notes:''),
                    })}>Pagar {g.label}</button>)}
              </div>
            </td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {entries.length===0&&<p style={{fontSize:12,color:'#64748B',marginBottom:0}}>
      No existen bases de pago parcial registradas para este cliente.</p>}
  </section>;
}
