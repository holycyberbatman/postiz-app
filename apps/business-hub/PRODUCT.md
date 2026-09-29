# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Wood Enterprises operates a shared content service for its operating companies. Company representatives supply the business mandate and channel access; Wood operators prepare strategy and give agent teams scoped access to deliver it.

## Product Purpose

Let an operating company onboard with its goals and relevant channels, then have Wood Enterprises run strategy, content production, publishing, and performance reviews through a business-scoped MCP interface.

## Operating Context

Wood creates the company and invites its representative through expiring, revocable company access. Four saveable steps capture measurable goals, offer, audience, voice, assets, channels, and review policy. Wood verifies readiness, activates strategy, assigns a team and review cadence, and launches. Agent teams read the current mandate, create content, schedule authorized posts, inspect analytics, and record reviews.

## Capabilities and Constraints

Postiz’s existing Node/PostgreSQL/Redis/Temporal publishing engine remains a separate service. The new business layer runs on Workers and Durable Objects. Fanvue uses its official OAuth and media APIs. Live publication requires connected accounts and a launched service. The external agent runtime must be configured separately.

Wood has a global operator credential. Each company representative and agent is scoped to one company. Company access links are bearer credentials, not email-verified accounts; no open registration, email delivery, staff SSO, or billing is implemented.

Business names, launch channels, Fanvue app access, and the persistent Postiz hosting destination are awaiting user input. No customer data or social connections have been supplied.

## Provisional Defaults

Invitation-led onboarding is the current default. A company approves its strategy, then Wood manages publishing; alternatives require company approval of every post or delegate strategy and publishing to Wood. The chosen policy is recorded in the brief and confirmed by Wood at launch. These defaults are configurable pending the user’s preference. Changing a submitted brief or strategy holds publication until reviewed and launched again.

The dashboard extends Postiz’s existing light interface. A desktop operator with occasional phone use is an assumption, not a confirmed requirement.

## Product Principles

- Keep credentials and content scoped to one business.
- Show confirmed state and distinguish submission from publication.
- Give companies ownership of their mandate and Wood control of service launch and agent access.
- Make business context and permitted content operations available to agent teams through MCP.
- Preserve uncertain outcomes for reconciliation instead of blindly retrying.

## Evidence on Hand

The upstream Postiz repository and official Fanvue API schema. All test businesses and posts are synthetic; production starts empty.
