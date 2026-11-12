// Executive report calculations re-use exactly the signed account postings and
// invoice revenue convention already used by Financial Reports. No benchmarks,
// forecasts or market facts are fabricated from financial data.
export const KPI_OPTIONS=Object.freeze([
 {key:'revenue',label:'Ventas',meaning:'Ingresos registrados por servicios y productos durante el período.'},
 {key:'gross_margin',label:'Margen bruto',meaning:'Parte de las ventas que queda después de los costos directos registrados.'},
 {key:'expenses',label:'Gastos totales',meaning:'Costos directos y gastos operacionales contabilizados durante el período.'},
 {key:'net_income',label:'Ganancia neta',meaning:'Ventas menos gastos totales registrados durante el período.'},
 {key:'net_margin',label:'Margen neto',meaning:'Porcentaje de cada dólar de venta que queda como ganancia neta.'},
 {key:'cash',label:'Efectivo contable',meaning:'Saldo de las cuentas identificadas como bancos o efectivo a la fecha de cierre.'},
 {key:'cash_movement',label:'Movimiento de efectivo',meaning:'Cambio neto en las cuentas de efectivo durante el período; no equivale a flujo operacional auditado.'},
 {key:'receivables',label:'Cuentas por cobrar',meaning:'Saldo contable de A/R a la fecha de cierre, sujeto a conciliación del submayor.'},
 {key:'liabilities',label:'Pasivos contables',meaning:'Obligaciones registradas al cierre; no representa solamente deuda financiera.'},
 {key:'assets',label:'Activos contables',meaning:'Recursos y derechos registrados al cierre.'},
]);
export const DEFAULT_KPIS=Object.freeze(['revenue','expenses','net_income','net_margin','cash','receivables']);
export const INDUSTRY_OPTIONS=Object.freeze([
 ['general','General / sector no definido'],
 ['services','Servicios profesionales'],
 ['retail','Comercio y venta al detal'],
 ['restaurant','Restaurantes y food trucks'],
 ['pharmacy','Farmacias'],
 ['healthcare','Clínicas y servicios médicos'],
 ['veterinary','Clínicas veterinarias'],
 ['eldercare','Cuidado de adultos mayores'],
 ['construction','Construcción y contratistas'],
 ['hospitality','Hospedaje y alquiler a corto plazo'],
 ['solar','Energía solar y servicios técnicos'],
]);
const SECTOR_SIGNALS=Object.freeze({
 general:['Revisar demanda de clientes, políticas de precios y movimientos de competidores locales.','Verificar cambios en costos de suplidores, capacidad operativa y estacionalidad antes de definir metas.'],
 services:['Evaluar paquetes recurrentes, retención de clientes y rentabilidad por servicio.','Investigar tarifas competidoras y disponibilidad de profesionales calificados.'],
 retail:['Evaluar rotación de inventario, ventas por línea y promociones con margen positivo.','Vigilar inventario lento, costos de reposición y competencia de canales digitales.'],
 restaurant:['Medir costo de ingredientes, ventas por día y margen por plato o servicio.','Vigilar variaciones de precios de insumos, desperdicios y tráfico de clientes.'],
 pharmacy:['Analizar margen por categoría, recetario y productos de venta directa de forma separada.','Revisar términos de droguerías, pagos de aseguradoras y cambios de cobertura aplicables.'],
 healthcare:['Analizar visitas atendidas, mezcla de servicios y facturación/cobro por pagador.','Revisar denegaciones, retrasos de cobro y requisitos de aseguradoras.'],
 veterinary:['Evaluar servicios clínicos frente a productos, recurrencia y capacidad de citas.','Revisar costos de suministros médicos, inventario y competencia de servicios.'],
 eldercare:['Relacionar ocupación, ingresos por residente y costo de personal por turno.','Monitorear rotación de personal, necesidades de cuidado y requisitos de operación.'],
 construction:['Evaluar margen por contrato, avance facturado y cobros por etapa.','Vigilar cambios en costos de materiales, retrasos de proyectos y subcontratación.'],
 hospitality:['Analizar ocupación, tarifa promedio y costos por estadía.','Contrastar temporada, comisiones de plataformas y oferta comparable en la zona.'],
 solar:['Medir margen por instalación, cartera de proyectos y plazo de cobro.','Validar costos de equipos, financiamiento disponible y tiempos de permisos.'],
});
const round2=x=>Math.round((Number(x)||0)*100)/100;
export function previousComparablePeriod(from,to){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(to||'')||from>to)return null;
 const fromD=new Date(from+'T00:00:00Z'),toD=new Date(to+'T00:00:00Z');
 if(Number.isNaN(+fromD)||Number.isNaN(+toD))return null;
 const duration=Math.round((+toD - +fromD)/86400000)+1;
 const prevEnd=new Date(+fromD-86400000);
 const prevStart=new Date(+prevEnd-(duration-1)*86400000);
 return {from:prevStart.toISOString().slice(0,10),to:prevEnd.toISOString().slice(0,10),days:duration};
}
export function comparisonChange(current,previous){
 if(!Number.isFinite(Number(current))||!Number.isFinite(Number(previous))||Number(previous)<=0)return null;
 return round2((Number(current)-Number(previous))/Number(previous)*100);
}
export function executiveMetrics(financials={}){
 const f=financials;
 const revenue=round2(f.revenue);
 const costs=round2(f.cogs);
 const expenses=round2(f.expenses);
 const income=round2(f.netIncome);
 return {
  revenue, expenses,net_income:income,
  gross_margin:f.hasCogs&&revenue>0?round2((revenue-costs)/revenue*100):null,
  net_margin:revenue>0?round2(income/revenue*100):null,
  cash:round2(f.cash),cash_movement:round2(f.cashMovement),
  receivables:f.receivables===null||f.receivables===undefined?null:round2(f.receivables),
  liabilities:round2(f.liabilities),assets:round2(f.assets),
  balanceDifference:round2(f.balanceDifference),
  expensesToRevenue:revenue>0?round2(expenses/revenue*100):null,
 };
}
export function executiveNarrative(financials={},prior={},sector='general'){
 const current=executiveMetrics(financials);
 const findings=[],risks=[],opportunities=[],shortTerm=[],midTerm=[],questions=[];
 const evidence=Boolean(financials.periodRecords);
 if(!evidence){
  findings.push('No se identificaron movimientos de ingresos o gastos registrados en el período seleccionado. Antes de interpretar la rentabilidad, confirmar que la contabilidad del período esté completa.');
  shortTerm.push('Confirmar que estados bancarios, facturas, gastos y asientos del período estén registrados.');
 }else{
  findings.push('Se registraron ventas de '+String(current.revenue)+' y una ganancia neta de '+String(current.net_income)+' en el período. Ambos importes provienen del P&L calculado por TBS.');
  if(current.net_margin!==null) findings.push('El margen neto del período es '+current.net_margin+'%: esta cifra indica qué proporción de ventas permanece después de los gastos registrados.');
  if(current.net_income<0){
   risks.push('El período registra pérdida neta. Confirmar si hay cargos extraordinarios y revisar el punto de equilibrio antes de ampliar compromisos.');
   shortTerm.push('Revisar de inmediato gastos controlables y márgenes de las principales actividades de venta para recuperar rentabilidad.');
   midTerm.push('Preparar un presupuesto por línea de negocio con metas de contribución y revisión mensual.');
  }else if(current.net_income>0){
   opportunities.push('El negocio registró ganancia neta en el período; evaluar qué productos, servicios o clientes contribuyen más a ella antes de invertir.');
  }
  if(prior.hasActivity){
    const delta=comparisonChange(current.revenue,prior.revenue);
    if(delta!==null){
     const kind=delta<0?'disminuyeron':'aumentaron';
     findings.push('Las ventas '+kind+' '+Math.abs(delta)+'% frente al período anterior de igual duración ('+prior.from+' a '+prior.to+').');
     if(delta<0){
      risks.push('La caída de ventas frente al período comparable requiere revisar volumen, precio y mezcla antes de atribuirla al mercado.');
      shortTerm.push('Identificar qué productos, servicios o clientes explican la variación de ventas frente al período anterior.');
     }else if(delta>0){
      opportunities.push('El crecimiento registrado de ventas frente al período anterior permite analizar qué canales o servicios replicar.');
     }
    }else findings.push('No hay una base positiva de ventas en el período anterior para calcular una variación porcentual comparable.');
  }else findings.push('No se dispone de actividad suficiente en el período anterior de igual duración para establecer una tendencia confiable.');
  const largest=(financials.expenseRows||[])
   .filter(item=>(Number(item.value)||0)>0)
   .sort((a,b)=>Number(b.value)-Number(a.value))[0];
  if(largest){
   findings.push('La cuenta de gasto con mayor importe registrado es '+largest.name+' ('+round2(largest.value)+'). Confirmar si corresponde al nivel de actividad del período.');
   shortTerm.push('Evaluar los componentes de '+largest.name+' y negociar o ajustar los costos que puedan controlarse sin afectar el servicio.');
  }
 }
 if(Number(current.receivables)>0){
  risks.push('Hay cuentas por cobrar registradas al cierre; confirmar antigüedad, cobrabilidad y correspondencia con facturas antes de asumir disponibilidad de efectivo.');
  shortTerm.push('Preparar una relación de cuentas por cobrar por cliente, antigüedad y responsable de cobro.');
 }
 if(current.cash<0){
  risks.push('El efectivo contable presenta un saldo negativo; validar clasificación y disponibilidad bancaria.');
  shortTerm.push('Conciliar saldos bancarios y preparar un calendario de desembolsos prioritarios.');
 }else if(current.cash>0){
  opportunities.push('Existe un saldo positivo de efectivo en las cuentas identificadas por nombre; validar disponibilidad y necesidades antes de comprometerlo.');
 }
 if(current.balanceDifference!==0 || financials.reconciliationAlerts>0 || financials.arMismatch){
  risks.push('Existen diferencias o avisos de validación contable pendientes; las decisiones deben condicionarse a resolverlos.');
  shortTerm.unshift('Resolver las alertas de conciliación, A/R o Balance Sheet antes de presentar cifras como definitivas.');
 }
 if((financials.uncategorizedCount||0)>0){
  risks.push('Hay '+financials.uncategorizedCount+' transacciones sin categorizar; el P&L puede cambiar después de su clasificación.');
  shortTerm.unshift('Clasificar las '+financials.uncategorizedCount+' transacciones pendientes y regenerar el reporte antes de aprobarlo.');
 }
 if(evidence&&current.expenses>0&&current.revenue>0)
  midTerm.push('Establecer un tablero mensual de gastos como porcentaje de ventas y comparar meses equivalentes por estacionalidad.');
 midTerm.push('Actualizar una proyección conservadora de ingresos, gastos y efectivo para los próximos 3–12 meses utilizando información histórica validada.');
 midTerm.push('Evaluar concentración de clientes, fuentes de ingresos y capacidad operativa antes de ampliar inversiones.');
 shortTerm.push('Definir un responsable y una fecha para cada acción acordada con la gerencia.');
 const sectorSignals=SECTOR_SIGNALS[sector]||SECTOR_SIGNALS.general;
 questions.push('¿Qué situación operacional explica los principales cambios en ventas y gastos de este período?');
 questions.push('¿Cuáles clientes o líneas de servicio generan mejores márgenes y cuáles demandan más recursos?');
 questions.push('¿Qué cobros, compromisos o desembolsos pueden afectar el efectivo en los próximos 90 días?');
 questions.push('¿Qué observaciones verificables de clientes, proveedores y competidores respaldan las oportunidades y riesgos de mercado?');
 questions.push('¿Qué dos decisiones priorizaremos y quién será responsable de ejecutarlas?');
 return {
  findings:findings.slice(0,6),
  risks:risks.slice(0,6),
  opportunities:opportunities.slice(0,5),
  shortTerm:[...new Set(shortTerm)].slice(0,5),
  mediumTerm:[...new Set(midTerm)].slice(0,4),
  questions,
  sectorOpportunities:sectorSignals[0],
  sectorThreats:sectorSignals[1],
  dataWarning:current.balanceDifference!==0||financials.reconciliationAlerts>0||financials.arMismatch||(financials.uncategorizedCount||0)>0,
  sectorDataStatus:'Hipótesis sectoriales para validar; no son estadísticas ni tendencias de mercado verificadas automáticamente.',
 };
}
