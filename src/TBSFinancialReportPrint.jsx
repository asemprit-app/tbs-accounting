import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  reportPrintCell, reportPrintNumeric, reportPrintLandscape, presentFinancialReportRows,
} from './tbsFinancialReportPresentation.js';

// The same DOM is shown in the preview and printed. Browser print CSS adjusts
// paper size and page breaks, but it never replaces or re-formats money values.
export default function TBSFinancialReportPrint({
  businessName, title, header, rows, selectedReport, breakdown=false, onClose,
}) {
  const landscape = reportPrintLandscape(header);
  const sections = useMemo(() => {
    // Wide monthly/quarterly/yearly breakdowns are split into readable pages,
    // retaining Code + Account for context on every page.
    if(!breakdown || header.length<=6) {
      return [{columns:header.map((_,i)=>i)}];
    }
    const periodIndices=header.slice(2).map((_,i)=>i+2);
    const chunks=[];
    for(let i=0;i<periodIndices.length;i+=4) {
      chunks.push({columns:[0,1,...periodIndices.slice(i,i+4)]});
    }
    return chunks;
  },[breakdown,header]);
  const presented=useMemo(
    ()=>presentFinancialReportRows(selectedReport,rows,breakdown),
    [selectedReport,rows,breakdown]
  );
  const moneyColumns=header.map((_,idx)=>(rows||[]).some(row=>reportPrintNumeric(row?.[idx])));
  const css=[
    '@media print {',
    ' @page { size: '+(landscape?'letter landscape':'letter portrait')+'; margin: 0.55in; }',
    ' html, body, #root { height: auto !important; min-height: 0 !important; overflow: visible !important; }',
    ' body * { visibility: hidden !important; }',
    ' .tbs-report-preview-overlay, .tbs-report-preview-overlay * { visibility: visible !important; }',
    ' .tbs-report-preview-overlay { position: static !important; display: block !important; inset: auto !important; overflow: visible !important; padding: 0 !important; background: transparent !important; }',
    ' .tbs-report-print-area { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; max-width: none !important; max-height: none !important; overflow: visible !important; border: 0 !important; padding: 0 !important; margin: 0 !important; box-shadow: none !important; }',
    ' .tbs-report-print-actions { display: none !important; }',
    ' .tbs-report-page { break-inside: auto !important; page-break-inside: auto !important; }',
    ' .tbs-report-page + .tbs-report-page { break-before: page !important; page-break-before: always !important; }',
    ' .tbs-report-table { width: 100% !important; table-layout: fixed !important; border-collapse: collapse !important; }',
    ' .tbs-report-table thead { display: table-header-group !important; }',
    ' .tbs-report-table tr { break-inside: avoid !important; page-break-inside: avoid !important; }',
    ' .tbs-report-table td, .tbs-report-table th { overflow-wrap: anywhere !important; word-break: normal !important; }',
    ' .tbs-report-page, .tbs-report-table, .tbs-report-table td, .tbs-report-table th { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }',
    '}',
  ].join('\n');

  return createPortal(
    <div className="tbs-report-preview-overlay" style={{position:'fixed',inset:0,zIndex:120,
      background:'rgba(0,0,0,0.55)',display:'flex',justifyContent:'center',
      alignItems:'center',padding:18,boxSizing:'border-box'}}>
      <div className="tbs-report-print-area" id="tbs-report-print-area"
        style={{width:landscape?'min(1100px, 100%)':'min(830px, 100%)',
          maxHeight:'92vh',overflowY:'auto',overflowX:'auto',
          boxSizing:'border-box',borderRadius:8,background:'#fff',padding:'24px 30px',
          boxShadow:'0 14px 35px rgba(0,0,0,.18)',fontFamily:"'Inter', system-ui, sans-serif",
          color:'#1B2333',fontSize:12}}>
        <div className="tbs-report-print-actions" style={{display:'flex',alignItems:'center',
          justifyContent:'flex-end',gap:10,marginBottom:18}}>
          <button type="button" onClick={()=>window.print()}
            style={{background:'#17365D',color:'#fff',border:'none',borderRadius:5,
              padding:'9px 15px',fontWeight:600,cursor:'pointer'}}>Print / Save PDF</button>
          <button type="button" onClick={onClose}
            style={{background:'#fff',color:'#17365D',border:'1px solid #D2D9E1',
              borderRadius:5,padding:'9px 15px',cursor:'pointer'}}>Close</button>
        </div>
        {sections.map((block,blockIndex)=>{
          const subHeader=block.columns.map(i=>header[i]);
          const amountColumns=block.columns.map(i=>moneyColumns[i]);
          return <div className="tbs-report-page" key={blockIndex}>
            <div style={{margin:'10px 0 16px'}}>
              <div style={{fontFamily:"'Source Serif 4',Georgia,serif",fontSize:25,
                fontWeight:600,color:'#14213D',lineHeight:1.2,overflowWrap:'anywhere'}}>
                {businessName}</div>
              <div style={{fontSize:15,color:'#5B6472',fontWeight:500,marginTop:7,
                overflowWrap:'anywhere'}}>{title}</div>
              {sections.length>1&&<div style={{fontSize:11,color:'#64748B',marginTop:5}}>
                Breakdown: columns {blockIndex*4+1}–{Math.min((blockIndex+1)*4,header.length-2)}
                {' '}of {header.length-2}
              </div>}
              <div style={{borderBottom:'2px solid #B08D57',marginTop:15}}/>
            </div>
            <table className="tbs-report-table"
              style={{width:'100%',fontSize:landscape?11:12,borderCollapse:'collapse',tableLayout:'fixed'}}>
              <colgroup>{subHeader.map((_,ci)=><col key={ci}
                style={{width:ci===1 && subHeader.length>=3?'34%':
                  ci===0 && subHeader.length>=3?'10%':undefined}}/>)}</colgroup>
              <thead>
                <tr style={{background:'#F3F5F8',borderBottom:'2px solid #D4DAE2'}}>
                  {subHeader.map((name,i)=><th key={i}
                    style={{textAlign:amountColumns[i]?'right':'left',
                      fontWeight:700,color:'#344256',padding:'10px 7px',fontSize:11,
                      verticalAlign:'bottom',overflowWrap:'anywhere'}}>{name}</th>)}
                </tr>
              </thead>
              <tbody>
                {presented.map((item,ri)=>{
                  const kind=item.kind;
                  if(kind==='section')return <tr key={ri} style={{background:'#F0F1F3'}}>
                    <td colSpan={subHeader.length} style={{padding:'9px 7px',
                      fontSize:12,color:'#5E6979',fontWeight:700,
                      borderBottom:'1px solid #DFE4EB'}}>{item.cells[1]}</td>
                  </tr>;
                  return <tr key={ri} style={{
                    background:kind==='total'?'#F6F8FB':'#fff',
                    borderTop:kind==='total'?'1px solid #CBD5E1':'none',
                    borderBottom:kind==='total'?'1px solid #DDE3EA':'1px solid #F0F1F3',
                    fontWeight:kind==='total'?700:400,
                  }}>
                    {block.columns.map((fullIndex,ci)=>{
                      const cell=item.cells[fullIndex];
                      return <td key={ci} style={{padding:'7px 7px',verticalAlign:'top',
                        fontVariantNumeric:'tabular-nums',
                        textAlign:reportPrintNumeric(cell)||amountColumns[ci]?'right':'left',
                        whiteSpace:reportPrintNumeric(cell)?'nowrap':'normal',
                        color:kind==='total'?'#14213D':'#334155',
                        overflowWrap:'anywhere'}}>{reportPrintCell(cell)}</td>;
                    })}
                  </tr>;
                })}
                {presented.length===0&&<tr><td colSpan={subHeader.length}
                  style={{padding:14,color:'#64748B'}}>No entries for the selected period.</td></tr>}
              </tbody>
            </table>
            <div style={{fontSize:10,color:'#64748B',marginTop:14,
              paddingTop:8,borderTop:'1px solid #E2E5E9'}}>
              Financial Reports · Amounts in USD · All monetary columns show $ and two decimals
            </div>
          </div>;
        })}
      </div>
      <style>{css}</style>
    </div>,
    document.body
  );
}
