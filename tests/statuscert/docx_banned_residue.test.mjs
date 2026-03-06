import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import JSZip from 'jszip';

const require = createRequire(import.meta.url);
const { buildStatusCertDocxBuffer } = require('../../dist/lib/statuscert/docx.js');

async function extractText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

test('export strips instruction scaffold residue', async () => {
  const result = await buildStatusCertDocxBuffer({
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
      special_assessments: 'NONE',
      fee_increases: '2.2% increase',
      insurance_term: 'May 18, 2025 to May 18, 2026'
    },
    template: { title: 'Status', disclaimers: [], sections: [] },
    sections: [
      { key: 'summary', title: 'Summary', instructions: '', style: 'structured', content: '- sample' },
      { key: 'follow_ups', title: 'Flags / Follow-ups', instructions: '', style: 'structured', content: '- NONE' }
    ],
    flags: []
  });

  const text = await extractText(result.buffer);
  assert.equal(text.includes('Unit __, Level __'), false);
  assert.equal(text.includes('Yes or No'), false);
  assert.equal(text.includes('$ ____'), false);
  assert.equal(text.includes('CURRENT OWNER IN DEFAULT OF $___'), false);
  assert.equal(text.includes('special assessment/loan/increased common expenses or a combination'), false);
  assert.deepEqual(result.diagnostics.bannedResidueHits, []);
});

