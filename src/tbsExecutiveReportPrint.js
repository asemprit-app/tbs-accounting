// User-triggered, client-side print layout. Uses only report values and
// staff-entered market evidence. Escaping prevents notes from injecting HTML.
const htmlEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>Number(value).toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
const pct=value=>Number(value).toLocaleString('es-PR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
const lines=items=>(items||[]).map(x=>'<li>'+htmlEscape(x)+'</li>').join('');
const paragraph=value=>htmlEscape(value||'').replace(/\n/g,'<br>');
function metricValue(key,metrics){
 const value=metrics[key];
 if(value===null||value===undefined||!Number.isFinite(Number(value)))return 'N/D';
 return key.includes('margin')?pct(value):money(value);
}
function barChart(heading,entries){
 const max=Math.max(...entries.map(x=>Math.max(0,Number(x.value)||0)),1);
 return '<div class="chart"><h3>'+htmlEscape(heading)+'</h3>'+entries.map(item=>{
  const value=Number(item.value)||0;
  const width=Math.max(0,Math.min(100,value/max*100));
  return '<div class="chartline"><div class="chartlabel">'+htmlEscape(item.label)+'</div>'+
    '<div class="barbg"><div class="bar" style="width:'+width.toFixed(2)+'%"></div></div>'+
    '<div class="chartvalue">'+money(value)+'</div></div>';
 }).join('')+'</div>';
}
export function executiveReportPrintHtml({businessName,from,to,industryLabel,metrics=[],metricValues={},prior,narrative,financials,notes}){
 const selectedMetrics=metrics.map(x=>'<tr><td><strong>'+htmlEscape(x.label)+'</strong><div class="meaning">'+htmlEscape(x.meaning)+'</div></td><td class="value">'+htmlEscape(metricValue(x.key,metricValues))+'</td></tr>').join('');
 const reportIssues=[];
 if(Math.abs(financials.balanceDifference||0)>=.01)reportIssues.push('Balance Sheet con diferencia de '+money(financials.balanceDifference));
 if(financials.reconciliationAlerts>0)reportIssues.push(financials.reconciliationAlerts+' conciliación(es) con discrepancia de validación');
 if(financials.arMismatch)reportIssues.push('Diferencia entre A/R del mayor y las facturas');
 if(financials.uncategorizedCount>0)reportIssues.push(financials.uncategorizedCount+' transacciones sin categorizar');
 const source=notes.marketSource?.trim();
 const sourceDate=notes.marketSourceDate;
 const reportReady=reportIssues.length===0?'No se detectaron las alertas específicas evaluadas; esto no certifica cierre contable.':reportIssues.join('; ')+'.';
 const prevLabel=prior?.hasActivity?'Comparativo anterior: '+prior.from+' a '+prior.to+' (misma duración).':'No hay datos suficientes para un comparativo previo confiable.';
 return '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Reporte financiero ejecutivo - '+htmlEscape(businessName)+'</title>'+
  '<style>@page{size:letter;margin:0.58in}*{box-sizing:border-box}body{font:11pt Calibri,Arial,sans-serif;color:#243247;margin:0;line-height:1.36}h1{font-size:20pt;color:#17365D;margin:0 0 5px}h2{font-size:12.5pt;color:#17365D;border-bottom:1px solid #D4E0EB;margin:17px 0 7px;padding-bottom:5px}h3{font-size:10pt;color:#314967;margin:0 0 9px}p{margin:5px 0 8px}header{border-bottom:4px solid #17365D;padding-bottom:12px;margin-bottom:16px}.sub{color:#5D6A7D;font-size:9.5pt}.eyebrow{color:#3F6690;font-size:9pt;letter-spacing:1px;font-weight:bold;text-transform:uppercase}table{width:100%;border-collapse:collapse;font-size:9pt;margin:8px 0}th,td{padding:7px 9px;border-bottom:1px solid #D9E3EB;text-align:left;vertical-align:top}.value{text-align:right;white-space:nowrap;font-weight:bold;color:#17365D}.meaning{font-weight:normal;font-size:8.5pt;color:#69778A}.flag{padding:10px 12px;border:1px solid #F3D5B4;background:#FFFAF3;color:#89501B;font-size:9pt}.note{background:#F3F7FA;padding:10px 12px;font-size:9pt}.charts{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-top:10px}.chart{border:1px solid #E0E6EF;padding:10px;min-height:140px}.chartline{margin:8px 0}.chartlabel{font-size:8pt}.barbg{height:9px;background:#EDF1F5;border-radius:3px;overflow:hidden}.bar{height:100%;background:#527FAD}.chartvalue{font-size:8pt;text-align:right}.columns{display:grid;grid-template-columns:1fr 1fr;gap:16px}ul{padding-left:18px;margin:7px 0}li{margin-bottom:5px}.section{break-inside:avoid-page}.page-break{page-break-before:always}footer{margin-top:20px;border-top:1px solid #DDE3EA;padding-top:8px;color:#66748A;font-size:8.5pt}@media screen{body{max-width:850px;margin:28px auto;padding:20px;box-shadow:0 0 10px #E6E9EC}}</style></head><body>'+
  '<header><div class="eyebrow">Twelve Business Strategies | Análisis y consultoría</div><h1>Reporte Financiero Ejecutivo</h1>'+
  '<div><strong>'+htmlEscape(businessName)+'</strong></div><div class="sub">Período: '+htmlEscape(from)+' al '+htmlEscape(to)+' · Sector: '+htmlEscape(industryLabel)+'</div>'+
  '<div class="sub">'+htmlEscape(prevLabel)+'</div></header>'+
  '<section class="section"><h2>Resumen ejecutivo y validación</h2>'+
  '<p>Reporte de gestión basado en los registros contabilizados del período. La ganancia neta del P&L es '+money(metricValues.net_income||0)+' sobre ventas de '+money(metricValues.revenue||0)+'.</p>'+
  (reportIssues.length?'<div class="flag"><strong>Validación contable pendiente:</strong> '+htmlEscape(reportReady)+'</div>':'<div class="note">'+htmlEscape(reportReady)+'</div>')+'</section>'+
  '<section><h2>Indicadores financieros seleccionados</h2><table><thead><tr><th>Indicador / qué significa</th><th class="value">Resultado</th></tr></thead><tbody>'+selectedMetrics+'</tbody></table></section>'+
  '<section class="section"><h2>Gráficas financieras</h2><div class="charts">'+
  barChart('Resultados del período',[{label:'Ventas',value:metricValues.revenue},{label:'Gastos totales',value:metricValues.expenses},{label:'Ganancia neta',value:metricValues.net_income}])+
  barChart('Cuentas al cierre',[{label:'Efectivo contable',value:metricValues.cash},{label:'A/R contable',value:metricValues.receivables},{label:'Pasivos contables',value:metricValues.liabilities}])+
  '</div><p class="sub">Barras de magnitudes positivas; los importes negativos se presentan con su signo. Efectivo identifica cuentas por su nombre y requiere validación bancaria.</p></section>'+
  '<section><h2>Hallazgos financieros</h2><ul>'+lines(narrative.findings)+'</ul></section>'+
  '<section class="columns"><div><h2>Oportunidades</h2><ul>'+lines(narrative.opportunities)+'</ul></div>'+
  '<div><h2>Amenazas y riesgos</h2><ul>'+lines(narrative.risks)+'</ul></div></section>'+
  '<section><h2>Mercado / industria: elementos para verificar</h2><div class="note"><strong>Oportunidad por estudiar:</strong> '+htmlEscape(narrative.sectorOpportunities)+
  '<br><strong>Amenaza por monitorear:</strong> '+htmlEscape(narrative.sectorThreats)+'</div>'+
  '<p>'+htmlEscape(narrative.sectorDataStatus)+'</p>'+
  '<p><strong>Observación aportada:</strong> '+(notes.marketContext?paragraph(notes.marketContext):'No se proporcionó contexto externo verificable.')+'</p>'+
  '<p class="sub"><strong>Fuente aportada:</strong> '+(source?htmlEscape(source):'Sin fuente registrada')+(sourceDate?' · Fecha de referencia: '+htmlEscape(sourceDate):'')+'. Estas observaciones no se verificaron automáticamente.</p></section>'+
  '<section class="page-break"><h2>Estrategias a corto plazo — próximos 0–90 días</h2><ul>'+lines(narrative.shortTerm)+'</ul></section>'+
  '<section><h2>Estrategias a mediano plazo — próximos 3–12 meses</h2><ul>'+lines(narrative.mediumTerm)+'</ul></section>'+
  '<section><h2>Preguntas para discusión con los dueños</h2><ul>'+lines(narrative.questions)+'</ul></section>'+
  '<section><h2>Hallazgos discutidos y acuerdos</h2><p><strong>Notas de la reunión:</strong></p><div class="note">'+(notes.ownerDiscussion?paragraph(notes.ownerDiscussion):'Pendiente de documentar.')+'</div>'+
  '<p><strong>Decisiones, responsables y fechas:</strong></p><div class="note">'+(notes.agreements?paragraph(notes.agreements):'Pendiente de documentar.')+'</div>'+
  '<p><strong>Próxima revisión:</strong> '+(notes.followupDate?htmlEscape(notes.followupDate):'Por definir')+'</p></section>'+
  '<footer>Fuente financiera: TBS Accounting Engine (P&L y Balance Sheet del cliente a la fecha indicada). Análisis de gerencia sujeto a validación de datos, clasificación, conciliaciones y evidencia externa. No constituye auditoría ni proyección garantizada. No utiliza comparables de mercado en tiempo real.</footer>'+
  '</body></html>';
}
export function printExecutiveFinancialReport(payload){
 const output=window.open('','_blank');
 if(!output)throw new Error('El navegador bloqueó la ventana. Permite ventanas emergentes para imprimir/guardar PDF.');
 output.document.open();output.document.write(executiveReportPrintHtml(payload));output.document.close();
 output.focus();
 output.setTimeout(()=>output.print(),450);
}
