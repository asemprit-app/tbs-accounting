// Read every page with a stable total order. Ordering by a nonunique date
// alone is unsafe: many bank transactions share the same calendar day.
export async function fetchAllClientRows(supabase,table,clientId,orderCol,pageSize=1000){
 const rows=[];
 for(let page=0;;page++){
  let query=supabase.from(table).select('*').eq('client_id',clientId);
  query=orderCol?query.order(orderCol).order('id'):query.order('id');
  const {data,error}=await query.range(page*pageSize,(page+1)*pageSize-1);
  if(error)return {data:null,error};
  rows.push(...(data||[]));
  if(!data||data.length<pageSize)break;
 }
 return {data:rows,error:null};
}
