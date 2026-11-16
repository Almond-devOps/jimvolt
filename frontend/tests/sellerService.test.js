import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const service = readFileSync(new URL('../src/services/sellerService.js', import.meta.url), 'utf8');

test('exposes the username availability endpoint', () => {
  assert.match(
    service,
    /export const checkUsername = \(username\) => api\.get\('\/auth\/username\/check', \{ params: \{ username \} \}\);/,
  );
});

test('exposes the username update endpoint', () => {
  assert.match(
    service,
    /export const updateUsername = \(username\) => api\.put\('\/auth\/username', \{ username \}\);/,
  );
});
