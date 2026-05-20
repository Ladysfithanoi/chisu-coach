import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync, writeFileSync } from 'fs';

const PDF_PATH = 'C:/Users/Admin/Downloads/VTN_FCT_2007.pdf';
const OUT_TS   = 'C:/Users/Admin/Desktop/diet-plan/lib/foods-data.ts';

// TCVN3 → Unicode mapping (Windows-1252 code points → Vietnamese Unicode)
// Uses Unicode escapes to avoid source-file encoding ambiguity.
// Confirmed mappings marked [C]; others inferred from TCVN3 block pattern.
const TCVN3 = {
  // ── Base modified vowels + đ ─────────────────────────────────────────────
  '§': 'Đ',  // § → Đ (uppercase, confirmed from "Đậu", "Đào")     [C]
  '¨': 'ă',  // ¨ → ă                                               [C]
  '©': 'â',  // © → â (confirmed from "nhân")                       [C]
  'ª': 'ê',  // ª → ê (confirmed from "Tên", "Kê")                  [C]
  '«': 'ô',  // « → ô (confirmed from "Ngô")                        [C]
  '¬': 'ơ',  // ¬ → ơ (confirmed from "tươi")                       [C]
  '­': 'ư',  // soft-hyphen → ư (confirmed from "dưỡng")            [C]
  '®': 'đ',  // ® → đ (confirmed from "đa nem", "đúc")              [C]
  '−': 'ư',  // − (minus sign) → ư alternative encoding
  '–': 'ư',  // – (en dash) → ư alternative encoding
  '—': 'ư',  // — (em dash) → ư alternative encoding

  // ── a tonal variants (huyền, hỏi, ngã, sắc, nặng) ──────────────────────
  'µ': 'à',  // µ → à (confirmed from "vàng")                       [C]
  'μ': 'à',  // μ → à (Greek mu used by some pdfjs versions)        [C]
  '¶': 'ả',  // ¶ → ả (confirmed from "Thải")                       [C]
  '·': 'ã',  // · → ã (confirmed from "giã")                        [C]
  '¸': 'á',  // ¸ → á (confirmed from "Bánh", "cái")                [C]
  '¹': 'ạ',  // ¹ → ạ (confirmed from "Gạo", "hạt")                 [C]

  // ── ă tonal variants ─────────────────────────────────────────────────────
  '»': 'ằ',  // » → ằ
  '¼': 'ẳ',  // ¼ → ẳ
  '½': 'ẵ',  // ½ → ẵ
  '¾': 'ắ',  // ¾ → ắ (confirmed from "bắp")                        [C]
  '¿': 'ặ',  // ¿ → ặ
  'Æ': 'ặ',  // Æ → ặ (confirmed from "đặc" in "sữa đặc")           [C]

  // ── â tonal variants ─────────────────────────────────────────────────────
  'Ç': 'ầ',  // Ç → ầ (confirmed from "phần")                       [C]
  'È': 'ẩ',  // È → ẩ (confirmed from "phẩm")                       [C]
  'É': 'ẫ',  // É → ẫ
  'Ê': 'ấ',  // Ê → ấ
  'Ë': 'ậ',  // Ë → ậ

  // ── e tonal variants ─────────────────────────────────────────────────────
  'Í': 'è',  // Í → è
  'Î': 'ẻ',  // Î → ẻ (confirmed from "tẻ")                         [C]
  'Ï': 'ẽ',  // Ï → ẽ
  'Ð': 'é',  // Ð → é
  'Ñ': 'ẹ',  // Ñ → ẹ

  // ── ê tonal variants ─────────────────────────────────────────────────────
  'Ò': 'ề',  // Ò → ề
  'Ó': 'ể',  // Ó → ể
  'Ô': 'ễ',  // Ô → ễ
  'Õ': 'ế',  // Õ → ế (confirmed from "nếp", "tiếng")               [C]
  'Ö': 'ệ',  // Ö → ệ
  '×': 'ì',  // × → ì (confirmed from "bột mì", "bì lợn", "xì dầu")[C]

  // ── i tonal variants ─────────────────────────────────────────────────────
  'Ì': 'ì',  // Ì → ì (U+00CC - confirmed from "Cá mì", "Dầu mì")     [C]
  'Ú': 'ì',  // Ú → ì (huyền - alternative position)
  'Û': 'ỉ',  // Û → ỉ
  'Ü': 'ĩ',  // Ü → ĩ
  'Ý': 'í',  // Ý → í
  'Þ': 'ị',  // Þ → ị (confirmed from "thịt")                       [C]

  // ── o tonal variants ─────────────────────────────────────────────────────
  'à': 'ò',  // à → ò
  'á': 'ỏ',  // á → ỏ (confirmed from "bỏ")                         [C]
  'â': 'õ',  // â → õ
  'ã': 'ó',  // ã → ó
  'ä': 'ọ',  // ä → ọ

  // ── ô tonal variants ─────────────────────────────────────────────────────
  'å': 'ồ',  // å → ồ
  'æ': 'ổ',  // æ → ổ
  'ç': 'ỗ',  // ç → ỗ
  'è': 'ố',  // è → ố
  'é': 'ộ',  // é → ộ

  // ── ơ tonal variants ─────────────────────────────────────────────────────
  'ê': 'ờ',  // ê → ờ (confirmed from "thường")                     [C]
  'ë': 'ở',  // ë → ở
  'ì': 'ỡ',  // ì → ỡ (confirmed from "dưỡng")                      [C]
  'í': 'ớ',  // í → ớ
  'î': 'ợ',  // î → ợ (confirmed from "được")                       [C]

  // ── u tonal variants (block 0xF0-0xF4, sắc confirmed at 0xF3) ──────────
  'ï': 'ù',  // ï → ù (huyền - may be at EF)
  'ð': 'ù',  // ð → ù (huyền - alt position)
  'ñ': 'ủ',  // ñ → ủ (hỏi - FIXED from ũ)                         [C]
  'ò': 'ũ',  // ò → ũ (ngã - FIXED from ú)
  'ó': 'ú',  // ó → ú (sắc - confirmed from "đúc")                  [C]
  'ô': 'ụ',  // ô → ụ (nặng)

  // ── ư tonal variants (block 0xF5-0xF9, sắc+nặng confirmed) ─────────────
  'õ': 'ừ',  // õ → ừ
  'ö': 'ử',  // ö → ử
  '÷': 'ữ',  // ÷ → ữ
  'ø': 'ứ',  // ø → ứ (confirmed from "lứt")                        [C]
  'ù': 'ự',  // ù → ự (confirmed from "thực")                       [C]

  // ── y tonal variants ─────────────────────────────────────────────────────
  'ú': 'ỳ',  // ú → ỳ (confirmed from "bánh mỳ")                   [C]
  'û': 'ỷ',  // û → ỷ
  'ü': 'ỹ',  // ü → ỹ
  'ý': 'ý',  // ý → ý
  'þ': 'ỵ',  // þ → ỵ
};

