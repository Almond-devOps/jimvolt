# Remove Business Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove live Business Profile functionality while preserving ordinary user accounts, user-owned marketplace listings, seller workflows, verification, messaging, admin tools, and payments.

**Architecture:** Remove profile-only frontend routes and components, backend endpoints and data consumers, and the fresh-schema table definition. Keep seller operations and verification in their existing modules. Add a separately invoked, fail-closed archive migration that preserves existing profile rows before dropping only the active profile table.

**Tech Stack:** React 19, React Router, Vite, Node.js 22, Express, mysql2, MySQL 8, Node's built-in test runner.

**Spec:** [2026-11-11-remove-business-profile-design.md](../specs/2026-11-11-remove-business-profile-design.md)

## Global Constraints

- Keep individual user profiles, profile-image uploads, account settings, and verification.
- Keep seller dashboards, advertisements, product categories/images, promotions, Bachs.io payments, messaging, favourites, recently viewed products, admin functions, and analytics.
- Advertisement ownership remains tied directly to `advertisements.user_id` and `users.id`.
- Archive every existing `seller_profiles` column and row, including logo URLs; do not copy remotely hosted image files.
- The retirement migration must fail closed on an existing archive or unexpected foreign-key/advertisement dependency.
- Never run the retirement migration from normal application startup.
- Run the migration only after deploying the code without profile dependencies and draining old application instances.
- Do not delete user, advertisement, or other marketplace records.

## Review Focus

- New authenticated users must be able to create ads without a profile — pin with an API test creating an ad without any profile lookup.
- Messages must retain participants and use personal account names — pin with message-model tests for list and detail results.
- Seller analytics, verification, and ad-management endpoints must remain mounted — retain/extend the seller-route tests.
- Admin seller and verification lists must not query the retired table — pin the model queries and run the existing admin-related tests.
- An unexpected foreign key, profile-ID ad column, or existing archive must stop migration before destructive DDL — pin each abort path in migration tests.

---

### Task 1: Remove Backend Business-Profile Dependencies

**Files:**
- Modify: `backend/routes/sellerRoutes.js`
- Modify: `backend/controllers/sellerController.js`
- Modify: `backend/models/sellerModel.js`
- Modify: `backend/controllers/adController.js`
- Modify: `backend/models/messageModel.js`
- Modify: `backend/models/adminModel.js`
- Modify: `backend/routes/seoRoutes.js`
- Modify: `vercel.json`
- Modify: `backend/tests/sellerAdsRoutes.test.js`
- Create: `backend/tests/messageModel.test.js`
- Create: `backend/tests/adminSellerModel.test.js`
- Create: `backend/tests/adSellerResponse.test.js`
- Modify: `backend/tests/adSearch.test.js`
- Test: `backend/tests/` relevant route/model tests

**Interfaces:**
- Keep the seller router's dashboard, ads, analytics, verification, and notification routes and their current controller/model contracts.
- `GET /api/ads/sellers/:id` continues returning `{ seller, advertisements }`; `seller` contains personal account fields only.
- Message model participant results keep the current `other_user` shape, with `name` sourced from `users.full_name`.
- Admin seller records are selected from users with advertisements, without profile-only fields.

- [ ] **Step 1: Add failing regression tests**

Add route assertions that authenticated `/api/seller/profile` and `/api/seller/public/:slug` are no longer served, while `/api/seller/ads`, `/api/seller/verification`, and `/api/seller/analytics` remain registered and available under existing test setup. Add `adSellerResponse.test.js` for `GET /api/ads/sellers/:id`, asserting the existing personal seller/ad shape and no `businessProfile` property. Add `messageModel.test.js` to verify list/detail use the account name and their SQL does not join `seller_profiles`. Add `adminSellerModel.test.js` assertions that seller discovery derives from advertisements and personal account fields. Extend `adSearch.test.js` with an authenticated `POST /api/ads` case that creates a listing without profile setup or profile-table queries.

- [ ] **Step 2: Run the targeted tests and confirm they fail**

Run: `cd backend && node --test tests/sellerAdsRoutes.test.js tests/messageModel.test.js tests/adminSellerModel.test.js tests/adSellerResponse.test.js tests/adSearch.test.js`

Expected: new assertions fail on profile routes/response fields and profile-based display/query behavior.

- [ ] **Step 3: Remove profile-only backend code**

Remove profile route validation and handlers from `sellerRoutes.js`, profile controller methods and imports from `sellerController.js`, profile CRUD/public-query exports from `sellerModel.js`, the public business-profile property/query from `adController.js`, and profile joins/display-name overrides from `messageModel.js` and verification/admin query joins in `sellerModel.js`.

In `adminModel.js`, count and list sellers from advertisements owned by user accounts; search only personal account name/email/phone. In `seoRoutes.js`, remove business slug rendering and sitemap queries/URLs but keep `/sellers/:id` rendering and seller directory sitemap entry. Remove the Vercel rewrite used only for `/seller/:slug`. Preserve all verification fields and admin review data that belong to `seller_verifications`.

- [ ] **Step 4: Run targeted backend tests**

Run: `cd backend && node --test tests/sellerAdsRoutes.test.js tests/messageModel.test.js tests/adminSellerModel.test.js tests/adSellerResponse.test.js tests/adSearch.test.js tests/sellerAnalytics.test.js`

Expected: PASS; seller operations remain usable and no active profile data is needed by these code paths.

