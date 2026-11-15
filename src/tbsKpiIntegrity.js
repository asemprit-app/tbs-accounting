// Read-after-write validation for operational KPIs. An API response without an
// error is not proof that the requested row was actually persisted.
export function kpiValueMatches(row, expected) {
 if(!row || !expected) return false;
 return row.client_id===expected.client_id &&
  row.metric_id===expected.metric_id &&
  row.period_month===expected.period_month &&
  row.value!==null && row.value!==undefined &&
  Number.isFinite(Number(row.value)) &&
  Number(row.value)===Number(expected.value) &&
  String(row.notes??'')===String(expected.notes??'');
}
export function kpiDefinitionMatches(row, expected) {
 if(!row || !expected) return false;
 return row.client_id===expected.client_id &&
  row.name===expected.name &&
  row.unit===expected.unit &&
  row.aggregation===expected.aggregation &&
  String(row.description??'')===String(expected.description??'');
}
export function verifiedKpiValueInRows(rows, expected) {
 return Array.isArray(rows) && rows.some(row=>kpiValueMatches(row,expected));
}
