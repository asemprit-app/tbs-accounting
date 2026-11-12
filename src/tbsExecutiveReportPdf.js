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
  const max=Math.max(1,...entries.map(item=>Math.max(0,Number(item.value)||0)));
  for(const item of entries){
   ensure(39);
   text(item.label,{size:8.5,after:2});
   const width=Math.max(0,Math.min(1,(Number(item.value)||0)/max))*maxW*.68;
   doc.setFillColor(231,238,244);doc.rect(left,y,maxW*.7,9,'F');
   doc.setFillColor(71,112,157);if(width>0)doc.rect(left,y,width,9,'F');
   font(8,true);doc.text(money(item.value),right,y+8,{align:'right'});
   y+=21;
  }
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
 if(include('monthlySales')&&(payload.monthlySalesRows||[]).length){
  const rows=payload.monthlySalesRows;
  heading('Ventas mensuales - grafica de barras');
  const maxSales=Math.max(1,...rows.map(r=>Math.abs(Number(r.sales)||0)));
  for(const row of rows){
   ensure(32);
   const label=row.label+(row.partialMonth?' *':'');
   font(8.5,true);doc.text(normalize(label),left,y);y+=10;
   doc.setFillColor(232,239,246);doc.rect(left,y,maxW*.73,10,'F');
   const width=Math.min(1,Math.abs(Number(row.sales)||0)/maxSales)*maxW*.73;
   if(width>0){
    doc.setFillColor(...(row.sales<0?[173,76,66]:[61,110,162]));
    doc.rect(left,y,width,10,'F');
   }
   font(8,false);doc.text(money(row.sales),right,y+9,{align:'right'});y+=20;
  }
  heading('Tabla de ventas mensuales');
  const tableRows=rows.map(r=>[
   r.label+(r.partialMonth?' *':''),
   money(r.sales),
   r.change===null?'-':(r.change>0?'+':'')+money(r.change),
   r.changePercent===null?'N/D':(r.changePercent>0?'+':'')+r.changePercent.toFixed(1)+'%',
  ]);
  tableRows.push(['TOTAL',money(payload.monthlySalesTotal),'-','-']);
  table(['Mes','Ventas','Cambio 
  {label:'Ventas',value:m.revenue},{label:'Gastos',value:m.expenses},{label:'Ganancia neta',value:m.net_income},
 ]);
 bars('Principales balances al cierre',[
  {label:'Efectivo',value:m.cash},{label:'Cuentas por cobrar',value:m.receivables},{label:'Pasivos',value:m.liabilities},
 ]);
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
,'Cambio %'],tableRows,[130,137,126,maxW-393]);
  if(rows.some(r=>r.partialMonth))text('* Mes parcial: solo los dias incluidos en el periodo seleccionado.',{size:8,color:grey});
  text('La variacion % no se calcula cuando el mes anterior tiene ventas cero o negativas. Las barras rojas representan ventas netas negativas.',{size:8,color:grey});
 }
 if(include('charts')){
 bars('Ventas, gastos y ganancia neta',[
  {label:'Ventas',value:m.revenue},{label:'Gastos',value:m.expenses},{label:'Ganancia neta',value:m.net_income},
 ]);
 bars('Principales balances al cierre',[
  {label:'Efectivo',value:m.cash},{label:'Cuentas por cobrar',value:m.receivables},{label:'Pasivos',value:m.liabilities},
 ]);
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