function decodeTCVN3(str) {
  return str.split('').map(c => {
    const mapped = TCVN3[c];
    return mapped !== undefined ? mapped : c;
  }).join('');
}

async function getLines(pdf, pageNum) {
  const page = await pdf.getPage(pageNum);
  const tc   = await page.getTextContent();
  const rows = new Map();
  for (const item of tc.items) {
    if (!item.str.trim()) continue;
    const y = Math.round(item.transform[5] / 4) * 4;
    const x = item.transform[4];
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push({ x, str: item.str });
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([y, items]) => ({
      y,
      line: items.sort((a, b) => a.x - b.x).map(i => i.str).join('')
    }));
}

async function extractFood(pdf, pageNum) {
  const lines = await getLines(pdf, pageNum);
  const allText = lines.map(l => l.line).join('\n');

  // Must contain STT marker
  const sttMatch = allText.match(/STT:(\d+)/);
  if (!sttMatch) return null;

  // Must have nutritional values
  const kcalMatch   = allText.match(/KCal(\d+\.?\d*)/);
  const proteinMatch = allText.match(/Proteing(-|\d+\.?\d*)/);
  const fatMatch    = allText.match(/Lipid\(Fat\)g(-|\d+\.?\d*)/);
  const carbsMatch  = allText.match(/Glucid\(Carbohydrate\)g(-|\d+\.?\d*)/);
  if (!kcalMatch || !proteinMatch || !fatMatch || !carbsMatch) return null;

  // ── Extract Vietnamese name ──────────────────────────────────────────────────
  let viNameRaw = '';
  const vnLabelIdx = lines.findIndex(l => l.line.includes('(Vietnamese)'));
  if (vnLabelIdx >= 0) {
    const vnLabelLine = lines[vnLabelIdx].line;
    // Pattern A: name is on the same line between label and STT
    const inlineM = vnLabelLine.match(/\(Vietnamese\):(.*?)STT:/);
    if (inlineM && inlineM[1].trim()) {
      viNameRaw = inlineM[1].trim();
    } else {
      // Pattern B: name is on the very next line
      if (vnLabelIdx + 1 < lines.length) {
        const nextLine = lines[vnLabelIdx + 1].line;
        // Skip if it's another label line
        if (!nextLine.includes('(English)') && !nextLine.includes('M·') && nextLine.trim()) {
          viNameRaw = nextLine.trim();
        }
      }
    }
  }

  // ── Extract English name ────────────────────────────────────────────────────
  let enName = '';
  const enLabelIdx = lines.findIndex(l => l.line.includes('(English)'));
  if (enLabelIdx >= 0) {
    const enLine = lines[enLabelIdx].line;
    // Remove everything before "(English):"
    const afterLabel = enLine.replace(/^.*\(English\):/, '');
    // Remove trailing "M· sè:XXXX" (TCVN3 for "Mã số:")
    enName = afterLabel.replace(/M[·µ-¹].*$/, '').trim();
    // Fallback: if still has garbled, cut at first occurrence of high-byte char after clean text
    if (!enName) {
      enName = afterLabel.replace(/[-￿].*$/, '').trim();
    }
  }

  const viNameDecoded = decodeTCVN3(viNameRaw);

  // Use decoded Vietnamese name as primary; fall back to English
  const displayName = viNameDecoded && viNameDecoded.trim() ? viNameDecoded.trim() : enName;

  const parseVal = (s) => (s === '-' || !s) ? 0 : parseFloat(s);

  return {
    stt: parseInt(sttMatch[1]),
    name: displayName,
    nameEn: enName,
    calories: parseFloat(kcalMatch[1]),
    protein:  parseVal(proteinMatch[1]),
    fat:      parseVal(fatMatch[1]),
    carbs:    parseVal(carbsMatch[1]),
  };
}

