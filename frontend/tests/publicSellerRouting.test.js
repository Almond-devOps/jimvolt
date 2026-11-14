import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { matchPath } from 'react-router-dom';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));

test('React Router cannot match "@" plus a param, so /@username must use a whole-segment route', () => {
  assert.equal(matchPath('/@:slug', '/@solarpowerng'), null);
  assert.equal(matchPath('/:handle', '/@solarpowerng')?.params.handle, '@solarpowerng');
  assert.doesNotMatch(app, /path="\/@:slug"/);
  assert.match(app, /<Route path="\/:handle" element=\{<SellerSlugPage \/>} \/>/);
});

test('direct username profile URLs reach the profile page through Vercel routing', () => {

  const usernameRoute = vercel.routes.findIndex((route) => route.src === '/@([a-zA-Z0-9][a-zA-Z0-9-]{1,47})$');
  const filesystemRoute = vercel.routes.findIndex((route) => route.handle === 'filesystem');
  const frontendFallback = vercel.routes.findIndex((route) => route.dest === '/frontend/index.html');

  assert.ok(usernameRoute >= 0, 'Vercel must send username URLs to the backend SEO handler');
  assert.ok(filesystemRoute > usernameRoute, 'the username handler must run before static file handling');
  assert.ok(frontendFallback > filesystemRoute, 'unmatched application paths must fall back to the React app');
});
