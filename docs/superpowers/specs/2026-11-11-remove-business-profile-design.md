# Remove Business Profile Design

## Intent

Remove Jimvolt's business-profile feature so registered users can use their
normal accounts to advertise and manage marketplace activity without profile
setup. Preserve existing individual user profiles, seller activity, and
marketplace workflows.

## Goals

- Remove business-profile pages, dashboard sections, prompts, links, API
  endpoints, model methods, SQL joins, SEO pages, and sitemap entries.
- Keep personal profiles, profile-picture uploads, account settings, seller
  dashboards, advertisements, messages, verification, promotions, and admin
  functionality working.
- Keep `/sellers` and `/sellers/:id` as verified/individual seller marketplace
  experiences; remove only `/seller/:slug` business-profile pages.
- Archive existing `seller_profiles` rows before removing the active table.
- Leave database changes to an explicit migration; do not drop tables during
  application startup.

## Non-goals

- Removing seller accounts, seller verification, verified badges, or the
  seller dashboard.
- Changing verification application data, moderation rules, or product
  ownership.
- Removing users, advertisements, or their related marketplace records.
- Changing Bachs.io payments, promotion packages, messaging behavior, or
  monetization.
- Rebuilding the application or changing its technology stack.

## Constraints and Current State

- `advertisements.user_id` references `users.id`; the schema has no
  advertisement-to-`seller_profiles` relationship.
- `seller_profiles` has foreign keys only to `users` and `categories`.
- `seller_verifications` is a separate workflow and is needed for account
  verification status, document review, admin verification, and verified
  seller experiences. Retain it and its existing data.
- The seller API module also implements seller ads, analytics, notifications,
  and verification. Remove only its business-profile controller/routes/model
  functions.
- Business profile display names currently affect admin seller records and
  message identity display. Use normal account names once those overrides are
  removed.
- Current database bootstrap creates missing tables from `schema.sql` and
  performs unrelated in-place migrations. It must not automatically drop or
  archive existing tables.
- There is no general migration runner; the profile-table retirement must be a
  separately invoked migration with preflight checks.

## Approaches

1. **Remove the UI only:** reversible, but leaves APIs, SQL dependencies, and
   dormant profile data structures in active use. Rejected because it does
   not meet the requested complete removal.
2. **Remove the feature and archive profile rows before dropping the active
   table:** selected. This removes live profile behavior while preserving
   existing profile data outside the application. The explicit migration
   must verify dependencies, archive and count-check the rows, and abort on
   unexpected advertisement/profile relationships. This is the user's
   selected data-retirement approach.
3. **Remove the feature and permanently drop profile rows:** smaller database
   footprint, but irreversibly discards existing profile data. Rejected in
   favor of the selected archive-first approach.

## Design

### Frontend

- Remove the `/dashboard/business-profile` and `/seller/:slug` routes and
  profile-only page/service code.
- Remove the profile item from desktop/mobile dashboard navigation and the
  overview quick action; keep verification, ads, analytics, notifications,
  promotions, settings, and logout.
- Remove the profile link and business-profile styles. Keep personal seller
  pages, user profile editing/picture uploads, and verification badge UI.
- Retain the regular user profile and account settings paths.

### Backend

- Remove authenticated `GET /seller/profile` and `PUT /seller/profile`, public
  `GET /seller/public/:slug`, profile validation, profile controller methods,
  profile model queries/writes, and the ad response's `businessProfile`
  property.
- Keep seller dashboard, advertisement-management, analytics, notification,
  and verification APIs.
- Remove `seller_profiles` joins from admin seller listing/counting and
  verification presentation, and from message participant lookup. Messages
  use the user's `full_name` and remain addressable by the same user IDs.
- Remove business-profile SEO rendering and sitemap entries, plus the Vercel
  backend route used only for `/seller/:slug`. Preserve `/sellers/:id` SEO and
  seller discovery.
- Preserve the direct user-based advertisement ownership path; no posting
  workflow should check for a profile.

### Database

- Remove the `seller_profiles` create statement from the fresh-install schema.
- Add an explicit, non-startup migration that checks for unexpected foreign
  keys or advertisement profile-ID columns before changing data. It should
  archive the existing table's full structure and rows, verify the archived
  row count, then drop only the active `seller_profiles` table. Archive every
  stored column, including logo URLs, but do not copy remotely hosted image
  files. It must leave `users`, `advertisements`, and all other marketplace
  tables untouched and fail closed if an archive already exists or a
  dependency is found.
- Document that operators should back up the database, deploy code that no
  longer depends on the table, wait until old application instances are
  drained, review migration preflight output, and invoke the migration
  deliberately. The normal startup schema bootstrap must never execute this
  retirement migration.
- Retain `seller_verifications` and its columns/relationships because they
  support the separate verification workflow.

## UX and Compatibility

The user dashboard retains the existing compact sidebar and overview cards;
removing the profile item and quick action should not leave a blank panel or
grid slot. Existing seller pages identify people from their user account.
Legacy business-profile URLs will no longer resolve to a business profile;
normal SPA fallback behavior can remain.

## Verification

- Add or update backend tests to confirm seller ads, analytics, and verification
  routes remain available while profile-only routes are gone; exercise seller
  responses and message/admin SQL paths without profile data.
- Run backend tests and the frontend production build.
- Search the repository for active business-profile UI, route, API, and
  `seller_profiles` references. References that describe the archive migration
  or retained business verification are intentional and should be explicit.
- Where local MySQL credentials are unavailable, validate migration guards and
  query behavior with tests; do not claim a live database migration was run.
- Manually verify the specified registration, login, personal-profile,
  advertisement, messaging, promotion, admin, verification, and analytics
  workflows in an environment with the required external services.
