# Text-Only Messaging Design

## Intent and scope

Remove the ability to create image messages while preserving text messaging, conversation behavior, and historical data. The frontend composer will contain only the text input and Send button. Existing historical image messages remain viewable.

## Goals and non-goals

- Accept non-empty text messages up to the existing 2,000-character limit.
- Reject image and attachment payload properties on both message-creation endpoints, including empty attachment arrays and explicit image message types.
- Return a clear gone response for the retired authenticated image-upload endpoint without parsing or storing files.
- Preserve authentication, conversation participation checks, delivery/read updates, unread notifications, timestamps, and Socket.IO events.
- Keep existing image message records, historical image rendering, and attachment columns; do not migrate or delete data.
- Do not remove images elsewhere in the marketplace.
- Do not add a Socket.IO message-send event; the current server accepts no client message creation events.

## Approaches considered

- Hide image controls only: rejected because API clients could still send images.
- Remove new image creation across the frontend and backend while retaining historical display and schema: selected because it meets the request without risking existing conversations.
- Remove the image columns or historic rendering: rejected because it can destroy or hide conversation history unnecessarily.

## Implementation

Remove the composer attachment controls, hidden file input, file-selection/preview state, upload service call, and attachment-specific styling. Submit only `{ message }`; retain current send/loading/error feedback and responsive composer styling.

Remove image-upload processing and attachment persistence from messaging. Reject known image and attachment properties on both message-creation routes with HTTP 400 before persistence; require a non-empty trimmed text body up to 2,000 characters for conversation sends. Respond with HTTP 410 at the retired upload endpoint. Preserve existing message reads so historic image entries remain visible. Leave database schema and initialization migrations unchanged. Product-ad, profile-picture, and other marketplace image handling remains unchanged.

## Verification

Add backend route coverage for valid text sends, invalid text, image/attachment payload rejection on both creation routes, retired upload rejection, authentication/participant authorization, and historical image reads. Add a frontend source-contract test for the text-only composer and ensure existing image upload tests remain passing. There is no client-to-server Socket.IO message creation event to test; verify this by inspecting the socket event registrations. Run the complete backend test suite and frontend tests/build, and inspect composer styles at desktop/mobile breakpoints.
