// True editable Office Open XML (.docx), not HTML renamed with a Word extension.
// Loaded on demand so accounting pages do not download the Word library.
import {metricDisplay,executivePdfFilename} from './tbsExecutiveReportPdf.js';
import {includeExecutiveSection,simpleExecutiveSummary} from './tbsExecutiveSections.js';
import {verticalReportChartPng} from './tbsExecutiveChartCanvas.js';
const str=v=>String(v??'');
export async function buildExecutiveWord(payload){
 const {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,HeadingLevel,ImageRun}=await import('docx');
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
 const include=key=>includeExecutiveSection(payload,key);
 contents.push(
  p('TWELVE BUSINESS STRATEGIES LLC',{bold:true,size:19,color:'52769A'}),
  p('REPORTE FINANCIERO EJECUTIVO',{bold:true,size:35,color:'17365D'}),
  p(payload.businessName,{bold:true,size:26}),
  p('Periodo principal: '+payload.from+' al '+payload.to),
  p('Industria: '+payload.industryLabel),
 );
 if(include('summary')){
  contents.push(title('Resumen ejecutivo - en palabras sencillas'));
  contents.push(...simpleExecutiveSummary(intro,numbers).map(line=>p(line)));
 }
 const flags=[];
 if(Math.abs(intro.balanceDifference||0)>=.01)flags.push('Balance Sheet con diferencia contable.');
 if(intro.reconciliationAlerts>0)flags.push('Existen conciliaciones por validar.');
 if(intro.arMismatch)flags.push('Existe diferencia de A/R y facturas.');
 if(intro.uncategorizedCount>0)flags.push(intro.uncategorizedCount+' transacciones sin categorizar.');
 contents.push(p(flags.length?'Validaciones pendientes: '+flags.join(' '):
  'No se identificaron alertas especificas en esta vista. Esto no representa una auditoria.'));
 if(include('indicators')){
  contents.push(title('Indicadores financieros seleccionados'));
  contents.push(table(['Indicador','Resultado','Explicacion'],(payload.metrics||[]).map(k=>[
   k.label,metricDisplay(k.key,numbers[k.key]),k.meaning,
  ])));
 }

 if(include('comparison')&&(payload.monthlyRows||[]).length>=2){
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
 }else if(include('comparison')&&payload.comparisonPeriod&&payload.comparison?.length){
  contents.push(title('Comparacion de periodos'));
  contents.push(p('Comparado: '+payload.comparisonPeriod.from+' al '+payload.comparisonPeriod.to));
  contents.push(table(['Indicador','Comparado','Principal','Variacion'],
    payload.comparison.map(x=>[x.label,metricDisplay(x.key,x.prior),metricDisplay(x.key,x.current),
      x.delta===null?'N/D':x.changePoints!==null?x.changePoints.toFixed(2)+' pp':
      x.changePercent!==null?x.changePercent.toFixed(2)+'%':metricDisplay(x.key,x.delta)])));
 }
 if(include('monthlySales')&&Array.isArray(payload.monthlySalesRows)&&payload.monthlySalesRows.length){
  const months=payload.monthlySalesRows;
  contents.push(title('Ventas, gastos y ganancia neta - barras verticales por mes'));
  for(let i=0;i<months.length;i+=6){
    const group=months.slice(i,i+6);
    const png=verticalReportChartPng(group,{
      keys:['sales','expenses','netIncome'],
      labels:['Ventas','Gastos','Ganancia neta'],
      colors:['#3C78AC','#D1A354','#237B70']
    });
    if(png){
      contents.push(new Paragraph({children:[new ImageRun({
        data:png,type:'png',transformation:{width:485,height:208},
        altText:{title:'Resultados mensuales',description:'Grafica de barras verticales de ventas, gastos y ganancia neta',name:'Resultados por mes'}
      })],spacing:{before:130,after:120}}));
    }else{
      // Node-based regression runs without a browser canvas. Word export from
      // the real browser inserts vertical chart images here.
      contents.push(p('Grafica de barras verticales: '+group.map(r=>r.label).join(', '),{bold:true,size:19}));
    }
  }
  contents.push(p('Azul: ventas; dorado: gastos (incluyendo costo de ventas); verde: ganancia; rojo: perdida neta.',{size:18}));
  contents.push(title('Tabla mensual de ventas, gastos y ganancia neta'));
  contents.push(table(['Mes','Ventas','Gastos','Ganancia neta','Var. ventas'],[
    ...months.map(row=>[
      row.label+(row.partialMonth?' *':''),
      metricDisplay('revenue',row.sales),
      metricDisplay('expenses',row.expenses),
      metricDisplay('net_income',row.netIncome),
      row.changePercent===null?'N/D':(row.changePercent>0?'+':'')+row.changePercent.toFixed(1)+'%',
    ]),
    ['TOTAL',metricDisplay('revenue',payload.monthlySalesTotal),
      metricDisplay('expenses',payload.monthlyExpenseTotal),
      metricDisplay('net_income',payload.monthlyNetTotal),'-'],
  ]));
  if(months.some(row=>row.partialMonth))
    contents.push(p('* Mes parcial: solo los dias dentro del periodo seleccionado.',{size:18}));
  contents.push(p('Los gastos incluyen costo de ventas. La variacion % es N/D si el mes anterior registra ventas cero o negativas.',{size:18}));
 }
 if(include('charts')){
  contents.push(title('Graficas financieras - barras verticales'));
  const charts=[
    ['Ventas, gastos y ganancia neta',[
      {label:'Ventas',value:numbers.revenue},{label:'Gastos',value:numbers.expenses},{label:'Neto',value:numbers.net_income}
    ]],
    ['Principales saldos al cierre',[
      {label:'Efectivo',value:numbers.cash},{label:'A/R',value:numbers.receivables},{label:'Pasivos',value:numbers.liabilities}
    ]],
  ];
  for(const [chartTitle,values] of charts){
    contents.push(p(chartTitle,{bold:true,size:20}));
    const png=verticalReportChartPng(values,{keys:['value'],labels:['Importe'],colors:['#3C78AC']});
    if(png)contents.push(new Paragraph({children:[new ImageRun({
      data:png,type:'png',transformation:{width:485,height:208},
      altText:{title:chartTitle,description:'Grafica de barras verticales',name:chartTitle}
    })]}));
    contents.push(table(['Concepto','Importe'],values.map(row=>[row.label,metricDisplay('cash',row.value)])));
  }
 }
 const n=payload.narrative||{},notes=payload.notes||{};
 if(include('topExpenses')&&payload.topExpenses?.rows?.length){
  contents.push(title('Cinco gastos principales del periodo'));
  const ranked=payload.topExpenses;
  contents.push(table(['Cuenta de gasto','Importe','% de gastos'],ranked.rows.map(row=>[
    (row.code?row.code+' - ':'')+row.name+(row.isCogs?' (Costo de ventas)':''),
    metricDisplay('expenses',row.amount),
    row.percent===null?'N/D':row.percent.toFixed(1)+'%',
  ])));
  add('Hallazgos sobre los gastos principales',ranked.findings);
 }
 if(include('findings'))add('Hallazgos financieros',n.findings);
 if(include('opportunities'))add('Oportunidades',n.opportunities);
 if(include('risks'))add('Amenazas y riesgos',n.risks);
 if(include('market')){
 contents.push(title('Analisis del mercado y sector'));
 contents.push(p('Oportunidad a estudiar: '+str(n.sectorOpportunities||'Por evaluar.')));
 contents.push(p('Amenaza por monitorear: '+str(n.sectorThreats||'Por evaluar.')));
 contents.push(p('Observaciones del mercado: '+str(notes.marketContext||'No registradas.')));
 contents.push(p('Fuente aportada: '+str(notes.marketSource||'Sin fuente registrada')+
  (notes.marketSourceDate?' | Fecha: '+notes.marketSourceDate:'')));
 contents.push(p('Las hipotesis sectoriales no son estadisticas externas verificadas automaticamente.',{size:18}));
 }
 if(include('shortTerm'))add('Estrategias a corto plazo (0-90 dias)',n.shortTerm);
 if(include('mediumTerm'))add('Estrategias a mediano plazo (3-12 meses)',n.mediumTerm);
 if(include('questions'))add('Preguntas de discusion con los duenos',n.questions);
 if(include('meetingNotes')){
 contents.push(title('Minuta y compromisos'));
 contents.push(p('Hallazgos discutidos: '+str(notes.ownerDiscussion||'Pendiente.')));
 contents.push(p('Acuerdos, responsables y fechas: '+str(notes.agreements||'Pendiente.')));
 contents.push(p('Proxima reunion: '+str(notes.followupDate||'Por definir.')));
 }
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
