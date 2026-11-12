# Text-Only Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop new image messages across the frontend and backend while preserving text messaging and historical conversation data.

**Architecture:** Keep the existing conversation API, authorization, model reads, Socket.IO events, notifications, and message schema. Remove image creation and upload processing, reject legacy image inputs, and leave historical image rendering intact.

**Tech Stack:** React 19, Vite, Node.js 22, Express, express-validator, MySQL, Socket.IO, Node test runner.

**Spec:** [2026-11-12-text-only-messaging-design.md](../specs/2026-11-12-text-only-messaging-design.md)

## Global Constraints

- Accept non-empty text messages up to the existing 2,000-character limit.
- Preserve authentication, conversation participation checks, delivery/read updates, unread notifications, timestamps, and Socket.IO events.
- Keep existing historical image messages viewable.
- Do not migrate or delete message records or attachment columns.
- Do not remove images elsewhere in the marketplace.

## Review Focus

- Empty, whitespace-only, non-string, and over-2,000-character message bodies must not create messages; test in Task 1.
- Attachment fields, including an empty attachment list, and image-type message declarations must be rejected; test in Task 1.
- The retired upload endpoint must reject requests without processing multipart files; test in Task 1.
- Unauthenticated sends and authenticated non-participants must retain 401/403 behavior; test in Task 1.
- Existing history must retain image records, timestamps, read/delivery fields, and text sends must notify and broadcast through the existing flow; test in Task 1.

---

### Task 1: Enforce Text-Only Messaging in the Backend

**Files:**
- Modify: `backend/routes/messageRoutes.js`
- Modify: `backend/controllers/messageController.js`
- Modify: `backend/models/messageModel.js`
- Delete: `backend/middleware/messageImageUpload.js`
- Delete: `backend/utils/messageAttachment.js`
- Delete: `backend/utils/detectImageType.js` if no other callers remain
- Replace: `backend/tests/messageAttachment.test.js` with `backend/tests/messageTextOnly.test.js`
- Do not modify: `backend/config/schema.sql` or `backend/config/database.js`

**Interfaces:**
- Keep the existing message route URLs and response shapes for successful text sends.
- The retired `POST /uploads` route returns HTTP 410 with a clear unsupported-image message.
- Both message creation routes reject image/attachment payload fields with HTTP 400 before persistence.
- `messageModel.sendMessage` accepts only `{ conversationId, senderId, message }`.

- [ ] **Step 1: Write route tests for text-only behavior**

Add a route-level test using the existing Express/JWT test pattern. Assert a valid text send returns 201 and persists only the text; whitespace, non-string, and over-limit text returns 400; attachment fields and `message_type: 'image'` return 400 without calling the model; `POST /uploads` returns 410; no-auth returns 401; and a mocked non-participant returns 403. Also assert history responses retain legacy image rows and their timestamps/read status.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `cd backend && node --test tests/messageTextOnly.test.js`

Expected: FAIL because the test file and text-only API behavior do not yet exist.

- [ ] **Step 3: Remove backend image creation and upload handling**

Remove the upload middleware route and Cloudinary upload implementation. Retain `POST /uploads` as an authenticated gone response. Reject attachment-related request fields in both `POST /` and `POST /conversations/:id/messages`. Require a non-empty trimmed string, capped at 2,000 characters, on the conversation send route. Remove the model's attachment parameter, image insert loop, and image-specific notification text; leave history queries and schema setup unchanged. Delete image-only helpers only after confirming they have no other callers.

- [ ] **Step 4: Run focused backend tests**

Run: `cd backend && node --test tests/messageTextOnly.test.js`

Expected: PASS for text send/history, invalid body rejection, upload retirement, authentication, and conversation authorization.

- [ ] **Step 5: Run all backend tests**

Run: `cd backend && npm test`

Expected: PASS with no regressions in unrelated backend features.

### Task 2: Remove Frontend Image-Sending Controls

**Files:**
- Modify: `frontend/src/pages/MessagesPage.jsx`
- Modify: `frontend/src/services/messageService.js`
- Modify: `frontend/src/index.css`

**Interfaces:**
- `sendConversationMessage(id, message)` submits only `{ message }`.
- Preserve loading, error, send receipt, conversation history, and Socket.IO behavior.
- Keep the existing rendering path for historical image messages; remove only composer previews and sending controls.

- [ ] **Step 1: Remove upload and preview logic from the composer**

Delete file state/refs, selection and removal handlers, object URL lifecycle, the upload service helper, attachment imports/controls/previews, and image-specific composer disabled logic. Send only the trimmed text. Keep the existing textarea Enter behavior, Send button, sending spinner, inline errors, and safety note.

- [ ] **Step 2: Remove obsolete composer styles**

Delete attachment-preview and attach-button CSS. Retain and verify responsive sizing for the text input and Send button at the existing mobile breakpoint.

- [ ] **Step 3: Run frontend tests and build**

Run: `cd frontend && npm test && npm run build`

Expected: PASS; the production build succeeds and no upload helper references remain in the messaging frontend.

- [ ] **Step 4: Verify the composer at desktop and mobile widths**

Open the messages page at desktop and 375px viewport widths when browser tooling is available. Confirm the composer contains only the text input and Send button, remains within the viewport, and preserves loading/error feedback. If browser tooling is unavailable, document that limitation and verify the responsive CSS selectors and production build.
