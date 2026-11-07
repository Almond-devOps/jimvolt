# Jimvolt Renewable Energy Marketplace

Jimvolt is a React marketplace for renewable-energy products and services, backed by an Express API and MySQL. Public visitors can browse approved advertisements; registered users can post listings, message sellers, save products, and manage their accounts. Administrators can review submitted advertisements.

## Requirements

- Node.js 22 or newer
- MySQL 8 or compatible

## Database setup

Create the schema with `backend/config/schema.sql` in MySQL. The API seeds the renewable-energy categories at startup and adds supported account columns/indexes to existing `users` tables without deleting user records.

Use a dedicated application account instead of `root`. As a MySQL administrator, create the database and application user (choose a unique password):

```sql
CREATE DATABASE IF NOT EXISTS jimvolt_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'jimvolt_user'@'localhost' IDENTIFIED BY 'choose-a-unique-password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
  ON jimvolt_db.* TO 'jimvolt_user'@'localhost';
```

Apply `backend/config/schema.sql` as the MySQL administrator if you want to initialize tables manually; alternatively, the API creates only missing tables using idempotent `CREATE TABLE IF NOT EXISTS` statements at startup. Existing tables and records are not dropped or recreated.

Configure `backend/.env`:

```env
PORT=5000
FRONTEND_URL=http://localhost:5173
JWT_SECRET=replace-with-a-random-secret-at-least-32-characters-long
DB_HOST=localhost
DB_PORT=3306
DB_NAME=jimvolt_db
DB_USER=jimvolt_user
DB_PASSWORD=your-application-user-password
JWT_SECRET=

# Optional SMTP settings for real password-reset and email-verification messages.
EMAIL_HOST=
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASS=
EMAIL_FROM=Jimvolt <no-reply@example.com>
BACHS_API_KEY=sk_sandbox_your_bachs_sandbox_key
```

Generate a JWT secret with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"` and place the result in `JWT_SECRET`. Keep `.env` private; `.env` files are excluded by the repository ignore rules.

If SMTP is not configured, password-reset and email-verification links are printed to the backend console for local development. Do not use the console preview in production.

## Run locally

Start the API:

```sh
cd backend
npm install
npm run dev
```

Start the React application in another terminal:

```sh
cd frontend
npm install
npm run dev
```

The frontend defaults to `http://localhost:5000/api`. To change it, set `VITE_API_URL` in the frontend environment (for example `http://localhost:5000/api`). The API CORS allow-list uses `FRONTEND_URL`.
Set `VITE_SUPPORT_EMAIL` in the frontend environment to provide the address displayed on the Contact page.

## Bachs checkout test

Set `BACHS_API_KEY` in `backend/.env` to a Bachs sandbox API key, then open `/tests/bachs`. Enter a Naira amount to create a hosted checkout and redirect to Bachs. The endpoint accepts sandbox keys only; returning to the page does not verify payment completion.

## Deploy frontend and API to Vercel

Import the repository as a Vercel project with the repository root as its Root Directory. The root `vercel.json` builds the Vite frontend, routes `/api/*` to an Express serverless function, preserves server-rendered SEO routes, and sends other frontend routes (including `/tests/bachs`) to the SPA. The frontend uses same-origin `/api` requests in production.

