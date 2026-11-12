import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('removes the dashboard business profile page and its entry points', () => {
  const app = source('../src/App.jsx');
  const dashboard = source('../src/pages/DashboardPage.jsx');

  // The route may only appear as a Navigate redirect, never as a rendered page
  if (app.includes('/dashboard/business-profile')) {
    assert.match(
      app,
      /path="\/dashboard\/business-profile"[^>]*element=\{<Navigate/,
      '/dashboard/business-profile must be a Navigate redirect, not a rendered page',
    );
  }

  assert.doesNotMatch(
    dashboard,
    /\/dashboard\/business-profile|Business Profile|function BusinessProfile|emptyBusinessProfile|getBusinessProfile|saveBusinessProfile/,
  );
});

test('/dashboard/business-profile redirects to /dashboard in the routing config', () => {
  const app = source('../src/App.jsx');
  assert.match(
    app,
    /path="\/dashboard\/business-profile"[^>]*Navigate[^>]*to="\/dashboard"/,
    'App.jsx must redirect /dashboard/business-profile to /dashboard',
  );
});

test('retains account management and seller marketplace routes', () => {
  const app = source('../src/App.jsx');

  for (const route of [
    '/profile',
    '/post-ad',
    '/messages',
    '/dashboard/ads',
    '/dashboard/verification',
    '/dashboard/promotions',
    '/dashboard/analytics',
    '/seller/:slug',
  ]) {
    assert.ok(app.includes(`path="${route}"`), `expected route ${route} to remain`);
  }
});

test('presents the public seller storefront without referring to a business profile', () => {
  const storefront = source('../src/pages/SellerStorefrontPage.jsx');
  const seller = source('../src/pages/SellerDetailPage.jsx');

  assert.match(storefront, /Seller storefront/);
  assert.doesNotMatch(storefront, /business profile/i);
  assert.match(seller, /View seller storefront/);
  assert.doesNotMatch(seller, /business profile/i);
});