async function main() {
  const buf   = readFileSync(PDF_PATH);
  const uint8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const pdf   = await pdfjsLib.getDocument({ data: uint8, password: '' }).promise;
  console.log('Total pages:', pdf.numPages);

  const foods = [];
  const errors = [];

  for (let p = 14; p <= pdf.numPages; p++) {
    try {
      const food = await extractFood(pdf, p);
      if (food) {
        foods.push(food);
        if (foods.length % 50 === 0) process.stdout.write(`\r  Extracted: ${foods.length} foods (page ${p})...`);
      }
    } catch (e) {
      errors.push({ page: p, error: e.message });
    }
  }
  console.log(`\nDone. Extracted ${foods.length} foods. Errors on ${errors.length} pages.`);
  if (errors.length > 0 && errors.length <= 10) {
    errors.forEach(e => console.log(`  Page ${e.page}: ${e.error}`));
  }

  // Sort by STT
  foods.sort((a, b) => a.stt - b.stt);

  // Print first 10 for review
  console.log('\nSample foods:');
  foods.slice(0, 10).forEach(f => {
    console.log(`  #${f.stt}: "${f.name}" | en="${f.nameEn}" | ${f.calories}kcal P${f.protein} F${f.fat} C${f.carbs}`);
  });

  // Generate TypeScript
  const tsLines = [
    'export interface FoodItem {',
    '  name: string;',
    '  nameEn?: string;',
    '  calories: number; // per 100g',
    '  protein: number;  // per 100g',
    '  fat: number;      // per 100g',
    '  carbs: number;    // per 100g',
    '}',
    '',
    `// Auto-generated from VTN_FCT_2007.pdf — ${foods.length} foods`,
    'export const FOODS: FoodItem[] = [',
  ];

  for (const f of foods) {
    const nameSafe  = f.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const nameEnSafe = (f.nameEn || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const enPart = nameEnSafe ? `, nameEn: '${nameEnSafe}'` : '';
    tsLines.push(
      `  { name: '${nameSafe}'${enPart}, calories: ${f.calories}, protein: ${f.protein}, fat: ${f.fat}, carbs: ${f.carbs} },`
    );
  }

  tsLines.push('];');
  tsLines.push('');

  writeFileSync(OUT_TS, tsLines.join('\n'), 'utf8');
  console.log(`\nWritten to ${OUT_TS}`);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
