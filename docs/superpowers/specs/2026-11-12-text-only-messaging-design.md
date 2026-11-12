# Text-Only Messaging Design

## Intent and scope

Remove the ability to create image messages while preserving text messaging, conversation behavior, and historical data. The frontend composer will contain only the text input and Send button. Existing historical image messages remain viewable.

## Goals and non-goals

- Accept non-empty text messages up to the existing 2,000-character limit.
- Reject attachment payloads and return a clear gone response for the retired image-upload endpoint.
- Preserve authentication, conversation participation checks, delivery/read updates, unread notifications, timestamps, and Socket.IO events.
- Keep existing image message records and attachment columns; do not migrate or delete data.
- Do not remove images elsewhere in the marketplace.

## Approaches considered

- Hide image controls only: rejected because API clients could still send images.
- Disable image creation across the frontend and backend while retaining historical display and schema: selected because it meets the request without risking existing conversations.
- Remove the image columns or historic rendering: rejected because it can destroy or hide conversation history unnecessarily.

## Implementation

Remove the composer attachment controls, file-selection/preview state, and upload service call. Submit only `{ message }`; retain current send/loading/error feedback and responsive composer styling.

Remove image-upload processing and attachment persistence from messaging. Reject attachment fields on both message-creation routes and respond with HTTP 410 at the retired upload endpoint. Preserve existing message reads so historic image entries remain visible. Leave database schema and initialization migrations unchanged.

## Verification

Add backend route coverage for text sends, attachment/upload rejection, and authentication/participant authorization. Run the backend test suite and frontend build/tests; inspect the composer at desktop and mobile widths if browser tooling is available.
