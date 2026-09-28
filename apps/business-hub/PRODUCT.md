# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The owner operates multiple businesses and gives agent teams access to run each business’s content strategy. Separate client-owner accounts are an open decision.

## Product Purpose

Extend the Postiz fork with business-scoped strategy, content operations, Fanvue publishing, and a Cloudflare-hosted MCP interface.

## Operating Context

An operator configures businesses and channels; agent teams read brand guidance, propose strategies, create content, schedule authorized posts, inspect analytics, and record reviews.

## Capabilities and Constraints

Postiz’s existing Node/PostgreSQL/Redis/Temporal publishing engine remains a separate service. The new business layer runs on Workers and Durable Objects. Fanvue uses its official OAuth and media APIs. Live publication requires connected accounts.

Business names, launch channels, Fanvue app access, and the persistent Postiz hosting destination are awaiting user input. No customer data or social connections have been supplied.

## Provisional Defaults

Human approval is required by default. An owner can explicitly enable automatic publication within a versioned, active strategy. This is an implementation default pending the user’s publishing-authority choice.

The dashboard extends Postiz’s existing light interface. A desktop operator with occasional phone use is an assumption, not a confirmed requirement.

## Product Principles

- Keep credentials and content scoped to one business.
- Show confirmed state and distinguish submission from publication.
- Make the same business workflow available to people and agents.
- Preserve uncertain outcomes for reconciliation instead of blindly retrying.

## Evidence on Hand

The upstream Postiz repository and official Fanvue API schema. All test businesses and posts are synthetic; production starts empty.
