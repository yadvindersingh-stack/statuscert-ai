#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

async function loadDocx(docPath) {
  const buf = fs.readFileSync(docPath);
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml').async('string');
  return xml;
}

function stripTags(xml) {
  return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function placeholders(text) {
  return Array.from(new Set((text.match(/\[[^\]]+\]/g) || []).map((v) => v.trim())));
}

function usageMap(templateTokens, generatedText) {
  return templateTokens.map((token) => ({
    token,
    status: generatedText.includes(token) ? 'UNRESOLVED' : 'REPLACED_OR_REMOVED'
  }));
}

async function main() {
  const [, , templatePath, generatedPath] = process.argv;
  if (!templatePath || !generatedPath) {
    console.error('Usage: node scripts/statuscert/docx-diff-report.mjs <template.docx> <generated.docx>');
    process.exit(1);
  }

  const templateXml = await loadDocx(path.resolve(templatePath));
  const generatedXml = await loadDocx(path.resolve(generatedPath));
  const templateText = stripTags(templateXml);
  const generatedText = stripTags(generatedXml);

  const templateTokens = placeholders(templateText);
  const generatedTokens = placeholders(generatedText);
  const coverage = usageMap(templateTokens, generatedText);

  const unresolved = coverage.filter((item) => item.status === 'UNRESOLVED').map((item) => item.token);

  const report = {
    template: path.resolve(templatePath),
    generated: path.resolve(generatedPath),
    templateTokenCount: templateTokens.length,
    generatedPlaceholderCount: generatedTokens.length,
    unresolvedTemplateTokens: unresolved,
    coverage
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
