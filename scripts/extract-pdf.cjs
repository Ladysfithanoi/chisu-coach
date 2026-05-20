const { PDFParse } = require('pdf-parse');
const fs = require('fs');

const PDF_PATH = 'C:/Users/Admin/Downloads/VTN_FCT_2007.pdf';

async function main() {
  const buf = fs.readFileSync(PDF_PATH);
  const parser = new PDFParse();
  try {
    const data = await parser.parse(buf, { max: 15 });
    console.log('=== TOTAL PAGES:', data.numpages, '===');
    console.log('=== TEXT SAMPLE (chars 0-5000) ===');
    console.log(JSON.stringify(data.text.substring(0, 5000)));
  } catch (e) {
    console.error('Parse error:', e.message);
    // try with password empty
    try {
      const data2 = await parser.parse(buf, { max: 15, password: '' });
      console.log('Pages (empty pwd):', data2.numpages);
      console.log(JSON.stringify(data2.text.substring(0, 3000)));
    } catch(e2) {
      console.error('Parse error (empty pwd):', e2.message);
    }
  }
}

main();
