import {EXECUTIVE_SECTIONS,normalizeClientSections} from './tbsExecutiveSections.js';
export const TBS_CONTACT_EMAIL='admin@twelvestrategies.com';
export const TBS_COMPANY='Twelve Business Strategies LLC';
export function validRecipientEmail(input){
 const value=String(input||'').trim();
 return value.length<=254&&/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(value);
}
export function executiveEmailSubject(businessName,from,to){
 return 'Reporte Financiero Ejecutivo | '+String(businessName||'Cliente').trim()+' | '+from+' al '+to;
}
export function executiveEmailMessage(businessName,from,to,months=[],selectedSections=null){
 const included=Array.isArray(selectedSections)?normalizeClientSections(selectedSections):null;
 const descriptions=included?EXECUTIVE_SECTIONS.filter(s=>included.includes(s.key)).map(s=>s.label.toLowerCase()):[];
 const introduction=included?'Las secciones incluidas en este envio son: '+descriptions.join(', ')+'.':
  'El documento presenta los principales indicadores financieros, hallazgos, oportunidades, riesgos y recomendaciones estrategicas para apoyar la toma de decisiones.';
 const selected=Array.isArray(months)&&months.length>=2?
   '\nIncluye tambien una comparacion de los meses seleccionados: '+months.join(', ')+'.\n':'';
 return 'Estimado/a:\n\n'+
 'Adjuntamos el Reporte Financiero Ejecutivo de '+String(businessName||'su negocio')+
 ' correspondiente al periodo del '+from+' al '+to+'.\n\n'+
 introduction+'\n'+
 selected+'\nLe invitamos a revisar el reporte. Si desea discutir los resultados o necesita alguna aclaracion, puede comunicarse con Twelve Business Strategies LLC a traves de '+TBS_CONTACT_EMAIL+'.\n\n'+
 'Cordialmente,\nTwelve Business Strategies LLC';
}
export function ensureCompanyContact(message){
 const raw=String(message||'').trim();
 const company=/Twelve Business Strategies LLC/i.test(raw);
 const email=/admin@twelvestrategies\.com/i.test(raw);
 if(company&&email)return raw;
 return raw+'\n\nPara cualquier pregunta o para conversar sobre este reporte, puede comunicarse con Twelve Business Strategies LLC en '+TBS_CONTACT_EMAIL+'.';
}
