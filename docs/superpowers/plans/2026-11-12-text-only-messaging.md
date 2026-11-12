# Text-Only Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permanently prevent new image messages while preserving text conversations, historical messages, and unrelated marketplace image uploads.

**Architecture:** Keep the existing conversation API, authorization, model reads, Socket.IO delivery/read updates, and database schema. Remove frontend upload controls and backend upload/persistence paths; reject image payloads on every message-creation route and preserve rendering of historical image messages.

**Tech Stack:** React, Vite, Node.js, Express, express-validator, MySQL, Socket.IO, Node test runner.

**Spec:** [2026-11-12-text-only-messaging-design.md](../specs/2026-11-12-text-only-messaging-design.md)

## Global Constraints

- Accept non-empty text messages up to the existing 2,000-character limit.
- Reject image and attachment payload properties on both message-creation routes.
- Retire the authenticated message image upload endpoint with HTTP 410.
- Preserve existing messages, conversations, schema, historical image rendering, and text messaging behavior.
- Do not change product-ad, profile-picture, or other marketplace image uploads.
- The Socket.IO server has no client message creation event; do not introduce one.

## Review Focus

- Empty, whitespace-only, non-string, and over-2,000-character text bodies remain invalid on conversation sends; test in Task 1.
- Empty or non-empty attachment arrays and explicit image payload fields/message types are rejected on both creation routes before persistence; test in Task 1.
- The retired upload URL rejects requests without parsing or storing files; test in Task 1.
- Existing history still returns legacy image messages and their timestamps/read state; test in Task 1.
- Product and profile image upload behavior stays intact; run their existing tests in Task 1.
- The composer has no image button, hidden image input, preview, or upload request and still sends text; test in Task 2.

---

### Task 1: Enforce Text-Only Messaging in the Backend

**Files:**
- Create: `backend/tests/messageTextOnly.test.js`
- Delete: `backend/tests/messageAttachment.test.js`
- Delete: `backend/middleware/messageImageUpload.js`
- Delete: `backend/utils/messageAttachment.js`
- Delete: `backend/utils/detectImageType.js` if no other callers remain
- Modify: `backend/routes/messageRoutes.js`
- Modify: `backend/controllers/messageController.js`
- Modify: `backend/models/messageModel.js`
- Modify: `README.md` messaging setup section

**Interfaces:**
- Keep existing message endpoint URLs and successful text-send response shapes.
- `messageModel.sendMessage` accepts only `{ conversationId, senderId, message }`.
- `POST /api/messages/uploads` remains authenticated and returns HTTP 410 with a clear unsupported-image message.
- Both `POST /api/messages` and `POST /api/messages/conversations/:id/messages` reject image/attachment payload properties with HTTP 400 before any create/send model call.
- Do not modify `backend/config/schema.sql` or database initialization migrations.

- [ ] **Step 1: Write route tests for text-only behavior**

Create an Express/JWT test app following `backend/tests/profileImageRoutes.test.js`. Mock authentication's user lookup and message-model persistence functions. Assert:
  - a valid legacy `POST /api/messages` and a valid conversation send return 201 and send only text;
  - whitespace, non-string, and over-2,000-character conversation message bodies return 400;
  - `attachments` (including `[]`), `image`, `imageUrl`, `attachmentUrl`, `attachment_url`, `message_type: 'image'`, and `messageType: 'image'` are rejected on both creation routes without calling a persistence function;
  - unauthenticated message and upload requests return 401;
  - the retired upload endpoint returns 410 even when a multipart image is submitted;
  - historical image rows returned by the history endpoint retain their type, URL, timestamp, and read state;
  - conversation authorization failure remains a 403.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `cd backend && node --test tests/messageTextOnly.test.js`

Expected: FAIL because text-only rejection and the replacement route coverage are not implemented yet.

- [ ] **Step 3: Remove backend image creation and reject legacy inputs**

