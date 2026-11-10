import assert from 'node:assert/strict';
import test from 'node:test';
import { getPublicProfileUrl, getSocialShareUrls } from './shareProfile.js';

test('builds a public profile URL from the supplied ID and removes a trailing origin slash', () => {
  assert.equal(getPublicProfileUrl(42, 'https://jimvolt.example/'), 'https://jimvolt.example/sellers/42');
  assert.equal(getPublicProfileUrl(907, 'https://jimvolt.example'), 'https://jimvolt.example/sellers/907');
});

test('builds encoded share destinations for each supported social platform', () => {
  const profileUrl = 'https://jimvolt.example/sellers/42?source=profile&campaign=summer';
  const displayName = 'Ada Lovelace';
  const links = getSocialShareUrls(profileUrl, displayName);

  const whatsapp = new URL(links.whatsapp);
  assert.equal(whatsapp.origin + whatsapp.pathname, 'https://wa.me/');
  assert.ok(whatsapp.searchParams.get('text').includes(profileUrl));
  assert.ok(whatsapp.searchParams.get('text').includes(displayName));

  const facebook = new URL(links.facebook);
  assert.equal(facebook.searchParams.get('u'), profileUrl);
  assert.ok(facebook.searchParams.get('quote').includes(displayName));

  const x = new URL(links.x);
  assert.equal(x.searchParams.get('url'), profileUrl);
  assert.ok(x.searchParams.get('text').includes(displayName));

  const telegram = new URL(links.telegram);
  assert.equal(telegram.searchParams.get('url'), profileUrl);
  assert.ok(telegram.searchParams.get('text').includes(displayName));
});
