# Share Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an accessible, responsive Share Profile modal to the authenticated profile page, linking to the current user's existing public seller page.

**Architecture:** Add a Share Profile action to `ProfilePage.jsx` and a focused modal component for profile identity, public URL, copy, native sharing, and social links. Generate links from the loaded profile's `id` and `window.location.origin`; style the modal in the existing global stylesheet.

**Tech Stack:** React 19, React Router, Lucide React, Vite, existing CSS tokens, Node.js built-in test runner (no new dependencies).

**Spec:** `docs/superpowers/specs/2026-11-08-share-profile-design.md`

## Global Constraints

- The authenticated profile response supplies the current user's database ID and profile data.
- `/sellers/:id` is already a public route backed by a public lookup for any account ID; it does not require a username or authentication.
- Generate the share URL from the current origin and the authenticated profile's ID. Do not use a cached, caller-supplied, or hardcoded user identifier.
- Preserve existing profile, account, messaging, and authentication behavior.
- No new database fields, backend endpoints, dependencies, or username system.
- This change does not add a separate public profile route or alter the content/visibility of public seller pages.

## Review Focus

- A missing profile image still shows an accessible avatar fallback and does not prevent sharing.
- A profile ID is interpolated from the loaded profile and social URLs encode the full public URL correctly.
- Clipboard API rejection/absence falls back to legacy copying; failure is announced without falsely claiming success.
- Native share is only offered when available, and user cancellation does not surface as an error.
- Escape, backdrop click, focus return, and background scroll restoration behave correctly through modal open/close.

---

### Task 1: Add share-profile modal and profile action

**Files:**
- Create: `frontend/src/components/ShareProfileDialog.jsx`
- Create: `frontend/src/utils/shareProfile.js`
- Create: `frontend/src/utils/shareProfile.test.js`
- Modify: `frontend/src/pages/ProfilePage.jsx`
- Modify: `frontend/src/index.css`
- Test: `frontend/src/utils/shareProfile.test.js`

**Interfaces:**
- `ShareProfileDialog({ profile, onClose })` receives the loaded authenticated profile and a close callback.
- `getPublicProfileUrl(profileId, origin)` returns `${origin}/sellers/${profileId}` for the supplied profile ID.
- `getSocialShareUrls(profileUrl, displayName)` returns WhatsApp, Facebook, X, and Telegram share URLs with the profile URL encoded as a query parameter.

- [ ] **Step 1: Add URL and social URL unit tests**

Test `getPublicProfileUrl` with two distinct IDs and an origin with a trailing slash; assert each result uses that ID and has no doubled slash. Test `getSocialShareUrls` with a URL containing query characters and a display name containing spaces; assert each platform URL contains the properly encoded profile URL and the share text contains the display name.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd frontend && node --test src/utils/shareProfile.test.js`
Expected: FAIL because `shareProfile.js` does not exist.

- [ ] **Step 3: Implement URL helpers**

Implement `getPublicProfileUrl(profileId, origin)` and `getSocialShareUrls(profileUrl, displayName)` in `frontend/src/utils/shareProfile.js`. Normalize only a trailing slash from the provided origin; do not generate or default a user ID.

- [ ] **Step 4: Run the URL tests**

Run: `cd frontend && node --test src/utils/shareProfile.test.js`
Expected: PASS for different account IDs, origin normalization, and encoded social links.

- [ ] **Step 5: Add the profile action and modal**

In `ProfilePage.jsx`, add a visible Share Profile button beside the profile identity and pass the loaded `profile` to `ShareProfileDialog`. Implement the modal using a native `<dialog>`: show the user's avatar, name, `Member #<id>` (the existing schema has no username), and `window.location.origin` plus the current profile ID. Support native sharing when `navigator.share` exists, always provide WhatsApp, Facebook, X, and Telegram links, and keep Copy Link available. Close on Escape and backdrop activation, restore focus, and lock/restore body scrolling while open. On copy, first use `navigator.clipboard.writeText`, then a legacy selection/`execCommand('copy')` fallback; announce success only after copying succeeds, temporarily label the button “Copied!”, and show an accessible success toast. Surface a clear error if both copy methods fail. Ignore native-share `AbortError`; report other share errors without breaking the modal.

- [ ] **Step 6: Style the responsive modal**

Add focused styles to `index.css` using existing color, font, and spacing tokens. Include a restrained open/close transition, mobile-safe width and height with internal scrolling, clear hover/focus states, and reduced-motion behavior.

- [ ] **Step 7: Verify feature and build**

Run: `cd frontend && node --test src/utils/shareProfile.test.js && npm run build`
Expected: unit tests pass and Vite completes without errors.

Manually verify at desktop and mobile widths: open/close by button, Escape, and backdrop; focus returns to Share Profile; body scrolling is restored; missing-avatar display; Copy Link copied state and toast; native share visibility/launch; and all four social destinations open using the current profile ID.
