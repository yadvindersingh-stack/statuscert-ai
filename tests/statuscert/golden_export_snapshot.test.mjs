import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import JSZip from 'jszip';

const require = createRequire(import.meta.url);
const { buildStatusCertDocxBuffer } = require('../../dist/lib/statuscert/docx.js');

async function normalizedXmlHash(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  const normalized = xml.replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

test('golden export xml hash remains stable for fixture input', async () => {
  const result = await buildStatusCertDocxBuffer({
    firmName: 'Golden Firm',
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
      insurance_term: 'May 18, 2025 to May 18, 2026',
      reserve_fund_study_date: 'February 2025',
      reserve_fund_next_due: 'February 2028'
    },
    template: { title: 'Status', disclaimers: [], sections: [] },
    sections: [
      { key: 'summary', title: 'Summary', instructions: '', style: 'structured', content: '- sample' },
      { key: 'follow_ups', title: 'Flags / Follow-ups', instructions: '', style: 'structured', content: '- NONE' }
    ],
    flags: []
  });

  const hash = await normalizedXmlHash(result.buffer);
  // Deliberately pinned to catch accidental export regressions.
  assert.equal(hash, '4e4da147ecd4c9ee4f175fb98a02ead431ef1b4fa342fe093f30daea251d3319');
});
