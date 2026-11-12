import {jsPDF} from 'jspdf';
import {assertNonblankPdfPages} from './tbsRegisterPdf.js';
import {includeExecutiveSection,simpleExecutiveSummary} from './tbsExecutiveSections.js';

// One native, paginated PDF is used for both download and email. Never send
// the printable HTML window: PDF bytes are validated before accepting an email.
const fmt=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
const money=x=>x===null||x===undefined?'N/D':fmt.format(Number(x)||0);
const pct=x=>x===null||x===undefined?'N/D':Number(x).toFixed(1)+'%';
export const metricDisplay=(key,value)=>key.includes('margin')?pct(value):money(value);
const normalize=v=>String(v??'').replace(/[–—]/g,'-').replace(/[•]/g,'-').replace(/\s+/g,' ').trim();
const navy=[23,54,93],grey=[94,108,126],light=[235,242,249],orange=[148,84,16];
export function executivePdfFilename(payload){
 const client=String(payload.businessName||'Cliente').normalize('NFKD')
  .replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'_').slice(0,48);
 return 'Reporte_Ejecutivo_'+client+'_'+payload.from+'_a_'+payload.to+'.pdf';
}
export function createExecutivePdf(payload){
 const doc=new jsPDF({unit:'pt',format:'letter',compress:false});
 const w=doc.internal.pageSize.getWidth(),h=doc.internal.pageSize.getHeight();
 const left=42,right=w-42,maxW=right-left,bottom=h-54;
 let y=40;
 function font(size=10,bold=false,color=navy){
  doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(...color);
 }
 function page(){
  doc.addPage();y=40;
  font(9,true);doc.text('TWELVE BUSINESS STRATEGIES LLC',left,y);
  font(8,false,grey);doc.text('Reporte Financiero Ejecutivo',right,y,{align:'right'});
  y+=9;doc.setDrawColor(194,209,223);doc.line(left,y,right,y);y+=19;
 }
 function ensure(height=20){if(y+height>bottom)page();}
 function text(value,{size=9.5,bold=false,color=navy,indent=0,after=8}={}){
  const val=normalize(value);
  if(!val)return;
  font(size,bold,color);
  const lines=doc.splitTextToSize(val,maxW-indent);
  const lead=size*1.36;
  for(const line of lines){
   ensure(lead+2);font(size,bold,color);doc.text(line,left+indent,y);y+=lead;
  }
  y+=after;
 }
 function heading(value){
  ensure(41);y+=5;font(12,true);doc.text(normalize(value),left,y);y+=7;
  doc.setDrawColor(211,224,236);doc.line(left,y,right,y);y+=17;
 }
 function items(lines=[]){
  if(!lines?.length){text('Sin observaciones adicionales respaldadas por la informacion disponible.',{size:9,color:grey});return;}
  for(const item of lines)text('- '+item,{size:9.2,color:[43,57,76],indent:7,after:7});
 }
 function table(headers,rows,widths=null){
  const columns=headers.length;
  const defaultW=maxW/columns;
  const colWidths=widths||Array(columns).fill(defaultW);
  if(Math.abs(colWidths.reduce((a,b)=>a+b,0)-maxW)>2)
   throw Error('Column widths must total the available PDF page width.');
  function row(cells,header=false){
   font(header?8:8.5,header);
   const wrap=cells.map((value,i)=>doc.splitTextToSize(normalize(value),colWidths[i]-10));
   const maxLines=Math.max(1,...wrap.map(lines=>lines.length));
   const lineH=11.4, rowH=10+maxLines*lineH;
   ensure(rowH+2);
   if(header){doc.setFillColor(...navy);doc.rect(left,y,maxW,rowH,'F');}
   else if(Math.round(y)%2){doc.setFillColor(247,249,251);doc.rect(left,y,maxW,rowH,'F');}
   let x=left;
   wrap.forEach((lineGroup,i)=>{
    font(header?8:8.2,header,header?[255,255,255]:[39,52,71]);
    lineGroup.forEach((str,j)=>doc.text(str,x+5,y+14+j*lineH));
    x+=colWidths[i];
   });
   y+=rowH;
   doc.setDrawColor(219,226,234);doc.line(left,y,right,y);
  }
  ensure(35);row(headers,true);
  for(const cells of rows)row(cells);
  y+=12;
 }
 function bars(title,entries){
  heading(title);
  ensure(210);
  const chartTop=y+11,chartHeight=142,baseX=left+38,chartWidth=maxW-43;
  const vals=entries.map(e=>Number(e.value)||0),top=Math.max(0,...vals),bot=Math.min(0,...vals);
  const high=top===bot?top+1:top,low=top===bot?bot-1:bot;
  const yFor=n=>chartTop+(high-n)/(high-low)*chartHeight;
  doc.setDrawColor(220,230,239);
  for(let k=0;k<=4;k++){
    const yy=chartTop+chartHeight*k/4;
    doc.line(baseX,yy,baseX+chartWidth,yy);
  }
  const baseline=yFor(0);
  doc.setDrawColor(75,94,112);doc.line(baseX,baseline,baseX+chartWidth,baseline);
  const slot=chartWidth/entries.length;
  for(let i=0;i<entries.length;i++){
    const entry=entries[i],value=vals[i],py=yFor(value);
    const bw=Math.min(53,slot*.55),x=baseX+(i+.5)*slot-bw/2;
    doc.setFillColor(...(value<0?[183,75,71]:i===0?[60,120,172]:i===1?[209,163,84]:[35,123,112]));
    if(value!==0)doc.rect(x,Math.min(py,baseline),bw,Math.max(.6,Math.abs(py-baseline)),'F');
    font(8,false,grey);doc.text(normalize(entry.label).slice(0,22),baseX+(i+.5)*slot,chartTop+chartHeight+16,{align:'center'});
    font(8,true);doc.text(money(value),baseX+(i+.5)*slot,chartTop+chartHeight+27,{align:'center'});
  }
  y=chartTop+chartHeight+43;
 }
 function writeSection(title,content){heading(title);items(content);}
 font(9,true);doc.text('TWELVE BUSINESS STRATEGIES LLC',left,y);
 y+=24;font(21,true);doc.text('Reporte Financiero Ejecutivo',left,y);y+=19;
 text(payload.businessName,{size:13,bold:true,after:4});
 text('Periodo principal: '+payload.from+' al '+payload.to,{size:10,color:grey,after:4});
 text('Industria: '+payload.industryLabel,{size:9,color:grey,after:10});
 const f=payload.financials||{},m=payload.metricValues||{},n=payload.narrative||{},notes=payload.notes||{};
 const include=key=>includeExecutiveSection(payload,key);
 const problems=[];
 if(Math.abs(f.balanceDifference||0)>=.01)problems.push('Balance Sheet: diferencia '+money(f.balanceDifference));
 if(f.reconciliationAlerts>0)problems.push(f.reconciliationAlerts+' conciliaciones con advertencias');
 if(f.arMismatch)problems.push('Diferencia del mayor A/R contra submayor');
 if(f.uncategorizedCount>0)problems.push(f.uncategorizedCount+' transacciones sin categorizar');
 if(include('summary')){
  heading('Resumen ejecutivo - en palabras sencillas');
  simpleExecutiveSummary(f,m).forEach(p=>text(p,{size:10}));
 }
 // Accounting validation warnings cannot be suppressed by section selection.
 text(problems.length?'Datos preliminares: '+problems.join('; ')+'.':'No se identificaron alertas especificas en esta vista; esto no certifica una auditoria.',{
  size:9,color:problems.length?orange:grey,
 });
 if(include('indicators')){
  heading('Indicadores financieros seleccionados');
  table(['Indicador','Resultado','Que significa'],(payload.metrics||[]).map(x=>
   [x.label,metricDisplay(x.key,m[x.key]),x.meaning]),[140,106,maxW-246]);
 }

 if(include('comparison')&&(payload.monthlyRows||[]).length>=2){
  heading('Comparacion mes a mes - meses seleccionados');
  text(payload.monthlyRows.map(r=>r.label).join('  |  '),{size:8.5,color:grey});
  const months=payload.monthlyRows;
  // PDF tables are partitioned into groups of up to four months for readability.
  for(let offset=0;offset<months.length;offset+=4){
    const segment=months.slice(offset,offset+4);
    const colWidth=(maxW-125)/segment.length;
    const monthKeys=new Set(segment.map(v=>v.month));
    const rows=(payload.monthlyKpis||[]).map(k=>{
     const values=segment.map(month=>{
      const i=months.findIndex(row=>row.month===month.month);
      const current=k.values[i];
      const change=k.changes[i];
      const diff=change&&change.delta!==null?
       (change.changePoints!==null?change.changePoints.toFixed(2)+' pp':
        (change.changePercent!==null?change.changePercent.toFixed(1)+'%':'N/D')):'-';
      return metricDisplay(k.key,current)+(i===0?'':' / '+diff);
     });
     return [k.label,...values];
    });
    table(['Indicador',...segment.map(r=>r.label)],rows,[125,...Array(segment.length).fill(colWidth)]);
  }
  text('Cada celda presenta el valor del mes y, despues de /, la variacion frente al mes anterior seleccionado. Los saldos patrimoniales corresponden al cierre de cada mes.',{size:8,color:grey});
  writeSection('Hallazgos mes a mes',payload.monthlyFindings||[]);
 }else if(include('comparison')&&payload.comparisonPeriod&&payload.comparison?.length){
  heading('Comparacion con el periodo seleccionado');
  text(payload.comparisonPeriod.from+' al '+payload.comparisonPeriod.to,{size:9,color:grey});
  table(['Indicador','Comparado','Principal','Cambio'],payload.comparison.map(r=>[
    r.label,metricDisplay(r.key,r.prior),metricDisplay(r.key,r.current),
    r.delta===null?'N/D':r.changePoints!==null?r.changePoints.toFixed(2)+' pp':
     r.changePercent!==null?r.changePercent.toFixed(1)+'%':money(r.delta),
  ]),[180,115,115,maxW-410]);
 }
 if(include('monthlySales')&&Array.isArray(payload.monthlySalesRows)&&payload.monthlySalesRows.length){
  const months=payload.monthlySalesRows;
  const palette=[[60,120,172],[209,163,84],[35,123,112]];
  heading('Ventas, gastos y ganancia neta - barras verticales por mes');
  for(let start=0;start<months.length;start+=6){
    const group=months.slice(start,start+6);
    ensure(295);
    const names=['Ventas','Gastos','Ganancia neta'];
    const fields=['sales','expenses','netIncome'];
    let lx=left;
    for(let k=0;k<names.length;k++){
      doc.setFillColor(...palette[k]);doc.rect(lx,y-8,9,9,'F');
      font(8,false,grey);doc.text(names[k],lx+13,y);
      lx+=k===2?92:k===1?96:80;
    }
    y+=19;
    const plotTop=y+18,plotH=176;
    const plotX=left+48,plotW=maxW-59;
    const values=group.flatMap(row=>fields.map(key=>Number(row[key])||0));
    const upper=Math.max(0,...values),lower=Math.min(0,...values);
    const hi=upper===lower?upper+1:upper,lo=upper===lower?lower-1:lower;
    const scale=v=>plotTop+(hi-v)/(hi-lo)*plotH;
    doc.setDrawColor(222,229,236);
    for(let k=0;k<=4;k++){
      const yy=plotTop+k*plotH/4;
      doc.line(plotX,yy,plotX+plotW,yy);
      const tick=hi-(hi-lo)*k/4;
      font(7,false,grey);
      doc.text(tick.toLocaleString('en-US',{notation:'compact',maximumFractionDigits:1}),plotX-5,yy+2,{align:'right'});
    }
    const zero=scale(0);
    doc.setDrawColor(90,104,119);doc.line(plotX,zero,plotX+plotW,zero);
    const slotW=plotW/group.length,barW=Math.min(17,(slotW-12)/3);
    for(let i=0;i<group.length;i++){
      const row=group[i],center=plotX+(i+.5)*slotW;
      for(let k=0;k<3;k++){
        const v=Number(row[fields[k]])||0,py=scale(v);
        const x=center+(k-1.5)*barW+2;
        doc.setFillColor(...(k===2&&v<0?[183,75,71]:palette[k]));
        if(Math.abs(v)>0)doc.rect(x,Math.min(py,zero),Math.max(2,barW-2),Math.max(.7,Math.abs(py-zero)),'F');
      }
      font(7.5,false,grey);
      doc.text(String(row.label)+(row.partialMonth?' *':''),center,plotTop+plotH+14,{align:'center'});
    }
    y=plotTop+plotH+36;
    if(start+group.length<months.length)text('Continuacion de las barras mensuales en el siguiente bloque.',{size:8,color:grey});
  }
  heading('Tabla mensual de ventas, gastos y ganancia neta');
  const tableRows=months.map(row=>[
    row.label+(row.partialMonth?' *':''),money(row.sales),money(row.expenses),
    money(row.netIncome),
    row.changePercent===null?'N/D':(row.changePercent>0?'+':'')+row.changePercent.toFixed(1)+'%',
  ]);
  tableRows.push(['TOTAL',money(payload.monthlySalesTotal),money(payload.monthlyExpenseTotal),money(payload.monthlyNetTotal),'-']);
  table(['Mes','Ventas','Gastos','Neto','Cambio ventas'],tableRows,[88,103,103,103,maxW-397]);
  if(months.some(row=>row.partialMonth))text('* Mes parcial: solo los dias dentro del periodo seleccionado.',{size:8,color:grey});
  text('Gastos incluye costo de ventas. Las barras bajo cero representan saldos negativos; rojo significa perdida neta. El cambio en ventas es N/D cuando la base es cero o negativa.',{size:8,color:grey});
 }
 if(include('charts')){
 bars('Ventas, gastos y ganancia neta',[
  {label:'Ventas',value:m.revenue},{label:'Gastos',value:m.expenses},{label:'Ganancia neta',value:m.net_income},
 ]);
 bars('Principales balances al cierre',[
  {label:'Efectivo',value:m.cash},{label:'Cuentas por cobrar',value:m.receivables},{label:'Pasivos',value:m.liabilities},
 ]);
 }
 if(include('topExpenses')&&payload.topExpenses?.rows?.length){
  heading('Cinco gastos principales del periodo');
  const focus=payload.topExpenses;
  table(['Cuenta de gasto','Importe','% de gastos'],focus.rows.map(item=>[
    (item.code?item.code+' - ':'')+item.name+(item.isCogs?' (COGS)':''),
    money(item.amount),item.percent===null?'N/D':item.percent.toFixed(1)+'%',
  ]),[maxW-190,100,90]);
  writeSection('Hallazgos de gastos principales',focus.findings);
 }
 if(include('findings'))writeSection('Hallazgos',n.findings);
 if(include('opportunities'))writeSection('Oportunidades',n.opportunities);
 if(include('risks'))writeSection('Amenazas y riesgos',n.risks);
 if(include('market')){
 heading('Mercado e industria - informacion para verificar');
 text('Oportunidad: '+(n.sectorOpportunities||'Por evaluar.'));
 text('Amenaza: '+(n.sectorThreats||'Por evaluar.'));
 text('Contexto informado por la gerencia: '+(notes.marketContext||'Sin observaciones adicionales.'));
 text('Fuente: '+(notes.marketSource||'No informada')+(notes.marketSourceDate?', fecha '+notes.marketSourceDate:'')+'.',{size:8.5,color:grey});
 text('Los puntos sectoriales no constituyen hechos de mercado verificados automaticamente.',{size:8.5,color:grey});
 }
 if(include('shortTerm'))writeSection('Estrategias a corto plazo (0-90 dias)',n.shortTerm);
 if(include('mediumTerm'))writeSection('Estrategias a mediano plazo (3-12 meses)',n.mediumTerm);
 if(include('questions'))writeSection('Preguntas para conversar con el dueno del negocio',n.questions);
 if(include('meetingNotes')){
 heading('Notas y decisiones de la reunion');
 text(notes.ownerDiscussion||'Pendiente de documentar.');
 text('Acuerdos, responsables y fechas: '+(notes.agreements||'Pendiente de documentar.'));
 text('Proxima revision: '+(notes.followupDate||'Por definir'));
 }
 const pages=doc.getNumberOfPages();
 for(let p=1;p<=pages;p++){
  doc.setPage(p);doc.setDrawColor(211,221,231);doc.line(left,h-42,right,h-42);
  font(7,false,grey);doc.text('TBS Accounting Engine | Informe gerencial - no auditado',left,h-27);
  doc.text('Pagina '+p+' de '+pages,right,h-27,{align:'right'});
 }
 return assertNonblankPdfPages(doc);
}
export function executivePdfBlob(payload){
 const doc=createExecutivePdf(payload);
 const blob=doc.output('blob');
 if(blob.size<1600)throw Error('Se detecto un PDF vacio; el envio fue cancelado.');
 return blob;
}
export function blobToPdfBase64(blob){
 return new Promise((resolve,reject)=>{
  const r=new FileReader();r.onerror=()=>reject(new Error('No se pudo leer el PDF.'));
  r.onload=()=>resolve(String(r.result||'').split(',')[1]||'');
  r.readAsDataURL(blob);
 });
}
