import React,{useMemo,useState} from 'react';
import {buildRetentionMatrix,filterMatrixRows,MATRIX_COLUMNS,CONTROL_GROUPS} from './tbsRetentionControlMatrix.js';
const cash=v=>Number(v||0).toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
const header={borderBottom:'1px solid #DCE3ED',padding:'8px 7px',whiteSpace:'nowrap',background:'#F2F5FA',textAlign:'right',minWidth:96};
const td={borderBottom:'1px solid #E7EBF0',padding:'9px 7px',whiteSpace:'nowrap',textAlign:'right',fontVariantNumeric:'tabular-nums'};
const input={border:'1px solid #CBD5E1',borderRadius:5,padding:'5px 6px',fontSize:11,background:'#fff'};
const groupColor={fica:'#EAF2FC',sinot:'#EBF6F3',pr:'#FFF5E8',services:'#F1EEFB',other:'#F2F4F6',gross:'#EFF2F7'};
const title={fontSize:17,fontWeight:700,color:'#1F2937'};
export default function TBSRetentionMatrix({services,payrollRuns,payrollLines,assessments,payments,onRecordPayment}){
 const [periodGrouping,setPeriodGrouping]=useState('month');
 const [selectedYear,setSelectedYear]=useState('all');
 const [visibleGroups,setVisibleGroups]=useState(['fica','sinot','pr','services','other']);
 const [filters,setFilters]=useState({});
 const [sort,setSort]=useState({key:'period',asc:false});
 const rows=useMemo(()=>buildRetentionMatrix({services,payrollRuns,payrollLines,assessments},payments,periodGrouping),
   [services,payrollRuns,payrollLines,assessments,payments,periodGrouping]);
 const years=useMemo(()=>[...new Set(rows.map(row=>row.period.slice(0,4)))].sort().reverse(),[rows]);
 const displayedRows=useMemo(()=>{
   const subset=filterMatrixRows(rows,filters).filter(r=>selectedYear==='all'||r.period.startsWith(selectedYear));
   return subset.sort((a,b)=>{
     const aValue=a[sort.key],bValue=b[sort.key];
     const delta=sort.key==='period'?String(aValue).localeCompare(String(bValue)):
       Number(aValue)-Number(bValue);
     return (sort.asc?1:-1)*delta;
   });
 },[rows,filters,selectedYear,sort]);
 const columns=MATRIX_COLUMNS.filter(col=>col.key==='gross'||visibleGroups.includes(col.group));
 const sum=key=>Math.round(displayedRows.reduce((total,r)=>total+Math.round(Number(r[key]||0)*100),0))/100;
 const buttonStyle={padding:'6px 10px',border:'1px solid #CBD5E1',borderRadius:5,background:'#fff',
   color:'#17365D',cursor:'pointer',fontSize:12};
 function exportVisibleCsv(){
   const quote=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
   const cols=['period',...columns.map(c=>c.key)];
   const content=[['Período',...columns.map(c=>c.group.toUpperCase()+' · '+c.label)],
     ...displayedRows.map(r=>cols.map(key=>r[key]??0)),
     ['Totales visibles',...columns.map(c=>sum(c.key))]]
     .map(row=>row.map(quote).join(',')).join('\\r\\n');
   const file=new Blob(['\\uFEFF'+content],{type:'text/csv;charset=utf-8'});
   const url=URL.createObjectURL(file);
   const a=document.createElement('a');
   a.href=url;a.download='Control_Retenciones_'+periodGrouping+'.csv';
   document.body.appendChild(a);a.click();a.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
  const selectField=(name,value,setter,options)=><label style={{display:'grid',gap:4,fontSize:12,color:'#475569'}}>
   {name}<select style={input} value={value} onChange={e=>setter(e.target.value)}>
     {options.map(([val,label])=><option key={val} value={val}>{label}</option>)}
   </select></label>;
 const changeSort=key=>setSort(prev=>({key,asc:key===prev.key?!prev.asc:false}));
 return <section style={{border:'1px solid #E2E5E9',borderRadius:9,padding:16,background:'#fff',marginBottom:16}}>
   <div style={{display:'flex',alignItems:'start',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:12}}>
     <div>
       <h3 style={{...title,margin:'0 0 5px'}}>Matriz de obligaciones y pagos</h3>
       <p style={{fontSize:12,color:'#64748B',margin:0,maxWidth:760,lineHeight:1.5}}>
         Gross Pay de Payroll FINAL; FICA = Seguro Social + Medicare. SINOT se presenta por separado.
         Cada obligación muestra pagos aplicados al período y saldo pendiente.
       </p>
     </div>
     <div style={{display:'flex',gap:10,alignItems:'end',flexWrap:'wrap'}}>
       {selectField('Agrupar',periodGrouping,v=>{setPeriodGrouping(v);setFilters({});},[
         ['month','Mensual'],['quarter','Trimestral'],['year','Anual']])}
       {selectField('Año',selectedYear,setSelectedYear,[['all','Todos'],...years.map(y=>[y,y])])}
              <button type="button" style={buttonStyle} onClick={()=>{setFilters({});setSelectedYear('all');setVisibleGroups(['fica','sinot','pr','services','other']);setSort({key:'period',asc:false});}}>
         Restablecer filtros</button>
       <button type="button" style={buttonStyle} onClick={exportVisibleCsv}>Exportar matriz CSV</button>
     </div>
   </div>
   <div style={{display:'flex',gap:14,flexWrap:'wrap',marginBottom:14,alignItems:'center'}}>
     <span style={{fontSize:12,color:'#475569',fontWeight:600}}>Columnas visibles:</span>
     {CONTROL_GROUPS.map(g=><label key={g.id} style={{fontSize:12,display:'flex',alignItems:'center',gap:5,cursor:'pointer'}}>
       <input type="checkbox" checked={visibleGroups.includes(g.id)}
         onChange={e=>setVisibleGroups(prev=>e.target.checked?[...prev,g.id]:prev.filter(x=>x!==g.id))}/>
       {g.label}
     </label>)}
   </div>
   <div style={{overflowX:'auto',border:'1px solid #E2E8F0',borderRadius:7}}>
     <table style={{borderCollapse:'separate',borderSpacing:0,whiteSpace:'nowrap',fontSize:12,width:'max-content',minWidth:'100%'}}>
       <thead>
         <tr>
           <th rowSpan={2} style={{...header,textAlign:'left',position:'sticky',left:0,zIndex:3,minWidth:100,background:'#F2F5FA'}}>
             <button type="button" onClick={()=>changeSort('period')} title="Ordenar períodos" style={{border:0,background:'transparent',fontWeight:700,cursor:'pointer'}}>
               Período {sort.key==='period'?(sort.asc?'▲':'▼'):'↕'}
             </button>
           </th>
           <th colSpan={1} style={{...header,background:groupColor.gross,textAlign:'center'}}>Nómina</th>
           {CONTROL_GROUPS.filter(g=>visibleGroups.includes(g.id)).map(g=>
             <th key={g.id} colSpan={g.parts.length} style={{...header,background:groupColor[g.id],textAlign:'center'}}>
               {g.label}
             </th>)}
           <th rowSpan={2} style={{...header,minWidth:80,textAlign:'center'}}>Registrar pago</th>
         </tr>
         <tr>{columns.map(c=><th key={c.key} style={{...header,background:groupColor[c.group],verticalAlign:'top'}}>
           <button type="button" title="Ordenar por esta columna" onClick={()=>changeSort(c.key)}
             style={{display:'block',marginLeft:'auto',background:'transparent',border:0,fontWeight:700,
               cursor:'pointer',color:'#25354D',fontSize:11}}>
             {c.label} {sort.key===c.key?(sort.asc?'▲':'▼'):'↕'}
           </button>
           <select aria-label={'Filtrar '+c.key} value={filters[c.key]||'all'}
             onChange={e=>setFilters(f=>({...f,[c.key]:e.target.value}))}
             style={{...input,display:'block',width:93,marginLeft:'auto',marginTop:5}}>
             <option value="all">Todos</option>
             <option value="positive">Mayor que 0</option>
             <option value="zero">Igual a 0</option>
           </select>
         </th>)}</tr>
       </thead>
       <tbody>{displayedRows.map(r=><tr key={r.period}>
         <td style={{...td,textAlign:'left',position:'sticky',left:0,zIndex:2,background:'#fff',fontWeight:700}}>{r.period}</td>
         {columns.map(c=><td key={c.key} style={{...td,background:c.key.endsWith('_pending')&&r[c.key]>0?'#FFF8E7':'#fff',
           color:c.key.endsWith('_pending')&&r[c.key]>0?'#A16207':'#334155'}}>
           {cash(r[c.key])}</td>)}
         <td style={{...td,textAlign:'center'}}>
           <button type="button" style={{...buttonStyle,opacity:periodGrouping==='month'?1:0.6}}
             disabled={periodGrouping!=='month'} title={periodGrouping==='month'?'Registrar pago de este mes':'Cambia a vista mensual para registrar un pago de un período específico'}
             onClick={()=>onRecordPayment?.(r.period)}>+ Pago</button>
         </td>
       </tr>)}
       <tr style={{background:'#EDF2F9',fontWeight:700}}>
         <td style={{...td,textAlign:'left',position:'sticky',left:0,background:'#EDF2F9'}}>Totales visibles</td>
         {columns.map(c=><td key={c.key} style={td}>{cash(sum(c.key))}</td>)}
         <td style={td}>{displayedRows.length} períodos</td>
       </tr></tbody>
     </table>
   </div>
   {displayedRows.length===0&&<p style={{fontSize:12,color:'#64748B'}}>No hay datos para estos filtros.</p>}
   <p style={{fontSize:11.5,color:'#64748B',margin:'10px 0 0',lineHeight:1.5}}>
     Los saldos trimestrales/anuales son la suma de los saldos de sus meses, sin aplicar automáticamente
     créditos de un mes a otro. Para registrar un pago, selecciona el período en vista mensual.
     Las contribuciones estimadas deben cotejarse con salarios sujetos y planillas oficiales.
   </p>
 </section>;
}
