// Pure helpers used for bulk Payroll stubs to keep each email independent.
export function bulkPayrollSelection(lines,selectedIds){
  const selected=new Set(selectedIds);
  return lines.filter(line=>selected.has(line.id));
}
export function bulkMissingRecipients(lines,employees){
  const byId=new Map(employees.map(emp=>[emp.id,emp]));
  return lines.filter(line=>{
    const email=String(byId.get(line.employeeId)?.email||'').trim();
    return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  });
}
