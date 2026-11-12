import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('chat composer sends text only while historical image messages remain viewable', () => {
  const page = readFileSync(new URL('../src/pages/MessagesPage.jsx', import.meta.url), 'utf8');
  const service = readFileSync(new URL('../src/services/messageService.js', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /type="file"|Attach images|uploadMessageImages|addFiles|setFiles|composer-attach|attachment-previews/);
  assert.doesNotMatch(service, /messages\/uploads|uploadMessageImages/);
  assert.match(page, /message: messageText.trim\(\)/);
  assert.match(page, /disabled=\{sending \|\| !messageText.trim\(\)\}/);
  assert.match(page, /item.message_type === 'image' && item.attachment_url/);
});
