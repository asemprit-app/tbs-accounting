// Paginate actual text/table rows; never capture scroll containers or print CSS.
export function drawRegisterPdf(JsPdf, { title, headings = [], tables = [] }) {
  if (!tables.some(t => t.rows?.length)) throw new Error('No register rows to export.');
  const landscape = tables.some(t => t.headers.length > 6);
  const doc = new JsPdf({ unit: 'pt', format: 'letter', orientation: landscape ? 'landscape' : 'portrait' });
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight();
  const margin = 30, available = width - margin * 2;
  let y = margin;
  const write = (value, x, atY, size = 9, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size);
    doc.text(value, x, atY);
  };
  const newPage = () => { doc.addPage(); y = margin; };
  const paragraph = value => {
    doc.setFontSize(10);
    for (const line of doc.splitTextToSize(String(value || ''), available)) {
      if (y + 14 > height - margin) newPage();
      write(line, margin, y, 10); y += 14;
    }
  };
  paragraph(title);
  headings.filter(Boolean).forEach(paragraph);
  for (const table of tables) {
    const columns = Math.max(table.headers.length, ...table.rows.map(r => r.length));
    if (!columns) continue;
    const colWidth = available / columns;
    const wrap = cells => cells.map(v => { doc.setFontSize(7); return doc.splitTextToSize(String(v ?? '').trim(), colWidth - 6); });
    const paint = (wrapped, bold = false, start = 0, count = Infinity) => {
      const lineCount = Math.min(count, Math.max(1, ...wrapped.map(c => c.length)) - start);
      wrapped.forEach((lines, i) => {
        const segment = lines.slice(start, start + lineCount);
        if (segment.length) write(segment, margin + i * colWidth + 3, y, 7, bold);
      });
      y += lineCount * 9 + 6;
      doc.setDrawColor(215, 220, 225); doc.line(margin, y - 5, width - margin, y - 5);
    };
    const header = wrap(table.headers);
    const headerHeight = Math.max(1, ...header.map(c => c.length)) * 9 + 6;
    const repeatHeader = () => { if (table.headers.length) paint(header, true); };
    if (y + headerHeight + 24 > height - margin) newPage();
    repeatHeader();
    for (const row of table.rows) {
      const wrapped = wrap(row);
      const lines = Math.max(1, ...wrapped.map(c => c.length));
      let start = 0;
      while (start < lines) {
        let fit = Math.floor((height - margin - y - 6) / 9);
        if (fit < 1) { newPage(); repeatHeader(); fit = Math.floor((height - margin - y - 6) / 9); }
        const count = Math.min(fit, lines - start);
        paint(wrapped, false, start, count); start += count;
        if (start < lines) { newPage(); repeatHeader(); }
      }
    }
    y += 10;
  }
  return doc;
}

export function assertNonblankPdfPages(doc) {
  // jsPDF native text uses Tj/TJ operators. Reject any page without text before
  // serializing an email attachment or opening a print preview.
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    const stream = doc.internal.pages[page].join('\n');
    if (!/\([^)]*\S[^)]*\)\s*Tj|\[[^\]]*\S[^\]]*\]\s*TJ/.test(stream))
      throw new Error('A blank PDF page was detected; export was cancelled.');
  }
  return doc;
}
