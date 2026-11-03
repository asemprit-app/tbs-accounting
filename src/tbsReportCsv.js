// Reusable, spreadsheet-safe CSV export for TBS reports.
// PDF and CSV are distinct representations of the same underlying rows.
export function csvCell(value) {
  const raw = value == null ? '' : String(value);
  // Prevent spreadsheet formula execution from untrusted descriptions and names.
  const safe = /^[\s]*[=+@\-]/.test(raw) && typeof value !== 'number' ? "'" + raw : raw;
  return '"' + safe.replace(/"/g, '""') + '"';
}
export function financialReportCsv(header, rows) {
  if (!Array.isArray(header) || !header.length) throw new Error('Missing CSV columns.');
  const records = [header, ...(rows || [])];
  return '\uFEFF' + records.map(row => header.map((_, i) => csvCell(row?.[i])).join(',')).join('\r\n') + '\r\n';
}
export function reportCsvFilename(businessName, title) {
  const slug = value => String(value || 'report').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0,65);
  return slug(businessName) + '_' + slug(title) + '.csv';
}
export function downloadReportCsv({header, rows, businessName, title}) {
  const csv = financialReportCsv(header, rows);
  const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = reportCsvFilename(businessName, title);
  document.body.appendChild(anchor);
  try { anchor.click(); } finally { anchor.remove(); URL.revokeObjectURL(url); }
}
