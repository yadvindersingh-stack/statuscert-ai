import { readFile, writeFile } from 'node:fs/promises';
import JSZip from 'jszip';

const sourcePath = process.argv[2];
const outputPath = process.argv[3] || 'templates/statuscert-precedent-template.docx';
if (!sourcePath) {
  console.error('Usage: node scripts/create-precedent-template.mjs <source-docx> [output-docx]');
  process.exit(1);
}

const src = await readFile(sourcePath);
const zip = await JSZip.loadAsync(src);
const file = zip.file('word/document.xml');
if (!file) throw new Error('word/document.xml missing');
let xml = await file.async('string');

// Matter title line
xml = xml.replace(/<w:t>[^<]*University Ave\., Toronto, ON<\/w:t>/, '<w:t>{{MATTER_TITLE}}</w:t>');

// Date note line
xml = xml.replace(
  /<w:t xml:space="preserve">\*Please note this review is based on a status certificate dated [^<]*<\/w:t>/,
  '<w:t xml:space="preserve">*Please note this review is based on a status certificate dated {{GENERATED_DATE}}.<\/w:t>'
);

// Replace table body rows with APS block marker while preserving header row.
xml = xml.replace(/(<w:tbl>[\s\S]*?<w:tr[\s\S]*?<\/w:tr>)([\s\S]*?)(<\/w:tbl>)/, '$1<!--APS_ROWS_BLOCK-->$3');

// Insert section and flags markers after Notes heading paragraph, remove old note paragraphs.
const notesHeading = /(<w:p[\s\S]*?<w:t>Notes, Rules &amp; Regulations<\/w:t>[\s\S]*?<\/w:p>)([\s\S]*?)(<w:sectPr[\s\S]*<\/w:sectPr>)/;
const flagsBlock = `
<!--SECTIONS_BLOCK-->
<w:p><w:r><w:t>Flags / Follow-ups</w:t></w:r></w:p>
<w:tbl>
  <w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr>
  <w:tblGrid><w:gridCol w:w="2800"/><w:gridCol w:w="1200"/><w:gridCol w:w="2400"/><w:gridCol w:w="2400"/></w:tblGrid>
  <w:tr>
    <w:tc><w:p><w:r><w:t>Flag</w:t></w:r></w:p></w:tc>
    <w:tc><w:p><w:r><w:t>Severity</w:t></w:r></w:p></w:tc>
    <w:tc><w:p><w:r><w:t>Why it matters</w:t></w:r></w:p></w:tc>
    <w:tc><w:p><w:r><w:t>Follow-up</w:t></w:r></w:p></w:tc>
  </w:tr>
  <!--FLAGS_ROWS_BLOCK-->
</w:tbl>
`;
xml = xml.replace(notesHeading, `$1${flagsBlock}$3`);

zip.file('word/document.xml', xml);
const out = await zip.generateAsync({ type: 'nodebuffer' });
await writeFile(outputPath, out);
console.log('Template generated:', outputPath);