Remove the image-upload middleware from the route and replace `POST /uploads` with an authenticated 410 handler. Add a shared request guard in the message controller for known image/attachment fields and image message type, and apply it to both creation handlers before model access. Keep conversation send validation non-empty and capped at 2,000 characters. Remove Cloudinary upload code, attachment validation, attachment insert loop, and image-only notification text. Keep historical attachment fields in message reads and do not alter schema/migrations. Update `README.md` to describe text-only messaging and remove message-upload Cloudinary setup/endpoint guidance. Delete image-only helpers only after confirming no non-message callers remain.

- [ ] **Step 4: Run focused backend regression tests**

Run: `cd backend && node --test tests/messageTextOnly.test.js`

Expected: PASS for text sends, invalid input rejection, both route guards, retired upload rejection, authentication/authorization, and historical-message reads.

- [ ] **Step 5: Run backend suite and marketplace image-upload tests**

Run: `cd backend && npm test`

Expected: PASS, including the existing product-image and profile-image upload tests.

### Task 2: Remove Frontend Image-Sending Controls

**Files:**
- Create: `frontend/tests/messageTextOnly.test.js`
- Modify: `frontend/src/pages/MessagesPage.jsx`
- Modify: `frontend/src/services/messageService.js`
- Modify: `frontend/src/index.css`

**Interfaces:**
- `sendConversationMessage(id, { message })` remains the only frontend send interface.
- Preserve existing send/loading/error feedback, conversation list/history, and historical image rendering.
- The composer contains only the text textarea and Send button.

- [ ] **Step 1: Write frontend source-contract tests**

Add Node tests following `frontend/tests/businessProfileRemoval.test.js`. Assert the MessagesPage still renders its text textarea and Send button and retains historical image-message rendering, but contains no image picker button, image file input, preview controls, file selection/upload handlers, or attachment payload. Assert `messageService.js` has no message-image upload helper or `FormData` request.

- [ ] **Step 2: Run focused frontend tests and confirm they fail**

Run: `cd frontend && node --test tests/messageTextOnly.test.js`

Expected: FAIL because the composer still exposes image selection and upload behavior.

- [ ] **Step 3: Remove image sending from the composer**

Delete file state/refs, object URL cleanup, selection/removal handlers, upload helper/import, preview markup, image input/button, and attachment payload. Send only `{ message: messageText.trim() }`; require non-empty text to enable submission. Keep historical image rendering and existing error/loading/read receipt behavior.

- [ ] **Step 4: Remove composer-only attachment styles**

Delete attachment preview and attach-button CSS. Retain the text composer and Send button styles, adjusting desktop/mobile spacing only as needed for the two remaining controls.

- [ ] **Step 5: Run frontend tests and production build**

Run: `cd frontend && npm test && npm run build`

Expected: PASS; the source-contract tests pass and Vite produces a production build.

### Task 3: Final Repository-Wide Audit

**Files:**
- Review: all frontend and backend messaging references to images, attachments, upload, files, `FormData`, `imageUrl`, and `attachmentUrl`

**Interfaces:**
- No active frontend or backend path can create a new image message.
- Product/profile image upload paths and historical-message reads remain active.

- [ ] **Step 1: Search messaging-related references**

Search the repository for the requested image/attachment/upload/file/FormData/payload terms. Classify each result as historical rendering/schema, an unrelated marketplace image feature, or an active message-send path. Remove any remaining active message-send path; do not delete historical records or unrelated marketplace features.

- [ ] **Step 2: Verify Socket.IO scope**

Inspect registered client-to-server Socket.IO handlers and confirm there is no message creation handler; the only current chat events remain join/leave and typing. Do not add a new handler or alter server-to-client message delivery.

- [ ] **Step 3: Run final required verification**

Run:

```bash
cd backend && npm test
cd ../frontend && npm test && npm run build
```

Expected: all backend tests, frontend tests, and the production build pass; no active image-sending path remains in messaging.
