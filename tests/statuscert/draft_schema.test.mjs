import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const editor = require('../../dist/lib/statuscert/editor.js');

test('canonicalizes legacy review sections to two-section contract', () => {
  const legacy = [
    { key: 'intro', title: 'Purpose and Scope', instructions: '', style: 'narrative', content: 'Legacy intro text' },
    { key: 'summary', title: 'Key Terms Summary', instructions: '', style: 'structured', content: 'Legacy key terms' },
    { key: 'followups', title: 'Follow-ups / Action Items', instructions: '', style: 'structured', content: '- item A\n- item B' }
  ];

  const canonical = editor.canonicalizeReviewSections(legacy, null);
  assert.equal(canonical.length, 2);
  assert.equal(canonical[0].key, 'summary');
  assert.equal(canonical[1].key, 'follow_ups');

  const reviewText = editor.sectionsToReviewText(canonical);
  assert.ok(reviewText.includes('## Summary'));
  assert.ok(reviewText.includes('## Flags / Follow-ups'));
  assert.ok(!reviewText.includes('Purpose and Scope'));
  assert.ok(!reviewText.includes('Key Terms Summary'));
});