### Task 2: Remove Frontend Business-Profile Surfaces

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/pages/DashboardPage.jsx`
- Modify: `frontend/src/pages/SellerDetailPage.jsx`
- Modify: `frontend/src/pages/AdminVerificationsPage.jsx`
- Modify: `frontend/src/services/sellerService.js`
- Modify: `frontend/src/index.css`
- Delete: `frontend/src/pages/BusinessSellerPage.jsx`
- Test: frontend production build

**Interfaces:**
- Keep `/profile`, `/account-settings`, `/dashboard`, `/dashboard/ads`, `/dashboard/verification`, `/dashboard/analytics`, `/dashboard/promotions`, `/messages`, `/sellers`, and `/sellers/:id`.
- Keep seller verification form and API requests, including verification-only business details and supporting documents.
- Keep personal seller display and verified badge on seller pages.

- [ ] **Step 1: Remove profile routes and service functions**

Delete the `/seller/:slug` and `/dashboard/business-profile` route registrations and the profile-only `getBusinessProfile`, `saveBusinessProfile`, and `getPublicBusinessProfile` functions from `sellerService.js`. Remove the business-profile link from `SellerDetailPage.jsx`.

- [ ] **Step 2: Remove dashboard profile navigation and page code**

Remove the business-profile navigation/title/route branch, quick action, form state, load/save effects, and profile component from `DashboardPage.jsx`. Preserve seller verification and `getCategories` usage required by its verification form.

- [ ] **Step 3: Preserve verification styling while removing profile styling**

Rename verification form-only uses of `.business-profile-form`, `.business-description-field`, and `.business-profile-submit` to verification-scoped class names in `DashboardPage.jsx` and `index.css`. Remove profile/public-business-only CSS selectors and responsive rules. Remove the profile-image fallback from `AdminVerificationsPage.jsx` and use the user's avatar/name.

- [ ] **Step 4: Delete the public profile page and build**

Delete `BusinessSellerPage.jsx`.

Run: `cd frontend && npm run build`

Expected: Vite build succeeds, with dashboard verification styles and seller page routes intact.

### Task 3: Add Safe Profile-Table Retirement Migration

**Files:**
- Modify: `backend/config/schema.sql`
- Create: `backend/scripts/removeBusinessProfiles.js`
- Create: `backend/tests/removeBusinessProfiles.test.js`
- Modify: `README.md`

**Interfaces:**
- Export `removeBusinessProfiles({ pool })` from the migration module so tests can inject a fake pool; the CLI entry point uses the existing configured pool and reports errors with a non-zero exit status.
- Archive table name: `seller_profiles_archive`.
- Keep `ensureCoreSchema()` startup behavior non-destructive; it must not invoke this migration.

- [ ] **Step 1: Add migration guard tests**

Test that the migration aborts without executing archive/drop statements when: a foreign key references `seller_profiles`; an advertisement schema contains a seller-profile ID column; `seller_profiles_archive` already exists; or the copied archive row count differs from the source row count. Test that a missing source and archive reports no active table to retire. Test the successful sequence archives all source columns/rows, verifies the count, then drops only `seller_profiles`. Test that users/advertisements are not passed to any modifying statement.

- [ ] **Step 2: Run migration tests and verify failure**

Run: `cd backend && node --test tests/removeBusinessProfiles.test.js`

Expected: test cases fail until the migration module is implemented.

- [ ] **Step 3: Implement the explicit guarded migration**

Inspect MySQL metadata before mutation. Abort if dependent foreign keys or profile-ID advertisement columns exist, or if both source and archive tables exist. If the source table is absent, report that there is no active table to retire. Otherwise create the archive from the source structure, copy all rows, compare source/archive counts, and drop only the source table after the check passes. Do not copy image files, delete data, or invoke the migration from server initialization.

- [ ] **Step 4: Remove the table from fresh-install schema and document operations**

Remove only the `seller_profiles` create statement from `schema.sql`; keep `seller_verifications`. In `README.md`, document backup, deploying the code, draining old instances, reviewing preflight output, and explicit invocation of the archive migration.

- [ ] **Step 5: Run migration tests**

Run: `cd backend && node --test tests/removeBusinessProfiles.test.js`

Expected: PASS for success, no-source, and every fail-closed dependency/data-integrity case.

### Task 4: Full Verification and Reference Audit

**Files:**
- Review all changed files and repository references.
- Test: `backend/tests/` and frontend production build.

- [ ] **Step 1: Run the complete backend suite**

Run: `cd backend && npm test`

Expected: all tests pass, including the newly added seller/message/migration regression tests.

- [ ] **Step 2: Build the frontend**

Run: `cd frontend && npm run build`

Expected: production build succeeds.

- [ ] **Step 3: Audit business-profile references**

Search the repository for `seller_profiles`, `/seller/:slug`, `/seller/profile`, `/seller/public`, `business-profile`, and `Business Profile`. Confirm no live frontend/API/SEO/schema consumer remains. Allow only explicit migration/archive documentation and distinct verification copy/fields.

- [ ] **Step 4: Review changes for marketplace regressions**

Confirm personal-profile routes, seller ad routes, product ownership, messaging identity, verification status/admin review, promotions/Bachs routes, admin seller records, analytics, and personal seller pages remain wired. Report that live registration/payment/database workflows require configured MySQL and Bachs credentials if those services are unavailable in the workspace.
