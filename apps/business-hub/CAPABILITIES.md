# Wood Enterprises social operations: capability baseline

Baseline updated: 2026-10-06. Product/API research checked on 2026-10-04. This is the rewrite's delivery specification, not a claim that the listed features already work. The current hub is a foundation. A commercial replacement must complete the whole cycle for each launched company: **plan → create → approve → publish → engage → measure → improve**.

The user has accepted a substantial rewrite. Cloudflare remains the target for the new application. The Postiz bridge can preserve channel coverage during migration; it does not count as a native implementation, and an upstream feature does not count as a hub feature unless people and authorized agents can actually use it here. DigitalOcean remains an option for the transitional engine or workloads that need a persistent container.

## Benchmark and completion rules

The benchmark combines the major workflows of [Hootsuite](https://www.hootsuite.com/platform), [Buffer publishing](https://buffer.com/publish), [Buffer Community](https://buffer.com/community), [Buffer Insights](https://buffer.com/insights), and [commercial Postiz](https://postiz.com/), plus Fanvue creator operations. Their plans and platform coverage differ; the objective is complete business workflows rather than copied branding or identical screens.

Hootsuite establishes the broader benchmark for inbox operations, listening, team routing, and reporting. Buffer establishes a clear publishing/calendar, collaboration, comment-response, and analytics baseline. Postiz contributes broad channel scheduling, channel-specific variants, recurring/feed-based content, creative production, media, and agent interfaces. This is our synthesis of those products' published capabilities, not a statement that every vendor supports every workflow on every network.

A feature is complete only when it has:

1. A working human workflow and equivalent agent operations where appropriate, using the same authorization and state transitions.
2. Business, channel, and account isolation; distinct rights for reading private conversations, sending replies, moderation, bulk campaigns, and commercial actions.
3. Clear pending, success, failure, unsupported, disconnected, expired-access, and uncertain-delivery states.
4. Durable execution and recovery where needed, plus observable provider outcomes and an audit trail.
5. Tests of the important failure boundaries and live verification on an authorized account. Mocked provider tests alone are not live verification.
6. A provider capability declaration and evidence of supported formats/scopes. Unavailable APIs must be shown as unavailable or routed to an explicit manual workflow.

No percentage-complete score is used: a missing inbox or unreliable delivery is not offset by several smaller completed features. Exceptions to the commercial baseline remain visible and need a deliberate product decision.

## Required workflow coverage

These IDs also appear in the read-only `get_capabilities` MCP/REST response. `Implemented` refers to the stated current scope, not the whole category or live-account verification. `Partial` identifies a usable subset. `Missing` means the hub does not provide that workflow.

| ID | Commercial acceptance bar | Current hub |
| --- | --- | --- |
| company_mandate | Company goals, offers, audiences, brand guidance, channel scope, operating policy, service ownership, onboarding and pause | Implemented: versioned brief and launch checks |
| staff_identity | Individual Wood staff and company identities, memberships, invites, channel access, SSO/MFA integration, revocation | Partial: global operator plus scoped bearer access |
| versioned_strategy | Strategy, pillars, success measures, channel cadence, approval and revision history | Implemented: versioned strategy and activation |
| campaign_calendar | Ideas, campaigns, objectives, dates, production tasks, week/month/list calendar, filters, bulk moves and timezone handling | Missing: current content list is not a calendar |
| content_composer | One concept with per-channel variants, previews, threads, supported video/carousel/story formats, first comments, alt text, templates, duplication and validation | Partial: one channel per draft with text/media references |
| asset_library | Searchable shared assets, folders/tags, reuse, rights/consent/provenance, thumbnails, transformations, upload progress and provider delivery | Partial: Fanvue multipart upload and external media references |
| creative_production | Brief-to-copy/image/video jobs, reusable brand inputs, variants, review and lineage, cost limits, repurposing and long-to-short workflows | Missing: external agents can write copy but no integrated production workflow |
| durable_scheduling | Queue/schedule/publish/cancel with version checks, quotas, connection checks, retry rules and durable recovery | Implemented: existing queue and approval boundaries |
| delivery_tracking | Accepted/published/failed distinction, provider IDs/URLs, delivery webhooks or bounded reconciliation, alerts, safe recovery from uncertain writes | Partial: receipts and manual reconciliation; no automatic Postiz final-status sync |
| evergreen_and_feeds | Recurring queues, feed ingestion, bulk import, slot selection, approval rules and explicit reminder-only formats | Missing |
| revision_approvals | Review current copy/media/destination/time, immutable approval binding and company-specific publication policy | Implemented core: strategy and draft approval; full media/format previews still belong to composer delivery |
| team_collaboration | Task owners, notes, internal discussions, multi-stage approvals, mentions, notifications, change history and company review access | Missing beyond existing audit and company approvals |
| unified_inbox | Public comments/mentions and private conversations in one workspace, paging/backfill, current unread state, search and deduplicated updates | Partial: Fanvue list/history, date/cursor paging and local workflow state; no webhook sync or other networks |
| comment_management | Read/respond, preserve reply context, and supported hide/delete/moderation actions with provider-specific limits | Missing |
| direct_messages | Read histories, draft/send replies and attachments, delivery/read state where available, explicit identity and channel context | Partial: reviewed text replies to existing Fanvue conversations, provider receipt and uncertainty hold; attachments/new chats remain |
| engagement_workflow | Assignment, exclusive response ownership, tags, notes, saved replies, priority/SLA, approval, escalation, resolution/reopen and human takeover | Partial: 15-minute claims, reply drafts/approval, human handoff, resolve/reopen, daily limits; routing/tags/SLA/automatic replies remain |
| audience_and_campaigns | Audience segments, fan/customer context, suppression/opt-out rules, retention journeys, approved bulk campaigns and Fanvue paid-message workflows | Missing |
| channel_metrics | Provider-specific account/post metrics, historical snapshots, comparison periods, freshness and definition of each metric | Partial: on-demand counts/analytics and manually recorded reviews |
| business_reporting | Goal progress, campaign/channel reports, exports, scheduled delivery, links/UTMs, conversion and revenue attribution with source evidence | Missing |
| listening_and_benchmarks | Owned mentions, search/keyword alerts, trends, sentiment, competitor comparisons and documented source coverage | Missing; broad listening may require a licensed data provider |
| scoped_mcp | Discoverable, business-scoped tools with typed input, role enforcement, audit, idempotency and meaningful outcomes | Implemented for the current content operations; discovery now states gaps |
| agent_work_execution | Durable tasks/runs, event triggers, scheduled reviews, leases, checkpoints, retries, budgets, cancellation, approvals and handoffs | Missing: no agent runtime or recurring team jobs are started by the hub |
| mcp_oauth_and_grants | Human login and agent delegation, granular per-channel/action grants, OAuth client onboarding and revocation | Partial: role tokens plus channel-specific inbox read/reply draft/reply send grants; no MCP OAuth |
| service_operations | Monitoring, rate limits, credential health, alerts, backups and tested restore, retention/export/deletion, tenant quotas and incident controls | Partial: Worker observability, audit, encrypted provider credentials and publication reservations |

Additional suite capabilities remain on the roadmap: paid-ad/boosting integrations and paid-versus-organic reporting; review-site management; UGC and influencer workflows; employee advocacy; link-in-bio pages; mobile push/notification-assisted posting; localization; and Wood service usage/cost allocation. These are visible expansion tracks rather than silently claimed parity. Exact scope depends on the companies and networks launched; no ad budget or external vendor subscription is authorized by this specification.

## Fanvue is a first-class connector

Fanvue must participate in the same campaign, media, inbox, approval, analytics, and MCP workflows as other channels while retaining its distinct audience and commercial controls. See [FANVUE-CONTRACT.md](FANVUE-CONTRACT.md) for the inspected API contract and scope gaps.

The target includes feed publishing; vault/media handling; own-post comments; existing and authorized new conversations; subscriber/follower segments; saved replies; subscription/retention events; earnings and conversion reporting; and separately authorized paid or bulk campaigns. Creator/agency delegation is a separate grant boundary. Connecting one creator must never expose other creators or their fans to a company.

The current connector covers publishing, uploads, post retrieval, profile counts, and an initial conversation workflow with reviewed text replies. Publishing-only OAuth remains the default; explicit inbox authorization additionally requests chat read/write scopes. No fan or earnings scopes are requested. Inbox operations fail closed if Fanvue has not returned the necessary scopes. See [ENGAGEMENT.md](ENGAGEMENT.md) for the shipped workflow and its limits. Provider documentation is evidence of an API path, not proof that our app is approved for it or that a creator has consented.

## Agent workflow and human controls

The application owns workflow state, permissions, receipts and audit. Agent teams own planning and judgment within their assigned authority. A model completion alone is never a delivery receipt or an approval.

| Work | Target agent operations | Execution boundary |
| --- | --- | --- |
| Discover and plan | Read capabilities/mandate; retrieve evidence; manage ideas, campaigns and calendar | Only connected, authorized channels and verified supported formats |
| Produce | Create copy/asset jobs and per-channel variants; attach provenance | Asset rights, brand constraints and cost budgets travel with the content |
| Review and publish | Request approval; schedule approved revisions; inspect receipts | Exact content/asset/destination/time approval; pause and revocation checked before delivery |
| Engage | Receive events; claim conversations; read context; draft replies; submit or send; escalate and resolve | Separate private-read and reply-send grants; latest conversation revision and current company policy |
| Learn | Read metric snapshots and revenue evidence; report outcomes; propose strategy changes | Preserve source/time/metric definitions; distinguish missing data from zero |

New tool names in this table are conceptual contracts, not registered tools. Clients must use MCP `tools/list` plus `get_capabilities` to discover the actual release.

Engagement policy is configurable per business. The current implementation supports only human-reviewed replies; automatic routine replies are a future policy mode that needs explicit business delegation. A routine-reply allowance must specify channels, response types, approved knowledge, volume limits, hours, escalation topics and a pause control. Publishing permission does not grant DM permission. Private conversation access does not grant send permission. Routine replies do not authorize new bulk campaigns, paid offers, price changes, account blocking, or refunds.

Outbound replies bind to the locally observed conversation revision and re-read current provider history before sending. The claim prevents concurrent hub agents from answering; changed history invalidates approval. Fanvue does not provide an atomic history-version precondition on send, so a new message or an operator using Fanvue directly can still race the last check. Webhook ingestion remains a required next step, and cannot by itself make the external read/send atomic. Human takeover stops agent sends on that conversation. Uncertain send outcomes remain held for reconciliation. Audience text is untrusted input, never a source of credentials or operating instructions. Avoid retaining conversation content in general application logs.

## Cloudflare target and migration

This is a target design, not infrastructure already provisioned:

- Workers serve the app, authenticated API, MCP and planned webhook ingress.
- Business Durable Objects own mandate/approval versions and service state. Channel/conversation coordination can move to separate Durable Objects as traffic grows; a single business lock must not serialize every inbox read forever.
- [Queues](https://developers.cloudflare.com/queues/) and [Workflows](https://developers.cloudflare.com/workflows/) handle bounded ingest, publication, media and report jobs with deduplication, retry and dead-letter handling. Durable Objects retain the authoritative lock/receipt boundary for external effects.
- [R2](https://developers.cloudflare.com/r2/) holds media and derivative assets. An indexed query store such as D1 supports calendars, search and reporting with tenant keys on every row and query. Choose indexes and partitions against representative workloads before migration.
- Model/media providers or container workers execute generation/transcoding that is unsuitable for a request-lifetime Worker. MCP coordinates the work; it does not turn an HTTP request into a long-running agent process.
- Postiz remains a compatibility adapter until each replacement connector passes its format, OAuth, quota, scheduling, inbox and analytics acceptance tests. Keep one publication owner per job to avoid duplicate sending during cutover. A provider can remain bridged without being called native.

Provider adapters declare operations, formats, authorization scopes, limits, events, idempotency semantics and error/retry behavior. The UI and MCP must consume the same declarations. Unsupported private messaging or moderation cannot be manufactured by passing arbitrary provider URLs through MCP.

## Delivery order and release gates

1. **Coverage and access foundation:** baseline, typed capability discovery, granular grant design, provider contract fixtures, data/receipt migration plan. Current release adds the baseline, discovery and per-channel conversation grants; staff identity and broader grants are still pending.
2. **Fanvue engagement vertical slice:** consented chat/fan scopes; authenticated webhook ingestion/backfill; inbox; conversation ownership; reply drafts/approval/send; human handoff; uncertainty handling. Gate: duplicate, reordered, stale, revoked, wrong-creator and concurrent-agent tests, then an authorized real read/reply verified in Fanvue. The initial read/claim/draft/review/send/handoff path now exists with mocked integration coverage. Webhook ingestion/backfill, fan scopes and live creator verification are still pending. No bulk or paid campaigns piggyback on this gate.
3. **Commercial content workspace:** campaign calendar, variants/previews, media library, templates, collaborative approvals, recurring/feed queues, delivery reconciliation and native-provider migration. Gate: plan a multi-channel campaign, approve it, publish supported formats, reconcile outcomes and recover a failure.
4. **Measurement and agent execution:** historical metrics, goals/revenue reports, work queue/events, review schedules, budgets and checkpoints. Gate: a team resumes after interruption, handles audience responses, produces a source-backed report and proposes the next strategy iteration.
5. **Portfolio operations and expansion:** restore/retention testing, load/SLA tests, listening data, remaining provider capabilities and commercial expansion tracks. Gate: Wood operates multiple real companies with isolated data and grants, attributable results and documented recovery procedures.

These are dependency milestones, not dates or claims that later stages are optional. Commercial parity remains false until the required workflow gates and platform coverage are verified; remaining exceptions must be stated explicitly.

## Evidence and verification

Product sources above were checked on 2026-10-04. Runtime coverage comes from `src/workspace.ts`, `src/connectors.ts`, `src/mcp.ts`, `public/app.js` and the integration suite. The upstream Postiz public controller and provider interface were inspected separately; their existence does not automatically expose an inbox in the Worker bridge. No customer channels were connected and no audience messages were sent during this audit.

`get_capabilities` reports implementation coverage, local connection presence and the current service status without calling providers or exposing credentials. It states that Fanvue scope checks are enforced at execution, but does not assert current health, actual token entitlements or live verification. Operation-level checks remain authoritative. Keep `src/capabilities.ts`, this baseline, the provider contract, and `VALIDATION.md` aligned as work ships.
