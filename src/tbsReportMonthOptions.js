// Periods available to Reports, including months with manual Journal Entries only.
export function reportMonthOptions({transactions=[], invoices=[], journalEntries=[]}={}, now=new Date()) {
  const dates=[...transactions,...invoices,...journalEntries].map(v=>String(v?.date??'').slice(0,7))
    .filter(v=>/^\d{4}-(0[1-9]|1[0-2])$/.test(v));
  const current=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const sorted=[...new Set([...dates,current])].sort();
  // Include months between the earliest posting and newest available period.
  const [startY,startM]=sorted[0].split('-').map(Number);
  const [endY,endM]=sorted[sorted.length-1].split('-').map(Number);
  const start=startY*12+startM-1, end=endY*12+endM-1;
  const output=[];
  for(let n=end;n>=start&&output.length<240;n--) {
    const year=Math.floor(n/12), month=n%12+1;
    const m=`${year}-${String(month).padStart(2,'0')}`;
    const lastDay=new Date(year,month,0).getDate();
    output.push({
      value:m,
      label:new Date(year,month-1,1).toLocaleString('en-US',{month:'long',year:'numeric'}),
      first:`${m}-01`,
      last:`${m}-${String(lastDay).padStart(2,'0')}`,
    });
  }
  return output;
}
