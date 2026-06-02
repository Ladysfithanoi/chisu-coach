/**
 * Extracts (STT, foodName) pairs from the DOCX index table,
 * then merges with the existing lib/foods-data.ts to improve name quality.
 */
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const DOCX_XML = 'C:/Users/Admin/Desktop/chisu/scripts/docx-extract/word/document.xml';
const FOODS_TS = 'C:/Users/Admin/Desktop/chisu/lib/foods-data.ts';

// TCVN3 map (same as extraction script)
const TCVN3 = {
  '§':'Đ','¨':'ă','©':'â','ª':'ê','«':'ô','¬':'ơ','­':'ư','®':'đ',
  '−':'ư','–':'ư','—':'ư','µ':'à','μ':'à','¶':'ả','·':'ã','¸':'á','¹':'ạ',
  '»':'ằ','¼':'ẳ','½':'ẵ','¾':'ắ','¿':'ặ','Æ':'ặ',
  'Ç':'ầ','È':'ẩ','É':'ẫ','Ê':'ấ','Ë':'ậ',
  'Í':'è','Î':'ẻ','Ï':'ẽ','Ð':'é','Ñ':'ẹ',
  'Ò':'ề','Ó':'ể','Ô':'ễ','Õ':'ế','Ö':'ệ','×':'ì',
  'Ì':'ì','Ú':'ì','Û':'ỉ','Ü':'ĩ','Ý':'í','Þ':'ị',
  'à':'ò','á':'ỏ','â':'õ','ã':'ó','ä':'ọ',
  'å':'ồ','æ':'ổ','ç':'ỗ','è':'ố','é':'ộ',
  'ê':'ờ','ë':'ở','ì':'ỡ','í':'ớ','î':'ợ',
  'ï':'ù','ð':'ù','ñ':'ủ','ò':'ũ','ó':'ú','ô':'ụ',
  'õ':'ừ','ö':'ử','÷':'ữ','ø':'ứ','ù':'ự',
  'ú':'ỳ','û':'ỷ','ü':'ỹ','ý':'ý','þ':'ỵ',
};
function decode(s) { return s.split('').map(c => TCVN3[c] ?? c).join(''); }

// Check if a string has TCVN3 artifacts
function hasGarble(s) {
  return /[¨©ªª«¬­®µ¶·¸¹»¼½¾¿ÆÇÈÉÊËÍÎÏÐÑÒÓÔÕÖàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþ]/.test(s);
}

// Read the DOCX XML in streaming chunks to extract the index table
const CHUNK = 512 * 1024;  // 512KB chunks
const fd = (() => {
  const { openSync } = readFileSync; // we need fs
  return null;
})();

// Since we can't stream easily in ESM, load the XML via a streaming approach with readline
// Actually for 121MB, let's use a line-based stream
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

async function readXMLChunks(startByte, length) {
  const buf = Buffer.alloc(length);
  const { openSync, readSync, closeSync } = await import('fs');
  const fd = openSync(DOCX_XML, 'r');
  const read = readSync(fd, buf, 0, length, startByte);
  closeSync(fd);
  return buf.slice(0, read).toString('utf8');
}

function extractTextRuns(xml) {
  const runs = [];
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    runs.push(m[1]);
  }
  return runs;
}

function extractTableRows(xml) {
  // Split by table row boundaries
  const rows = xml.split(/<w:tr[ >]/);
  return rows.map(row => {
    // Split into cells
    const cells = row.split(/<w:tc[ >]/);
    return cells.map(cell => {
      const texts = extractTextRuns(cell);
      return texts.join('');
    }).filter(c => c.trim());
  }).filter(r => r.length > 0);
}

async function main() {
  // The index table is in the first ~200KB of content after the header
  // Read a large chunk covering the index section
  const chunk1 = await readXMLChunks(285000, 100000);

  // Parse table rows from this chunk
  const rows = extractTableRows(chunk1);

  // The index table rows look like:
  // [code1, code2?, foodName, sttNum]  OR  [code, foodName, sttNum]
  const indexEntries = new Map(); // stt → name

  for (const row of rows) {
    if (row.length < 2) continue;
    const cells = row.map(c => c.trim()).filter(c => c);

    // Look for rows with a small integer STT at end and 4-digit code at start
    const firstCell = cells[0] || '';
    const lastCell  = cells[cells.length - 1] || '';
    const stt = parseInt(lastCell);
    const code = parseInt(firstCell);

    if (!isNaN(stt) && stt >= 1 && stt <= 526 &&
        !isNaN(code) && code >= 1001 && code <= 5999) {
      // Collect name from middle cells
      let nameParts = cells.slice(1, -1);
      // Sometimes code appears twice (old code + new code), skip second occurrence
      if (nameParts.length > 0 && /^\d{4}$/.test(nameParts[0])) {
        nameParts = nameParts.slice(1);
      }
      const rawName = nameParts.join(' ').replace(/\s+/g, ' ').trim();
      if (rawName && !rawName.match(/^\d+$/)) {
        const decoded = decode(rawName);
        indexEntries.set(stt, decoded);
      }
    }
  }

  console.log(`Index entries parsed: ${indexEntries.size}`);

  // Show sample
  [...indexEntries.entries()].slice(0, 20).forEach(([stt, name]) => {
    console.log(`  STT ${stt}: "${name}"`);
  });

  // Count how many are clean (no remaining TCVN3 artifacts after decode)
  let clean = 0, garbled = 0;
  for (const [, name] of indexEntries) {
    if (hasGarble(name)) garbled++;
    else clean++;
  }
  console.log(`\nClean: ${clean}, Still garbled: ${garbled}`);

  // Now read the existing foods-data.ts and merge
  const tsContent = readFileSync(FOODS_TS, 'utf8');
  const lines = tsContent.split('\n');

  // Update names where DOCX gives a cleaner version
  let improved = 0;
  const updatedLines = lines.map(line => {
    if (!line.trim().startsWith('{ name:')) return line;
    const sttMatch = line.match(/\/\/ stt:(\d+)/);
    // The foods-data.ts doesn't store STT - we need another way to match
    // Actually our generated file doesn't store STT in the output
    return line;
  });

  // Since we don't have STT in the TS file, we need to match by order
  // The foods are sorted by STT, so index in array = stt-1
  let foodIdx = 0;
  const finalLines = lines.map(line => {
    if (!line.trim().startsWith('{ name:')) return line;
    const stt = foodIdx + 1;
    foodIdx++;

    const docxName = indexEntries.get(stt);
    if (!docxName || hasGarble(docxName)) return line; // keep PDF version

    // Replace name with DOCX version if it's cleaner
    const pdfNameMatch = line.match(/name: '([^']+)'/);
    if (!pdfNameMatch) return line;
    const pdfName = pdfNameMatch[1];

    // Use DOCX name if it has fewer TCVN3 artifacts
    const pdfGarble = pdfName.split('').filter(c => TCVN3[c]).length;
    const docxGarble = docxName.split('').filter(c => TCVN3[c]).length;

    if (docxGarble < pdfGarble) {
      improved++;
      return line.replace(/name: '[^']+'/, `name: '${docxName.replace(/'/g, "\\'")}'`);
    }
    return line;
  });

  console.log(`\nNames improved from DOCX index: ${improved}`);
  if (improved > 0) {
    writeFileSync(FOODS_TS, finalLines.join('\n'), 'utf8');
    console.log('Updated lib/foods-data.ts');
  }
}

main().catch(e => { console.error('ERROR:', e.message); });
