import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import JSZip from 'jszip';

const require = createRequire(import.meta.url);
const { buildStatusCertDocxBuffer } = require('../../dist/lib/statuscert/docx.js');

async function extractCellValue(buffer, rowTitle) {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  const rowRegex = /<w:tr\b[\s\S]*?<\/w:tr>/g;
  const rows = xml.match(rowRegex) || [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map((cell) =>
      cell[0]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/\s+/g, ' ')
        .trim()
    );
    if (cells.length >= 2 && cells[0] === rowTitle) return cells[1];
  }
  return '';
}

function baseInput(specialAssessmentValue) {
  return {
    firmName: 'Test Firm',
    matterTitle: '75 St. Nicholas Street, Unit 302, Toronto, Ontario',
    generatedAt: new Date('2026-03-03T00:00:00Z'),
    extracted: {
      corporation_name: 'Toronto Standard Condominium Corporation No. 2444',
      unit: 'Unit 302',
      common_expenses: '$388.84',
      reserve_fund_balance: '$1,770,174.69',
      reserve_fund_balance_date: 'June 30, 2025',
      legal_proceedings: 'NONE',
      special_assessments: specialAssessmentValue,
      fee_increases: '2.2% increase',
      insurance_term: 'May 18, 2025 to May 18, 2026'
    },
    template: { title: 'Status', disclaimers: [], sections: [] },
    sections: [
      { key: 'summary', title: 'Summary', instructions: '', style: 'structured', content: '- sample' },
      { key: 'follow_ups', title: 'Flags / Follow-ups', instructions: '', style: 'structured', content: '- NONE' }
    ],
    flags: []
  };
}

test('special assessment mapping never produces dangling Yes dash', async () => {
  const cases = [
    { input: null, allowed: ['Not available'] },
    { input: '', allowed: ['Not available'] },
    { input: 'NONE', allowed: ['No'] },
    { input: 'Not found', allowed: ['No'] },
    { input: 'Yes', allowed: ['Yes'] },
    { input: 'Special assessment of $120,000 was approved.', allowed: ['Yes'] }
  ];

  for (const c of cases) {
    const result = await buildStatusCertDocxBuffer(baseInput(c.input));
    const rendered = await extractCellValue(result.buffer, 'Levied Special Assessments');
    assert.equal(rendered.includes('Yes -'), false);
    assert.ok(c.allowed.includes(rendered), `unexpected value for ${String(c.input)}: ${rendered}`);
  }
});

test('diagnostics include renderer version and special-assessment mapping values', async () => {
  const result = await buildStatusCertDocxBuffer(baseInput('NONE'));
  assert.equal(typeof result.diagnostics.exportRendererVersion, 'string');
  assert.ok(result.diagnostics.exportRendererVersion.length > 0);
  assert.equal(result.diagnostics.specialAssessmentRawValue, 'NONE');
  assert.equal(result.diagnostics.specialAssessmentRenderedValue, 'No');
});
