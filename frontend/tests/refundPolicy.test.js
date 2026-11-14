import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the refund policy page is routed, written, and linked from the footer', () => {
  assert.match(read('../src/App.jsx'), /<Route path="\/refund-policy" element=\{<InformationPage \/>} \/>/);
  assert.match(read('../src/components/Footer.jsx'), /to="\/refund-policy"/);

  const page = read('../src/pages/InformationPage.jsx');
  assert.match(page, /'\/refund-policy': \{/);
  for (const heading of ['When you are entitled to a refund', 'When a refund is not available', 'How to request a refund', 'How refunds are paid']) {
    assert.ok(page.includes(heading), `missing section: ${heading}`);
  }
});
