# Share Profile Design

## Intent and goals

Let an authenticated user share their own public Jimvolt seller page from the existing profile page. Show their current profile photo and display name, identify them by their unique account ID (the application has no username field), provide the public URL, and support copying, native sharing, and WhatsApp, Facebook, X, and Telegram links.

The modal will follow the existing React, Lucide, and CSS-token design system. It will be responsive and keyboard accessible, close on Escape and backdrop activation, lock background scrolling while open, and respect reduced-motion preferences. Clipboard failure will trigger a legacy copy fallback and an accessible error notice if copying still fails.

## Constraints and non-goals

- The authenticated profile response supplies the current user's database ID and profile data.
- `/sellers/:id` is already a public route backed by a public lookup for any account ID; it does not require a username or authentication.
- Generate the share URL from the current origin and the authenticated profile's ID. Do not use a cached, caller-supplied, or hardcoded user identifier.
- Preserve existing profile, account, messaging, and authentication behavior.
- No new database fields, backend endpoints, dependencies, or username system.
- This change does not add a separate public profile route or alter the content/visibility of public seller pages.

## Approaches

1. **Reuse `/sellers/:id` (recommended).** Build the URL from the loaded authenticated profile's ID, and keep share UI in the existing profile page. This uses the already-public seller lookup and avoids backend changes.
2. **Add a dedicated public profile route and API.** This makes the route name more explicit, but duplicates an existing public page and adds unnecessary backend and routing exposure.

Use approach 1 because it meets the public-link requirement while preserving existing routing and authentication.

## Implementation outline

Add a visible Share Profile action to the profile header. Open an in-page modal containing the user's avatar, display name, unique ID, public link, copy action, and social-sharing actions. Use `navigator.share` when supported, otherwise expose the social links; keep copy available in either case. Use the existing app styles and Lucide icons. Add focused tests for URL generation, social destinations, and clipboard behavior if the repository has a usable frontend test setup; otherwise validate the production build and manually inspect the flows.

## Builder decisions

The implementer may choose the modal's exact layout and interaction details as long as they satisfy the goals and accessibility constraints above. No backend changes are expected.
