# Jimvolt Persistent Cloud Storage Design

## Intent

Prepare the existing Express marketplace backend for Render by moving newly
uploaded public product images to the existing Cloudinary account and seller
verification documents to a private Cloudflare R2 bucket. Render's local
filesystem is not durable, so new production uploads must not silently fall
back to local disk. Preserve the existing API payloads, database schema,
frontend URL compatibility, Aiven TLS settings, and business behavior.

## Goals

- Upload product images to Cloudinary using signed server-side requests and
  validate both declared MIME type and actual file signatures.
- Return HTTPS Cloudinary URLs while continuing to accept old
  `/uploads/products/` references and arbitrary existing HTTP(S) image URLs.
- Delete only Jimvolt-managed product images belonging to the seller whose
  advertisement is being updated or deleted. Retain local cleanup for legacy
  local product paths.
- Keep profile image ownership, validation, Cloudinary behavior, and existing
  local URL support; fail clearly instead of using local disk in production
  when Cloudinary is not configured.
- Store private verification documents in a private R2 bucket with generated
  keys in existing database columns. Stream authorized admin downloads with
  `Cache-Control: private, no-store`, while continuing to read legacy local
  filenames.
- Clean up remote objects after failed persistence or partial uploads without
  swallowing storage errors.
- Keep message image validation, attachment ownership checks, Cloudinary
  uploads, API responses, and existing CORS restrictions intact.
- Add coverage for upload, cleanup, ownership, private access, and legacy
  compatibility; do not make real provider or database calls in tests.

## Non-goals

- Do not deploy, contact or modify the live database, change its schema, delete
  existing records/files, migrate existing local files, or change Bachs.io.
- Do not change public message attachment lifecycle or expose verification
  objects through Cloudinary, static middleware, or public URLs.
- Do not commit credentials or certificates.

## Constraints

- Private provider selected: Cloudflare R2, accessed through its S3-compatible
  API using AWS SDK v3 (`@aws-sdk/client-s3`). Backend streaming is preferred
  over signed download URLs so authorization remains in the existing admin
  route and the API never returns a private object URL.
- Cloudinary remains the public media provider and uses the existing
  `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and
  `CLOUDINARY_API_SECRET`.
- `FILE_STORAGE_MODE=cloud` is the explicit production mode. Cloud mode
  requires Cloudinary and R2 settings; local mode is for development
  compatibility. `NODE_ENV=production` must fail startup if cloud mode or
  required credentials/settings are missing, rather than waiting until an
  upload request or silently falling back to local disk.
- R2 object keys will use a validated, generated prefix (for example
  `verification/<uuid>.<extension>`). Existing bare UUID filenames remain
  recognized as local legacy references.
- Verification endpoint authorization remains enforced by the existing
  `authenticate` and `requireAdmin` route middleware before document retrieval.
- Product Cloudinary IDs include the authenticated seller identity in their
  Jimvolt-controlled folder; deletion derives the permitted seller from the
  owned advertisement, not from caller-provided image URLs.
- Existing user `.env`, uploaded files, certificates, and unrelated worktree
  changes remain untouched.

## Approaches

1. **Cloudflare R2 through AWS SDK v3 (selected):** use S3-compatible
   `PutObject`/`GetObject` operations, private bucket configuration, and
   backend streaming. One maintained SDK supports the R2 endpoint, and the
   design keeps private document URLs out of browser responses.
2. **Cloudinary for verification documents:** fewer providers, but does not
   meet the selected private S3-compatible object-storage direction and
   complicates enforcing private access separately from public image delivery.
3. **Continue using local disk or Render disk:** smallest code change, but does
   not meet durability across deploys unless a paid persistent disk is mounted;
   it is not selected.

## Implementation plan

1. Add an isolated Cloudinary product storage path with signed uploads,
   signature/MIME validation, secure URL/public-ID validation, and cleanup of
   earlier successful uploads when a batch fails.
2. Extend product-image storage cleanup to support only strictly validated
   Jimvolt Cloudinary product IDs and legacy local files. Wire seller-scoped
   old/new image comparison into ad updates and owned-ad deletion; retain
   external URLs and untouched legacy references.
3. Add a private R2 document storage module using the selected SDK. Keep
   multipart parsing/signature checks and size limits; persist generated keys
   in existing verification document columns and remove newly created objects
   when validation, database persistence, or a later object upload fails.
4. Update seller cleanup to dispatch by R2 key versus legacy local filename.
   Update the existing admin-only document route to stream R2 content or
   legacy local content without returning a public URL; preserve no-store
   headers and prevent path traversal.
5. Add explicit storage-mode checks. Keep local storage for development and
   legacy reads, require Cloudinary and R2 configuration in cloud/production
   mode, and provide non-secret `.env.example` entries and deployment notes.
6. Add focused tests for Cloudinary product uploads/deletions and partial
   failures; profile production config and Cloudinary behavior; message
   attachment validation; R2 upload/access/streaming/legacy paths and cleanup.
   Run backend tests, syntax checks, and any package scripts available. Do not
   run provider or database operations.

## Open implementation calls

- Use the project’s existing `fetch`-based signed Cloudinary pattern rather
  than introducing the Cloudinary SDK.
- Use server-side streaming from R2 so the existing authorization boundary is
  preserved; no signed URLs will be returned to clients.
- Keep database values as strings, using a clear prefix to distinguish new
  R2 keys from legacy local filenames; no migration is needed.
- If an already-stored R2 object is replaced, remove it only after the
  database update commits. Failed new uploads are cleaned up immediately.
- If cleanup of an old object fails after a database change has committed,
  preserve the existing API response and emit an explicit server-side error
  without logging secrets, document contents, or private URLs. Do not add a
  database migration or in-memory retry queue; failed cleanup may require
  operator follow-up.
- Message images currently have no deletion path. Preserve that behavior and
  test the attachment trust boundary rather than introducing a new message
  retention policy.

## Approval boundary

This design and its implementation plan require approval before production
code, dependency manifests, tests, or environment examples are changed.
