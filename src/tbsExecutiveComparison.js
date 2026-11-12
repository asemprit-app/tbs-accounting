// Comparison is based on two explicit accounting ranges. Percentages of
// margins are shown as percentage-point changes, not misleading % growth.
export const COMPARE_MODES=Object.freeze(['previous','month','custom','none']);
const iso=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')&&!Number.isNaN(Date.parse(d+'T00:00:00Z'));
export function monthRange(month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||''))return null;
 const [year,m]=month.split('-').map(Number);
 return {from:month+'-01',to:new Date(Date.UTC(year,m,0)).toISOString().slice(0,10)};
}
export function validComparisonRange(from,to){
 return iso(from)&&iso(to)&&from<=to;
}
export function comparisonRows(indicators=[],primary={},baseline={}){
 return indicators.map(k=>{
   const current=primary[k.key],prior=baseline[k.key];
   if(current===null||current===undefined||prior===null||prior===undefined||
     !Number.isFinite(Number(current))||!Number.isFinite(Number(prior)))
     return {...k,current:current??null,prior:prior??null,delta:null,changePercent:null,changePoints:null};
   const delta=Math.round((Number(current)-Number(prior))*100)/100;
   const isMargin=k.key.includes('margin');
   return {...k,current:Number(current),prior:Number(prior),delta,
     changePercent:!isMargin&&Number(prior)!==0?Math.round((delta/Math.abs(Number(prior)))*10000)/100:null,
     changePoints:isMargin?delta:null};
 });
}
export function comparisonFindings(rows=[],from='',to=''){
 const findings=[];
 for(const row of rows){
  if(!['revenue','expenses','net_income','net_margin','gross_margin','cash'].includes(row.key)||row.delta===null)continue;
  const direction=row.delta>0?'aumentó':row.delta<0?'disminuyó':'no cambió';
  const abs=Math.abs(row.delta);
  const figure=row.key.includes('margin')?abs.toFixed(2)+' puntos porcentuales':
    abs.toLocaleString('en-US',{style:'currency',currency:'USD'});
  const relative=row.changePercent===null?'':'; variación '+row.changePercent.toFixed(2)+'%';
  findings.push(row.label+' '+direction+' '+figure+relative+' frente a '+from+' al '+to+'.');
 }
 return findings.slice(0,6);
}
