# Fanvue connector contract audit

Inspected 2026-10-04 against the official [OpenAPI document](https://api.fanvue.com/docs/openapi-v1.json). Download SHA-256: `4fcd2041d95e351688f7491f86d76d59db73d74c5f3a6f9e4a51508a2bfe46ed`. Its version-header default is `2025-06-26`, matching the hub's pinned header. Some endpoint descriptions also discuss experimental changes, so live fixtures against the selected version remain mandatory before release.

## API families and current coverage

Paths below are relative to `https://api.fanvue.com/v1`. The scopes are documented requirements, not grants currently held by our application.

| Workflow | Representative contract | Scope(s) | Hub status |
| --- | --- | --- | --- |
| Feed publishing and verification | `POST /posts`, `GET /posts`, `GET /posts/{uuid}` | `write:post`, `read:post` | Create and list implemented; direct item read/update/delete not exposed |
| Media uploads/readiness | `POST /media/uploads`, part URLs, complete, `GET /media/{uuid}` | `write:media`, `read:media` | Implemented multipart and readiness tools |
| Vault library and collections | `/media`, `/collections` | `read:media` / `write:media`, `read:post` / `write:post` as appropriate | Missing library workflow |
| Own-post comments | `GET/POST /posts/{uuid}/comments`, `DELETE /posts/{uuid}/comments/{commentUuid}` | `read:post`, `write:post` | Missing |
| Conversation listing/history | `GET /chats`, `GET /chats/{userUuid}/messages` | `read:chat` | Implemented with explicit inbox consent and per-channel grants; not live verified |
| Existing-chat reply | `POST /chats/{userUuid}/message` | `write:chat` | Implemented with explicit inbox consent and per-channel grants; not live verified |
| New conversations | `POST /chats` | `write:chat` | Missing; separate proactive-contact policy needed |
| Saved replies and audience lists | `/chats/templates`, `/chats/lists/custom`, `/chats/lists/smart` | `read:chat`, `write:chat`, `read:fan` depending on operation | Missing |
| Bulk and paid messaging | `/chats/mass-messages`; message media/price fields | `write:chat`, and `read:fan` for mass sends | Missing; separate approved campaign/price/recipient boundaries |
| Fans and subscribers | `/followers`, `/subscribers`, `/subscribers/{userUuid}` | `read:fan` | Missing |
| Revenue and retention | `/insights/earnings`, `/insights/subscribers`, `/insights/fan-retention-summary`, fan insights | `read:insights`, with `read:fan` for fan-specific data | Missing; current hub analytics are profile counts |
| Attribution | `/tracking-links` and associated user results | `read:tracking_links`, `write:tracking_links` | Missing |
| Events | `/webhooks/subscriptions` | `read:self` for registration; event families require their resource scopes | Missing ingestion and subscription workflow |
| Creator delegation | `/creators/{creatorUserUuid}/…`, agency endpoints | `read:creator` and operation-specific scopes | Missing; existing connector binds one creator per business |

The table is a normalized endpoint inventory, not a claim that the hub supports these operations. Default publishing OAuth requests `openid offline_access offline read:self read:post write:post read:media write:media`. The explicit “Connect publishing + inbox” action additionally requests `read:chat write:chat`. Returned scopes are encrypted with the credential; unknown scopes fail closed for inbox operations. Refresh preserves recorded scopes only when the refresh response omits its scope field; returned scope changes replace the old list. Reconnecting disables the engagement policy until a human enables it again. Old role tokens receive no conversation grants automatically. Missing scopes, app entitlement, and live verification are separate concerns.

## Interaction details that affect the design

The inspected chat contract addresses a conversation by the counterpart's user UUID. Chat listing uses an opaque cursor; message history uses separate sent/received date cursors. Reading history must leave `markAsRead=false` unless a distinct mutation authorizes changing read state. The comment-create contract permits text on the creator's own post and has no parent-comment field; nested replies are therefore unverified, not a feature to infer from the endpoint name. These details come from the [OpenAPI contract](https://api.fanvue.com/docs/openapi-v1.json).

Creator message events cover inbound/outbound activity, deletion, reactions, mass sends and read state. Event fields use snake_case and may be omitted; event processing must normalize them without erasing previously known values. Prefer events for current activity and use paginated reads for backfill/reconciliation. [Creator message events](https://api.fanvue.com/docs/creator/messages)

Verify the raw-body signature and delivery timestamp before accepting an event. API-created subscriptions have individual signing secrets that must be stored when created; the app-level secret is a different registration path. Resolve a subscription to the expected business/creator server-side, verify the creator in the payload, durably deduplicate the event, then acknowledge. [Signature verification](https://api.fanvue.com/docs/webhooks/signature-verification), [delivery and idempotency](https://api.fanvue.com/docs/webhooks/delivery-and-idempotency)

## Acceptance fixtures before engagement is called implemented

- Real-account scope/entitlement checks and correct creator binding; revoked grants cannot read private history or send.
- Duplicate/reordered webhooks, wrong creator, incorrect signature, expired timestamp and unknown event are handled without cross-tenant writes or duplicate sends.
- A user message arriving after a reply is drafted invalidates stale automatic-send assumptions; edits/approval/claim checks use an expected revision.
- Two agent teams cannot reply to the same conversation concurrently. Human takeover and company pause prevent the next outbound operation.
- A timed-out/ambiguous send is held for reconciliation, including worker restart after the provider accepts it. A successful HTTP response is validated for a usable provider receipt.
- Pagination handles empty/partial pages, deleted content, omitted fields and cursor changes. A read never silently marks a chat as read.
- Paid-media and mass sends use separate grants, exact approved media/price/recipient scope, suppression rules and duplicate protection. A routine reply grant cannot invoke them.
- Fanvue metrics retain their meaning, date range, currency where relevant, and retrieval time; revenue is never inferred from likes or subscriber counts.

The current suite exercises explicit consent/grants, private-read isolation, cursor history without read-state mutation, competing claims, exact approval, changed history, handoff, daily limits, pause/revocation, idempotent sends, malformed receipts and ambiguous outcomes with mocked Fanvue responses. Webhook, paid/bulk and metric fixtures remain future work. No live Fanvue engagement has been verified; `messageUuid` proves API acceptance, not recipient delivery or reading.
