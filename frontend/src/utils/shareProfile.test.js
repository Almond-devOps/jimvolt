import assert from 'node:assert/strict';
import test from 'node:test';
import { copyTextToClipboard, getPublicProfileUrl, getSocialShareUrls } from './shareProfile.js';

test('builds a /@username profile URL on the site origin and removes a trailing slash', () => {
  assert.equal(getPublicProfileUrl('ada-lovelace', 'https://jimvolt.example/'), 'https://jimvolt.example/@ada-lovelace');
  assert.equal(getPublicProfileUrl('  Ada-Lovelace ', 'https://jimvolt.example'), 'https://jimvolt.example/@ada-lovelace');
});

test('refuses to build a profile URL without a valid username', () => {
  assert.throws(() => getPublicProfileUrl(42, 'https://jimvolt.example'), TypeError);
  assert.throws(() => getPublicProfileUrl('', 'https://jimvolt.example'), TypeError);
  assert.throws(() => getPublicProfileUrl('-bad', 'https://jimvolt.example'), TypeError);
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

test('copies through the modern clipboard API when it succeeds', async () => {
  const copied = [];
  const clipboard = { writeText: async (text) => copied.push(text) };

  await copyTextToClipboard('https://jimvolt.example/sellers/42', clipboard, null);

  assert.deepEqual(copied, ['https://jimvolt.example/sellers/42']);
});

test('falls back to a temporary text area when modern clipboard access is rejected', async () => {
  const area = {
    style: {},
    setAttribute() {},
    focus() {},
    select() {},
    remove() { this.removed = true; },
  };
  let command;
  const documentRef = {
    body: { appendChild(element) { this.element = element; } },
    createElement(tagName) {
      assert.equal(tagName, 'textarea');
      return area;
    },
    execCommand(value) {
      command = value;
      return true;
    },
  };
  const clipboard = { writeText: async () => { throw new Error('Permission denied'); } };

  await copyTextToClipboard('https://jimvolt.example/sellers/42', clipboard, documentRef);

  assert.equal(area.value, 'https://jimvolt.example/sellers/42');
  assert.equal(command, 'copy');
  assert.equal(area.removed, true);
});

test('reports failure when neither clipboard method succeeds', async () => {
  const documentRef = {
    body: { appendChild() {} },
    createElement: () => ({
      style: {},
      setAttribute() {},
      focus() {},
      select() {},
      remove() {},
    }),
    execCommand: () => false,
  };

  await assert.rejects(
    copyTextToClipboard('https://jimvolt.example/sellers/42', undefined, documentRef),
    /Unable to copy the profile link/,
  );
});
