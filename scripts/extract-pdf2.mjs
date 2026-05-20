import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync, writeFileSync } from 'fs';

const PDF_PATH  = 'C:/Users/Admin/Downloads/VTN_FCT_2007.pdf';
const OUT_PATH  = 'C:/Users/Admin/Desktop/diet-plan/scripts/raw-lines.txt';

async function getLines(pdf, pageNum) {
  const page = await pdf.getPage(pageNum);
  const tc   = await page.getTextContent();

  // Group items by Y (±4px tolerance)
  const rows = new Map();
  for (const item of tc.items) {
    if (!item.str.trim()) continue;
    const y = Math.round(item.transform[5] / 4) * 4;
    const x = item.transform[4];
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push({ x, str: item.str });
  }

  // Sort rows top-to-bottom, items left-to-right; join text
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0]) // descending Y = top first
    .map(([y, items]) => {
      const line = items.sort((a, b) => a.x - b.x).map(i => i.str).join('');
      return { y, line };
    });
}

async function main() {
  const buf   = readFileSync(PDF_PATH);
  const uint8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const pdf   = await pdfjsLib.getDocument({ data: uint8, password: '' }).promise;
  console.log('Total pages:', pdf.numPages);

  // Sample data pages to understand table structure
  let out = '';
  for (let p = 14; p <= 30; p++) {
    const lines = await getLines(pdf, p);
    out += `\n\n====PAGE ${p}====\n`;
    for (const { y, line } of lines) {
      out += `[y${y}] ${line}\n`;
    }
  }
  writeFileSync(OUT_PATH, out, 'utf8');
  console.log('Written to', OUT_PATH);
  // Also print pages 14-16
  const lines14 = await getLines(pdf, 14);
  console.log('\n=== PAGE 14 ===');
  lines14.forEach(l => console.log(l.line));
  const lines15 = await getLines(pdf, 15);
  console.log('\n=== PAGE 15 ===');
  lines15.forEach(l => console.log(l.line));
}

main().catch(e => console.error('ERROR:', e.message, e.stack));
