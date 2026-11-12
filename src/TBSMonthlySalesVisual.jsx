import React from 'react';
import {BarChart,Bar,CartesianGrid,XAxis,YAxis,Tooltip,Legend,ResponsiveContainer,ReferenceLine,Cell} from 'recharts';

const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0);
const compact=n=>new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(Number(n)||0);
const percent=n=>n==null?'N/D':(n>0?'+':'')+n.toFixed(1)+'%';
const change=n=>n==null?'—':(n>0?'+':'')+money(n);
const series=[
 {key:'sales',name:'Ventas',fill:'#3C78AC'},
 {key:'expenses',name:'Gastos (incluye costo de ventas)',fill:'#D1A354'},
 {key:'netIncome',name:'Ganancia neta',fill:'#237B70'},
];

export default function TBSMonthlySalesVisual({data,from,to}){
 const rows=data?.rows||[];
 const chartRows=rows.map(row=>({
   ...row,
   label:row.label+(row.partialMonth?' *':''),
 }));
 const chartWidth=Math.max(620,rows.length*88);
 return <div>
  <p style={{fontSize:12,color:'#64748B'}}>
   Ventas, gastos (incluyendo costo de ventas) y ganancia neta por mes,
   según el Profit &amp; Loss del {from} al {to}. Cada columna es un mes
   y las barras descienden bajo cero cuando el resultado es negativo.
  </p>
  {rows.length===0?<p style={{fontSize:12,color:'#64748B'}}>No hay meses para mostrar.</p>:<>
   <div style={{border:'1px solid #DAE4ED',borderRadius:8,padding:'15px 12px',marginBottom:14}}>
    <strong style={{fontSize:14,color:'#17365D'}}>Resultados mensuales — barras verticales</strong>
    <div style={{overflowX:'auto',marginTop:12}}>
     <div style={{width:chartWidth,height:340,minWidth:'100%'}}>
      <ResponsiveContainer width="100%" height="100%">
       <BarChart data={chartRows} margin={{top:15,right:22,bottom:27,left:12}} barCategoryGap="14%" barGap={2}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5EDF3"/>
        <XAxis dataKey="label" tick={{fontSize:11,fill:'#52657A'}} interval={0} angle={rows.length>10?-35:0}
          textAnchor={rows.length>10?'end':'middle'} height={rows.length>10?60:40}/>
        <YAxis tick={{fontSize:10,fill:'#64748B'}} tickFormatter={compact} width={57}/>
        <Tooltip formatter={(v,name)=>[money(v),name]} labelFormatter={label=>'Mes: '+label}/>
        <Legend verticalAlign="top" height={34} wrapperStyle={{fontSize:11}}/>
        <ReferenceLine y={0} stroke="#52657A" strokeWidth={1.2}/>
        {series.map(item=><Bar key={item.key} dataKey={item.key} name={item.name}
          fill={item.fill} maxBarSize={24} isAnimationActive={false}>
          {chartRows.map((r,i)=><Cell key={r.month+'-'+item.key}
            fill={item.key==='netIncome'&&r.netIncome<0?'#B74B47':item.fill}/>)}
        </Bar>)}
       </BarChart>
      </ResponsiveContainer>
     </div>
    </div>
    <p style={{fontSize:11,color:'#64748B',margin:'5px 0 0'}}>
     Azul: ventas · Dorado: gastos · Verde: ganancia neta · Rojo: pérdida neta.
    </p>
   </div>
   <div style={{border:'1px solid #DAE4ED',borderRadius:8,padding:'15px 12px'}}>
    <strong style={{fontSize:14,color:'#17365D'}}>Tabla mensual de ventas, gastos y ganancia neta</strong>
    <div style={{overflowX:'auto',marginTop:12}}>
     <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
      <thead><tr style={{background:'#EDF3F8',color:'#17365D'}}>
       {['Mes','Ventas','Gastos (incl. COGS)','Ganancia neta','Cambio ventas $','Cambio ventas %'].map((h,i)=>
        <th key={h} style={{padding:'9px 7px',textAlign:i===0?'left':'right',whiteSpace:'nowrap'}}>{h}</th>)}
      </tr></thead>
      <tbody>{rows.map(row=><tr key={row.month} style={{borderBottom:'1px solid #E2E8F0'}}>
       <td style={{padding:'8px 7px',whiteSpace:'nowrap'}}>{row.label}{row.partialMonth?' *':''}</td>
       <td style={{padding:'8px 7px',textAlign:'right',whiteSpace:'nowrap'}}>{money(row.sales)}</td>
       <td style={{padding:'8px 7px',textAlign:'right',whiteSpace:'nowrap'}}>{money(row.expenses)}</td>
       <td style={{padding:'8px 7px',textAlign:'right',whiteSpace:'nowrap',color:row.netIncome<0?'#AA4038':'#17365D',fontWeight:700}}>{money(row.netIncome)}</td>
       <td style={{padding:'8px 7px',textAlign:'right',whiteSpace:'nowrap'}}>{change(row.change)}</td>
       <td style={{padding:'8px 7px',textAlign:'right',whiteSpace:'nowrap'}}>{percent(row.changePercent)}</td>
      </tr>)}</tbody>
      <tfoot><tr style={{background:'#EAF1F8',color:'#17365D',fontWeight:700}}>
       <td style={{padding:'9px 7px'}}>TOTAL</td>
       <td style={{padding:'9px 7px',textAlign:'right'}}>{money(data.totalSales)}</td>
       <td style={{padding:'9px 7px',textAlign:'right'}}>{money(data.totalExpenses)}</td>
       <td style={{padding:'9px 7px',textAlign:'right'}}>{money(data.totalNet)}</td>
       <td colSpan={2}></td>
      </tr></tfoot>
     </table>
    </div>
    <p style={{fontSize:11,color:'#64748B'}}>
     * Mes parcial: se incluyen solo los días dentro del período seleccionado.
     Cuando el mes previo tiene ventas cero o negativas, la variación porcentual se muestra N/D.
    </p>
   </div>
  </>}
 </div>;
}
