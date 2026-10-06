# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Wood Enterprises operates a shared content service for its operating companies. Company representatives supply the business mandate and channel access; Wood operators prepare strategy and give agent teams scoped access to deliver it.

## Product Purpose

Let an operating company onboard with its goals and relevant channels, then have Wood Enterprises run its full social operation: planning, creative production, approvals, publishing, audience engagement, measurement, and strategy improvement. People and agent teams work through the same business policies, with MCP covering the full permitted workflow.

The user has accepted a substantial rewrite and wants the major commercial capabilities of Hootsuite, Buffer, and Postiz plus first-class Fanvue. [CAPABILITIES.md](CAPABILITIES.md) is the acceptance baseline and gap register; the current hub does not yet meet commercial parity.

## Operating Context

Wood creates the company and invites its representative through expiring, revocable company access. Four saveable steps capture measurable goals, offer, audience, voice, assets, channels, and review policy. Wood verifies readiness, activates strategy, assigns a team and review cadence, and launches. Agent teams read the current mandate, create content, schedule authorized posts, inspect analytics, and record reviews.

## Capabilities and Constraints

The target is a Cloudflare-native application with platform adapters. The current hub runs on Workers and Durable Objects and still depends on a separate Postiz engine for bridged channels. Migrate that dependency one verified provider/workflow at a time. DigitalOcean remains available for the transitional engine or container workloads, not a requirement to abandon the rewrite. Fanvue uses official APIs. Live publication requires connected accounts and a launched service; the agent runtime is a separate dependency until durable team execution is implemented.

Wood has a global operator credential. Each company representative and agent is scoped to one company. Company access links are bearer credentials, not email-verified accounts; no open registration, email delivery, staff SSO, or billing is implemented.

The first launch companies, their non-Fanvue channel priorities, app credentials, and agent runtime are not yet specified. No customer data or social connections have been supplied.

## Provisional Defaults

Invitation-led onboarding is the current default. A company approves its strategy, then Wood manages publishing; alternatives require company approval of every post or delegate strategy and publishing to Wood. The chosen policy is recorded in the brief and confirmed by Wood at launch. These defaults are configurable pending the user’s preference. Changing a submitted brief or strategy holds publication until reviewed and launched again.

Audience engagement has its own per-business policy, off by default. The current Fanvue inbox supports reviewed text replies, conversation claims and human takeover, with separate channel read/draft/send grants. Future automatic replies, moderation, paid offers and bulk campaigns require additional policy and grants. This is a product design default, not a live messaging authorization.

The dashboard extends Postiz’s existing light interface. A desktop operator with occasional phone use is an assumption, not a confirmed requirement.

## Product Principles

- Keep credentials and content scoped to one business.
- Show confirmed state and distinguish submission from publication.
- Give companies ownership of their mandate and Wood control of service launch and agent access.
- Make business context and permitted content operations available to agent teams through MCP.
- Preserve the whole content-to-engagement-to-measurement loop in the rewrite. Do not equate an upstream feature or documented API endpoint with an implemented hub capability.
- Tell agents which workflows are supported, which are partial, and which need platform access or implementation.
- Preserve uncertain outcomes for reconciliation instead of blindly retrying.

## Evidence on Hand

The upstream Postiz repository and official Fanvue API schema. All test businesses and posts are synthetic; production starts empty.
