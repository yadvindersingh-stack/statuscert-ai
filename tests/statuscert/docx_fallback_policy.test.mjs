import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildStatusCertDocxBuffer } = require('../../dist/lib/statuscert/docx.js');

test('fallback policy is deterministic for missing fields', async () => {
  const result = await buildStatusCertDocxBuffer({
    firmName: 'Test Firm',
    matterTitle: 'Matter',
    generatedAt: new Date('2026-03-03T00:00:00Z'),
    extracted: {
      legal_proceedings: ''
    },
    template: { title: 'Status', disclaimers: [], sections: [] },
    sections: [
      { key: 'summary', title: 'Summary', instructions: '', style: 'structured', content: '- sample' },
      { key: 'follow_ups', title: 'Flags / Follow-ups', instructions: '', style: 'structured', content: '- NONE' }
    ],
    flags: []
  });

  assert.ok(result.diagnostics.requiredFieldsMissing.includes('property_unit'));
  assert.ok(result.diagnostics.requiredFieldsMissing.includes('corporation'));
  assert.ok(result.diagnostics.fallbackFieldsUsed.includes('parking_unit'));
  assert.ok(result.diagnostics.fallbackFieldsUsed.includes('locker_unit'));
  assert.ok(result.diagnostics.fallbackFieldsUsed.includes('bike_unit'));
});

