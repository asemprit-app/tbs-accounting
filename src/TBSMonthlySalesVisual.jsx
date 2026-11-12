import React from 'react';

const formatter=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
const money=value=>formatter.format(Number(value)||0);
const changeAmount=value=>value===null?'—':(value>0?'+':'')+money(value);
const changePercent=value=>value===null?'N/D':(value>0?'+':'')+Number(value).toFixed(1)+'%';

export default function TBSMonthlySalesVisual({data,from,to}){
 const rows=data?.rows||[];
 const max=Math.max(1,...rows.map(r=>Math.abs(Number(r.sales)||0)));
 const hasNegative=rows.some(r=>r.sales<0);
 return <div>
  <p style={{fontSize:12,color:'#64748B'}}>
   Ventas registradas entre {from} y {to}, agrupadas por mes.
   Los importes siguen el cálculo de ventas del Profit &amp; Loss, incluyendo
   solamente los días seleccionados cuando el mes está incompleto.
  </p>
  {rows.length===0?<p style={{color:'#64748B'}}>No hay meses disponibles para mostrar.</p>:
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(285px,1fr))',gap:14,alignItems:'start'}}>
    <div style={{border:'1px solid #DEE8F1',borderRadius:8,padding:14}}>
     <strong style={{fontSize:13,color:'#17365D'}}>Gráfica de ventas mensuales</strong>
     <div role="img" aria-label="Gráfica de barras de ventas mensuales" style={{marginTop:14,maxHeight:425,overflowY:'auto'}}>
      {rows.map(row=>{
       const width=Math.max(0,Math.min(100,Math.abs(row.sales)/max*100));
       return <div key={row.month} style={{display:'grid',gridTemplateColumns:'79px minmax(70px,1fr) 95px',
         gap:6,alignItems:'center',marginBottom:10,fontSize:11}}>
        <span>{row.label}{row.partialMonth?' *':''}</span>
        <div style={{height:13,background:'#EDF2F6',borderRadius:3,overflow:'hidden',
          display:'flex',justifyContent:hasNegative&&row.sales<0?'flex-end':'flex-start'}}>
         <div style={{height:'100%',width:width+'%',background:row.sales<0?'#AE5B50':'#4778AA'}}/>
        </div>
        <strong style={{textAlign:'right',whiteSpace:'nowrap'}}>{money(row.sales)}</strong>
       </div>;
      })}
     </div>
     {hasNegative&&<p style={{fontSize:10,color:'#64748B'}}>Las barras rojas indican ventas netas negativas.</p>}
    </div>
    <div style={{border:'1px solid #DEE8F1',borderRadius:8,padding:14,minWidth:0}}>
     <strong style={{fontSize:13,color:'#17365D'}}>Tabla de ventas mensuales</strong>
     <div style={{overflowX:'auto',marginTop:10}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
       <thead><tr style={{background:'#EDF3F8',color:'#17365D'}}>
        {['Mes','Ventas','Cambio monetario','Variación %'].map(label=>
         <th key={label} style={{padding:'8px 5px',textAlign:label==='Mes'?'left':'right',whiteSpace:'nowrap'}}>{label}</th>)}
       </tr></thead>
       <tbody>{rows.map(row=><tr key={row.month} style={{borderBottom:'1px solid #E2E8F0'}}>
        <td style={{padding:'8px 5px',whiteSpace:'nowrap'}}>{row.label}{row.partialMonth?' *':''}</td>
        <td style={{padding:'8px 5px',textAlign:'right',whiteSpace:'nowrap'}}>{money(row.sales)}</td>
        <td style={{padding:'8px 5px',textAlign:'right',whiteSpace:'nowrap'}}>{changeAmount(row.change)}</td>
        <td style={{padding:'8px 5px',textAlign:'right',whiteSpace:'nowrap'}}>{changePercent(row.changePercent)}</td>
       </tr>)}</tbody>
       <tfoot><tr style={{background:'#EAF1F8',fontWeight:700,color:'#17365D'}}>
        <td style={{padding:'9px 5px'}}>Total</td>
        <td style={{padding:'9px 5px',textAlign:'right',whiteSpace:'nowrap'}}>{money(data.totalSales)}</td>
        <td colSpan={2}></td>
       </tr></tfoot>
      </table>
     </div>
     <p style={{fontSize:10,color:'#64748B',marginBottom:0}}>
      * Mes parcial. La variación porcentual figura como N/D cuando el mes anterior tiene ventas cero o negativas.
      Los totales corresponden únicamente al período principal seleccionado.
     </p>
    </div>
   </div>}
 </div>;
}
