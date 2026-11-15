import {validRecipientEmail} from './tbsExecutiveEmail.js';

// The recipient belongs to the customer profile maintained in the TBS workspace.
// Do not confuse clients.sending_email / reply_to_email (outbound invoice settings)
// with the recipient of the executive report.
export function resolveExecutiveClientRecipient(rows=[],clientId=''){
 const matching=(Array.isArray(rows)?rows:[]).filter(row=>row?.linked_client_id===clientId);
 if(!matching.length)return {email:'',status:'missing'};
 const raw=matching.map(row=>String(row.email??'').trim()).filter(Boolean);
 if(!raw.length)return {email:'',status:'missing'};
 if(raw.some(email=>!validRecipientEmail(email)))return {email:'',status:'invalid'};
 const unique=[...new Set(raw.map(email=>email.toLowerCase()))];
 if(unique.length>1)return {email:'',status:'ambiguous'};
 return {email:unique[0],status:'found'};
}
