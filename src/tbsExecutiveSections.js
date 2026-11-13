// Presentation selection affects client-facing PDF, Word and email attachments.
// All report analysis remains visible to TBS staff in the internal screen.
export const EXECUTIVE_SECTIONS=Object.freeze([
 {key:'summary',label:'Resumen ejecutivo sencillo',description:'Resultado del período y prioridades principales'},
 {key:'indicators',label:'Indicadores financieros',description:'Valores y explicación de cada indicador'},
 {key:'comparison',label:'Comparaciones de meses y períodos',description:'Meses seleccionados o comparación personalizada'},
 {key:'monthlySales',label:'Resultados mensuales: gráfica y tabla',description:'Barras verticales de ventas, gastos y ganancia neta por mes'},
 {key:'operational',label:'Productividad e indicadores operacionales',description:'Pacientes, recetas, ocupación y ventas por unidad cuando existan registros'},
 {key:'topExpenses',label:'Cinco gastos principales',description:'Cuentas de gasto más altas, participación y recomendaciones'},
 {key:'charts',label:'Gráficas financieras',description:'Ventas, gastos, ganancia y principales balances'},
 {key:'findings',label:'Hallazgos financieros',description:'Interpretación de los resultados'},
 {key:'opportunities',label:'Oportunidades',description:'Oportunidades apoyadas por los datos'},
 {key:'risks',label:'Amenazas y riesgos',description:'Situaciones que requieren atención'},
 {key:'market',label:'Observaciones del mercado',description:'Hipótesis sectoriales y evidencia aportada'},
 {key:'shortTerm',label:'Estrategias a corto plazo',description:'Acciones para los próximos 0–90 días'},
 {key:'mediumTerm',label:'Estrategias a mediano plazo',description:'Acciones para los próximos 3–12 meses'},
 {key:'questions',label:'Preguntas para discutir',description:'Guía para la reunión con los dueños'},
 {key:'meetingNotes',label:'Minuta y acuerdos internos',description:'Notas de TBS y responsables; excluida por defecto',confidential:true},
]);
export const DEFAULT_CLIENT_SECTIONS=Object.freeze([
 'summary','indicators','comparison','monthlySales','operational','topExpenses','charts','findings',
 'opportunities','risks','shortTerm','mediumTerm',
]);
const allowed=new Set(EXECUTIVE_SECTIONS.map(s=>s.key));
export function normalizeClientSections(sections){
 if(!Array.isArray(sections))return [...DEFAULT_CLIENT_SECTIONS];
 return EXECUTIVE_SECTIONS.filter(s=>sections.includes(s.key)).map(s=>s.key);
}
export function includeExecutiveSection(payload,key){
 const sections=normalizeClientSections(payload?.clientSections);
 return sections.includes(key);
}
const amount=n=>Number(n).toLocaleString('en-US',{style:'currency',currency:'USD',
 minimumFractionDigits:2,maximumFractionDigits:2});
export function simpleExecutiveSummary(financials={},metrics={}){
 const revenue=Number(metrics.revenue)||0,expense=Number(metrics.expenses)||0,net=Number(metrics.net_income)||0;
 const paragraphs=[];
 if(!financials.periodRecords){
  paragraphs.push('No hay suficiente actividad de ventas o gastos registrada para interpretar los resultados del período. Es importante confirmar que los movimientos del mes estén completos antes de tomar decisiones.');
 }else{
  paragraphs.push('En el período seleccionado, el negocio registró ventas de '+amount(revenue)+
   ' y gastos de '+amount(expense)+'. '+(net>0?'Esto dejó una ganancia neta de '+amount(net)+'.':
    net<0?'Esto generó una pérdida neta de '+amount(Math.abs(net))+' .':
    'El resultado neto fue de '+amount(0)+'.').replace(' .','.') );
  if(revenue>0&&Number.isFinite(Number(metrics.net_margin))){
   const margin=Number(metrics.net_margin);
   if(margin>=0)paragraphs.push('En términos sencillos, de cada $100 vendidos quedaron aproximadamente $'+margin.toFixed(2)+' después de los gastos registrados.');
   else paragraphs.push('Los gastos superaron las ventas: por cada $100 vendidos se perdió aproximadamente $'+Math.abs(margin).toFixed(2)+'.');
  }
  if(net<0)paragraphs.push('La prioridad inmediata es revisar los gastos y las actividades menos rentables para reducir las pérdidas.');
  else if(net>0)paragraphs.push('La prioridad es proteger la ganancia y verificar cuáles productos o servicios aportan más al resultado.');
 }
 if((Number(financials.uncategorizedCount)||0)>0||Number(financials.reconciliationAlerts)>0||financials.arMismatch||Math.abs(Number(financials.balanceDifference)||0)>=.01)
  paragraphs.push('Algunas cifras están pendientes de validación contable; deben confirmarse antes de adoptar decisiones definitivas.');
 return paragraphs;
}
