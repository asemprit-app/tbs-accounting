// True editable Office Open XML (.docx), not HTML renamed with a Word extension.
// Loaded on demand so accounting pages do not download the Word library.
import {metricDisplay,executivePdfFilename} from './tbsExecutiveReportPdf.js';
const str=v=>String(v??'');
export async function buildExecutiveWord(payload){
 const {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,HeadingLevel}=await import('docx');
 const p=(text,options={})=>new Paragraph({children:[new TextRun({text:str(text),bold:Boolean(options.bold),
   color:options.color||'26394D',size:options.size||22,font:'Calibri'})],spacing:{after:100}});
 const title=(text)=>new Paragraph({text:str(text),heading:HeadingLevel.HEADING_1,
   spacing:{before:260,after:110}});
 const bullets=(rows)=>((rows||[]).length?rows:['Sin hallazgos adicionales para este periodo.'])
    .map(row=>new Paragraph({children:[new TextRun({text:str(row),size:21,font:'Calibri'})],
      bullet:{level:0},spacing:{after:80}}));
 const table=(heads,body)=>{
  function cell(value,header=false){return new TableCell({children:[
   new Paragraph({children:[new TextRun({text:str(value),bold:header,size:19,font:'Calibri',
     color:header?'17365D':'26394D'})]})]});}
  return new Table({rows:[new TableRow({children:heads.map(h=>cell(h,true))}),
    ...body.map(row=>new TableRow({children:row.map(value=>cell(value))}))]});
 };
 const contents=[];
 const add=(heading,rows)=>{contents.push(title(heading),...bullets(rows));};
 const intro=payload.financials||{},numbers=payload.metricValues||{};
 contents.push(
  p('TWELVE BUSINESS STRATEGIES LLC',{bold:true,size:19,color:'52769A'}),
  p('REPORTE FINANCIERO EJECUTIVO',{bold:true,size:35,color:'17365D'}),
  p(payload.businessName,{bold:true,size:26}),
  p('Periodo principal: '+payload.from+' al '+payload.to),
  p('Industria: '+payload.industryLabel),
 );
 contents.push(title('Resumen ejecutivo'));
 contents.push(p('Ventas: '+metricDisplay('revenue',numbers.revenue)+
  ' | Gastos: '+metricDisplay('expenses',numbers.expenses)+
  ' | Ganancia neta: '+metricDisplay('net_income',numbers.net_income)));
 const flags=[];
 if(Math.abs(intro.balanceDifference||0)>=.01)flags.push('Balance Sheet con diferencia contable.');
 if(intro.reconciliationAlerts>0)flags.push('Existen conciliaciones por validar.');
 if(intro.arMismatch)flags.push('Existe diferencia de A/R y facturas.');
 if(intro.uncategorizedCount>0)flags.push(intro.uncategorizedCount+' transacciones sin categorizar.');
 contents.push(p(flags.length?'Validaciones pendientes: '+flags.join(' '):
  'No se identificaron alertas especificas en esta vista. Esto no representa una auditoria.'));
 contents.push(title('Indicadores financieros seleccionados'));
 contents.push(table(['Indicador','Resultado','Explicacion'],(payload.metrics||[]).map(k=>[
  k.label,metricDisplay(k.key,numbers[k.key]),k.meaning,
 ])));

 if((payload.monthlyRows||[]).length>=2){
  contents.push(title('Comparacion de meses seleccionados'));
  const months=payload.monthlyRows;
  for(let i=0;i<months.length;i+=4){
   const portion=months.slice(i,i+4);
   const heads=['Indicador',...portion.map(m=>m.label)];
   const rows=(payload.monthlyKpis||[]).map(k=>[k.label,...portion.map(m=>{
    const index=months.findIndex(a=>a.month===m.month);
    const change=k.changes[index],result=k.values[index];
    const diff=change?.delta===null||!change?'-':change.changePoints!==null?
      change.changePoints.toFixed(2)+' pp':change.changePercent!==null?
      change.changePercent.toFixed(1)+'%':'N/D';
    return metricDisplay(k.key,result)+(index===0?'':' | '+diff);
   })]);
   contents.push(p('Meses: '+portion.map(m=>m.label).join(' / '),{bold:true,size:20}));
   contents.push(table(heads,rows));
  }
  contents.push(p('El segundo valor en cada celda, cuando existe, es el cambio frente al mes anterior seleccionado. Las cuentas de Balance Sheet son saldos a fecha de cierre.',{size:19}));
  add('Hallazgos mes a mes',payload.monthlyFindings);
 }else if(payload.comparisonPeriod&&payload.comparison?.length){
  contents.push(title('Comparacion de periodos'));
  contents.push(p('Comparado: '+payload.comparisonPeriod.from+' al '+payload.comparisonPeriod.to));
  contents.push(table(['Indicador','Comparado','Principal','Variacion'],
    payload.comparison.map(x=>[x.label,metricDisplay(x.key,x.prior),metricDisplay(x.key,x.current),
      x.delta===null?'N/D':x.changePoints!==null?x.changePoints.toFixed(2)+' pp':
      x.changePercent!==null?x.changePercent.toFixed(2)+'%':metricDisplay(x.key,x.delta)])));
 }
 const n=payload.narrative||{},notes=payload.notes||{};
 add('Hallazgos financieros',n.findings);
 add('Oportunidades',n.opportunities);
 add('Amenazas y riesgos',n.risks);
 contents.push(title('Analisis del mercado y sector'));
 contents.push(p('Oportunidad a estudiar: '+str(n.sectorOpportunities||'Por evaluar.')));
 contents.push(p('Amenaza por monitorear: '+str(n.sectorThreats||'Por evaluar.')));
 contents.push(p('Observaciones del mercado: '+str(notes.marketContext||'No registradas.')));
 contents.push(p('Fuente aportada: '+str(notes.marketSource||'Sin fuente registrada')+
  (notes.marketSourceDate?' | Fecha: '+notes.marketSourceDate:'')));
 contents.push(p('Las hipotesis sectoriales no son estadisticas externas verificadas automaticamente.',{size:18}));
 add('Estrategias a corto plazo (0-90 dias)',n.shortTerm);
 add('Estrategias a mediano plazo (3-12 meses)',n.mediumTerm);
 add('Preguntas de discusion con los duenos',n.questions);
 contents.push(title('Minuta y compromisos'));
 contents.push(p('Hallazgos discutidos: '+str(notes.ownerDiscussion||'Pendiente.')));
 contents.push(p('Acuerdos, responsables y fechas: '+str(notes.agreements||'Pendiente.')));
 contents.push(p('Proxima reunion: '+str(notes.followupDate||'Por definir.')));
 contents.push(p('Reporte de gestion basado en la contabilidad disponible en TBS Accounting Engine. No constituye auditoria ni garantias de resultados.',{size:18,color:'66748A'}));
 const doc=new Document({
  creator:'Twelve Business Strategies LLC',
  title:'Reporte Financiero Ejecutivo - '+payload.businessName,
  subject:'Analisis financiero y estrategico',
  sections:[{
   properties:{page:{size:{width:12240,height:15840},margin:{top:800,bottom:800,left:800,right:800}}},
   children:contents,
  }],
 });
 const blob=await Packer.toBlob(doc);
 if(!blob||blob.size<1800)throw Error('Word no se genero correctamente.');
 return blob;
}
export async function downloadExecutiveWord(payload){
 const blob=await buildExecutiveWord(payload);
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');
 a.href=url;
 a.download=executivePdfFilename(payload).replace(/\.pdf$/i,'.docx');
 document.body.appendChild(a);
 a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),5000);
 return blob.size;
}