Configure these values in Vercel's Environment Variables for the environments you deploy:

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` (`jimvolt_db`). Use a managed MySQL server reachable from Vercel, not `localhost` or the database root account.
- `JWT_SECRET` (at least 32 characters), `FRONTEND_URL`, and `PUBLIC_SITE_URL` using your deployed site URL.
- `BACHS_API_KEY` with a Bachs sandbox key to enable the payment test page. Keep provider secrets server-side.
- Configure `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, and `EMAIL_FROM` to send account emails.
- Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` for message image attachments. Set `VITE_SUPPORT_EMAIL` if the Contact page should show a support address.

Vercel Functions do not provide persistent local disk or long-lived WebSocket connections. Product image files and seller verification documents currently use local disk, and real-time messaging uses Socket.IO; those features need durable object storage and a separate WebSocket-capable service for production use. Configure all required environment variables before deploying; the database must already be provisioned and accessible.

## Advertisement image uploads

The authenticated `POST /api/ads` and `PUT /api/ads/:id` endpoints accept multipart form data. Product images are signature-checked JPEG, PNG, or WebP files (up to 5 MB each and 10 images by default), stored with generated filenames under `backend/uploads/products`, and served through `/uploads/products/`. The existing `product_images` table stores the resulting paths alongside existing HTTP(S) image URLs; no schema migration is required.

Optional backend environment variables configure limits:

```env
PRODUCT_IMAGE_MAX_FILE_SIZE_MB=5
PRODUCT_IMAGE_MAX_COUNT=10
```

In production, keep `backend/uploads` on persistent storage and include it in backups. If the frontend and API are on different hosts, set `VITE_API_URL` to the public API URL so the frontend can resolve uploaded image paths to the API host.

## Main routes

- `/` — marketplace home
- `/ads` — searchable, filterable advertisements
- `/ads/:id` — product details and seller contact
- `/post-ad` — submit an advertisement for moderation
- `/dashboard` — user advertisements and MySQL-backed statistics
- `/saved`, `/favourites`, `/recently-viewed`, and `/messages` — saved products, browsing history, and messaging
- `/profile` and `/account-settings` — profile and account management
- `/admin` — administrator advertisement review
- `/register`, `/login`, `/forgot-password`, `/reset-password`, `/verify-email` — account flows
- `/tests/bachs` — sandbox-only hosted checkout test page

## SEO and search visibility

Website metadata, canonical URLs, robots rules, and the XML sitemap are served from the backend for public marketplace pages. The API exposes `robots.txt` and `sitemap.xml` at the site root, and the SEO route layer marks private pages such as `/admin`, `/dashboard`, `/messages`, `/login`, and `/register` as `noindex,nofollow` while allowing public listings to be indexed when they are approved and publicly accessible.

Set a production `PUBLIC_SITE_URL` in the backend environment so canonical URLs, OG tags, and sitemap output point to the live domain rather than `http://localhost:5173` during deployment. Example:

```env
PUBLIC_SITE_URL=https://www.jimvolt.com
```

## Secure first administrator setup

The platform supports `admin` and `super_admin` roles. Create a super administrator from the backend using the interactive command below; the password is entered without terminal echo. Do not create a public route that allows users to self-promote.

```sh
cd backend
npm run create-super-admin
```

The command asks for the administrator's name, email, Nigerian phone number, and password. It validates the details, hashes the password with bcrypt, rejects duplicate email or phone accounts, and creates the user in the existing MySQL `users` table. Keep administrator credentials out of command-line arguments and source control.

## Admin API surface

Open `/admin/login` to sign in with an active account whose database role is `admin` or `super_admin`. On success, the existing Jimvolt JWT/session mechanism is used and the administrator is sent to `/admin/dashboard`. Check “Remember me” to persist the session in local storage; otherwise it is limited to the browser session. The administrator navigation contains the overview, advertisements, users, sellers, verification, categories, reports, payments, analytics, and settings sections. Logging out clears both persistent and session credentials.

The login endpoint is `POST /api/admin/login`; it checks credentials against the existing `users` table, uses bcrypt password verification, limits repeated attempts, and rejects non-administrator roles. All other administrator endpoints require a valid JWT and server-side role authorization; frontend route guards are only an additional UX layer.

If there is no super administrator account, run the existing interactive initializer from the backend directory. It asks for credentials without echoing the password, hashes it with bcrypt, and refuses duplicate email/phone accounts:

```sh
cd backend
npm run create-super-admin
```

After creation, sign in at `/admin/login`. Do not put an administrator password in a command argument or source file.

