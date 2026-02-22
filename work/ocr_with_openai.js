const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const files = [
  '/Users/yadvinder.singh/Downloads/STATUS CERT/TSCC 2444 - Bylaw 1.pdf',
  '/Users/yadvinder.singh/Downloads/STATUS CERT/TSCC 2444 - Bylaw 2.pdf',
  '/Users/yadvinder.singh/Downloads/STATUS CERT/TSCC 2444-By-law 3.pdf',
  '/Users/yadvinder.singh/Downloads/STATUS CERT/TSCC 2444- Declaration.pdf',
  '/Users/yadvinder.singh/Downloads/STATUS CERT/TSCC 2444- Budget package 2025-2026.pdf',
  '/Users/yadvinder.singh/Downloads/STATUS CERT/TSCC 2444 - 2025 NOFF.pdf'
];

const outDir = '/Users/yadvinder.singh/Documents/New project/work/statuscert-text';
fs.mkdirSync(outDir, { recursive: true });

async function run() {
  for (const filePath of files) {
    const base = path.basename(filePath).replace(/\.pdf$/i, '.ocr.txt');
    const outPath = path.join(outDir, base);
    try {
      const uploaded = await client.files.create({
        file: fs.createReadStream(filePath),
        purpose: 'user_data'
      });

      const response = await client.responses.create({
        model: 'gpt-4.1-mini',
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'Extract readable text from this PDF. Return plain text only. Preserve legal clauses and headings where possible.'
              },
              {
                type: 'input_file',
                file_id: uploaded.id
              }
            ]
          }
        ]
      });

      const text = response.output_text || '';
      fs.writeFileSync(outPath, text, 'utf8');
      console.log('OK', filePath, 'chars', text.length);
    } catch (err) {
      console.log('ERR', filePath, err.message);
    }
  }
}

run();
