// Consistent native PDF renderer for Payroll and Services registers.
// Uses the same document data as the preview, without printing a scroll container.
export function drawRegisterPdf(JsPdf, { title, headings = [], tables = [], businessName = '', periodLabel = '' }) {
  if (!tables.some(t => t.rows?.length)) throw new Error('No register rows to export.');
  const maxCols=Math.max(...tables.map(t=>t.headers?.length||0));
  const orientation=maxCols>6?'landscape':'portrait';
  const format=maxCols>12?'legal':'letter';
  const doc=new JsPdf({unit:'pt',format,orientation,compress:false});
  const pageW=doc.internal.pageSize.getWidth(), pageH=doc.internal.pageSize.getHeight();
  const margin=34, right=pageW-margin, bottom=pageH-48, available=right-margin;
  const sanitize=v=>String(v??'').replace(/[\t\r\n]+/g,' ').trim();
  const inferredTitle=sanitize(title).replace(/_/g,' ').replace(/\.pdf$/i,'');
  const headingText=(headings||[]).map(sanitize).filter(Boolean);
  const knownBusiness=sanitize(businessName)||(headingText.find(s=>s.length<100&&!/register|period|\d{4}-\d{2}/i.test(s))||'');
  const reportTitle=/payroll/i.test(inferredTitle)?'PAYROLL REGISTER':/receipt|service/i.test(inferredTitle)?'RECEIPTS REGISTER':inferredTitle.toUpperCase();
  const period=sanitize(periodLabel)||(headingText.find(s=>/\d{4}-\d{2}-\d{2}/.test(s))||'');
  const navy=[23,54,93], gray=[96,110,127];
  const setText=(color=navy)=>doc.setTextColor(...color);
  const font=(size,bold=false)=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);};
  let y=0;
  function header(){
    y=38;
    font(15,true);setText(navy);
    const companyLines=doc.splitTextToSize(knownBusiness||'Business',available*.53).slice(0,2);
    doc.text(companyLines,margin,y);
    font(16,true);doc.text(reportTitle,right,y,{align:'right'});
    y+=Math.max(28,companyLines.length*17);
    font(9);setText(gray);
    if(period) {doc.text(doc.splitTextToSize(period,available).slice(0,2),margin,y);y+=17;}
    doc.setDrawColor(176,145,92);doc.setLineWidth(2);doc.line(margin,y,right,y);y+=19;
  }
  const newPage=()=>{doc.addPage();header();};
  header();
  for(const table of tables) {
    const headers=(table.headers||[]).map(sanitize);
    const n=Math.max(headers.length,...table.rows.map(r=>r.length));
    if(!n)continue;
    // Names and descriptions receive more room than amounts and dates.
    const weights=Array.from({length:n},(_,i)=>{
      const h=(headers[i]||'').toLowerCase();
      if(/employee|resource|description|supplier|payee/.test(h))return 2.5;
      if(/resource type|invoice|status|account/.test(h))return 1.45;
      if(/date/.test(h))return 1.45;
      if(/hours|rate|gross|net pay|amount|tax|retention|fica|social|medicare|sinot|subtotal|sub-total|reimb|other|tips|ivu/.test(h))return 1.18;
      return 1;
    });
    const totalW=weights.reduce((a,b)=>a+b,0);
    const widths=weights.map(w=>available*w/totalW);
    const xs=[margin];widths.forEach(w=>xs.push(xs[xs.length-1]+w));
    const size=n>=13?7.1:n>=9?8:9;
    const rowLeading=size+3.1;
    const alignRight=i=>/hours|rate|gross|net pay|amount|tax|retention|fica|social|medicare|sinot|subtotal|sub-total|reimb|other|tips|ivu/i.test(headers[i]||'');
    function wrap(row) {
      font(size);
      return Array.from({length:n},(_,i)=>doc.splitTextToSize(sanitize(row[i]),Math.max(18,widths[i]-11)));
    }
    function paintHeader() {
      const segments=wrap(headers);
      const max=Math.max(1,...segments.map(s=>s.length));
      const h=Math.max(27,9+max*rowLeading);
      doc.setFillColor(59,63,69);doc.rect(margin,y,available,h,'F');
      font(size,true);setText([255,255,255]);
      segments.forEach((lines,i)=>lines.forEach((str,j)=>{
        doc.text(str,alignRight(i)?xs[i+1]-5:xs[i]+5,y+13+j*rowLeading,alignRight(i)?{align:'right'}:undefined);
      }));
      y+=h;
    }
    if(y+65>bottom)newPage();
    paintHeader();
    let stripe=0;
    for(const row of table.rows) {
      const total=/^total(?:\s|\(|$)/i.test(sanitize(row[0]));
      const segments=wrap(row);
      const max=Math.max(1,...segments.map(s=>s.length));
      let offset=0;
      while(offset<max) {
        const fit=Math.floor((bottom-y-10)/rowLeading);
        if(fit<1) {newPage();paintHeader();continue;}
        const lines=Math.min(fit,max-offset);
        const h=lines*rowLeading+9;
        if(total)doc.setFillColor(232,238,245);
        else if(stripe%2===1)doc.setFillColor(247,249,251);
        else doc.setFillColor(255,255,255);
        doc.rect(margin,y,available,h,'F');
        font(size,total);setText(total?navy:[48,58,72]);
        segments.forEach((cell,i)=>{
          let drawn=cell.slice(offset,offset+lines);
          if(offset>0&&i===0&&drawn.length===0)drawn=[sanitize(row[0]).slice(0,25)];
          drawn.forEach((str,j)=>doc.text(str,alignRight(i)?xs[i+1]-5:xs[i]+5,y+13+j*rowLeading,alignRight(i)?{align:'right'}:undefined));
        });
        y+=h;
        doc.setDrawColor(total?151:227,total?164:232,total?180:238);
        doc.setLineWidth(total?1:.3);doc.line(margin,y,right,y);
        offset+=lines;
        if(offset<max){newPage();paintHeader();}
      }
      stripe++;
    }
    y+=16;
  }
  const pageCount=doc.getNumberOfPages();
  for(let p=1;p<=pageCount;p++){
    doc.setPage(p);doc.setDrawColor(214,221,229);doc.setLineWidth(.5);
    doc.line(margin,pageH-34,right,pageH-34);
    font(8);setText(gray);doc.text('TBS Accounting Engine  |  Amounts in USD',margin,pageH-20);
    doc.text('Page '+p+' of '+pageCount,right,pageH-20,{align:'right'});
  }
  return doc;
}
export function assertNonblankPdfPages(doc) {
  for(let page=1;page<=doc.getNumberOfPages();page++){
    const stream=doc.internal.pages[page].join('\n');
    if(!/\([^)]*\S[^)]*\)\s*Tj|\[[^\]]*\S[^\]]*\]\s*TJ/.test(stream))
      throw new Error('A blank PDF page was detected; export was cancelled.');
  }
  return doc;
}