- `GET /api/admin/dashboard`
- `GET /api/admin/analytics`
- `GET /api/admin/ads`
- `PUT /api/admin/ads/:id/approve`
- `PUT /api/admin/ads/:id/reject`
- `PUT /api/admin/ads/:id/suspend`
- `PUT /api/admin/ads/:id/feature`
- `DELETE /api/admin/ads/:id`
- `GET /api/admin/users`
- `GET /api/admin/users/:id`
- `PUT /api/admin/users/:id/suspend`
- `PUT /api/admin/users/:id/activate`
- `GET /api/admin/sellers`
- `GET /api/admin/verifications`
- `PUT /api/admin/verifications/:id/approve`
- `PUT /api/admin/verifications/:id/reject`
- `GET /api/admin/reports`
- `PUT /api/admin/reports/:id/resolve`
- `GET /api/admin/categories`
- `POST /api/admin/categories`
- `PUT /api/admin/categories/:id`
- `DELETE /api/admin/categories/:id`
- `GET /api/admin/payments`
- `GET /api/admin/audit-logs`

## Messaging setup

The messaging system uses the existing MySQL connection and JWT authentication. Socket.IO runs on the same backend HTTP server and authenticates each connection with the current Jimvolt bearer token. For image attachments, configure Cloudinary in `backend/.env`:

```env
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

Keep the Cloudinary API secret only in the backend environment. Authenticated image uploads are limited to four JPEG, PNG, WebP, or GIF files per request and 5 MB per file. The database startup migration creates conversation tables, adds message metadata, and links eligible historical messages to conversations without dropping old message records.

The main messaging endpoints are `GET /api/messages/conversations`, `POST /api/messages/conversations`, `GET /api/messages/conversations/:id/messages`, `POST /api/messages/conversations/:id/messages`, `PUT /api/messages/conversations/:id/read`, `PUT /api/messages/conversations/:id/archive`, `DELETE /api/messages/conversations/:id`, `POST /api/messages/uploads`, and `POST /api/messages/conversations/:id/report`. All conversation operations enforce participant membership.

Socket.IO authenticates with `auth: { token }` and supports `conversation:join`, `conversation:leave`, `typing:start`, and `typing:stop` client events. Server events include `message:new`, `message:delivered`, `message:read`, `typing:update`, `presence:initial`, `presence:update`, and `messages:unread_count`. Conversation rooms are joined only after checking the authenticated socket user against the conversation participants table.

## Saved products and browsing history

The existing `favourites` table is extended in place: saved product snapshots allow a user's saved item to remain visible if the advertisement is later deleted. Startup migrations add the unique and foreign-key behavior needed for favorites and create `recently_viewed`, `price_history`, and `wishlist_preferences` without dropping existing records. Sellers can mark approved or paused advertisements as sold from the dashboard; reactivating a sold advertisement makes it available again and notifies its savers. Price-drop alerts can be disabled in `/saved`.

Authenticated API routes:

- `GET /api/favorites` — private, searchable, filterable, paginated saved products (`q`, `category`, `sort`, `page`, `limit`)
- `POST /api/favorites/:advertisementId`, `DELETE /api/favorites/:advertisementId`, `DELETE /api/favorites/entry/:favoriteId`, and `DELETE /api/favorites` — save or remove products; deleting by favorite ID also works for an advertisement that has already been removed
- `GET /api/favorites/count` and `GET`/`PUT /api/favorites/preferences`
- `GET /api/recently-viewed`, `POST /api/recently-viewed/:advertisementId`, `POST /api/recently-viewed/import`, and `DELETE /api/recently-viewed/:advertisementId` or `/api/recently-viewed`
- `GET /api/ads/:advertisementId/price-history`

Advertisement detail visits are recorded for signed-in users. Signed-out browsing history is kept in that browser's local storage; after signing in, the user can explicitly choose to import those product IDs into their account. Only currently approved advertisements are imported. Favorite, history, and preference routes derive ownership from the authenticated JWT and use parameterized database queries.

## Verification

```sh
cd backend
npm test
```

`npm test` runs the backend test suite. Run `npm run build` in `frontend` to verify the production bundle. To verify saved products end to end, sign in with two accounts, save an approved advertisement, inspect `/saved`, adjust its price or mark it sold from the seller dashboard, and verify that the buyer receives the relevant notification and sees the updated availability. Test history while signed out, sign in, and use the explicit import action to sync it. These flows require the configured MySQL database; configure SMTP to verify actual email delivery.