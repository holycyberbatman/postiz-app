import { hasEngagementGrant } from './model';
import type { Actor, EngagementAction } from './model';
import { engagementTools } from './engagement';

// Implementation coverage, not account entitlement or permission to execute.
// Keep this baseline aligned with CAPABILITIES.md as each workflow is delivered.
export const capabilityAreas = ['workspace', 'planning', 'creation', 'publishing', 'collaboration', 'engagement', 'analytics', 'listening', 'agents', 'operations'] as const;
export type CapabilityArea = typeof capabilityAreas[number];
type Coverage = 'implemented' | 'partial' | 'not_implemented';
type Tool = { name: string; role: 'reader' | 'editor' | 'publisher'; action?: EngagementAction };
type Feature = { id: string; area: CapabilityArea; coverage: Coverage; summary: string; tools: Tool[] };
const read = (...names: string[]): Tool[] => names.map(name => ({ name, role: 'reader' }));
const edit = (...names: string[]): Tool[] => names.map(name => ({ name, role: 'editor' }));
const publish = (...names: string[]): Tool[] => names.map(name => ({ name, role: 'publisher' }));

export const featureCatalog: Feature[] = [
  { id: 'company_mandate', area: 'workspace', coverage: 'implemented', summary: 'Company briefs, goals, channel scope, review policy, launch and pause. Human controls use the portal/REST.', tools: read('get_operating_brief', 'get_business', 'list_channels') },
  { id: 'staff_identity', area: 'workspace', coverage: 'partial', summary: 'One Wood operator credential and scoped company/agent tokens. Individual staff accounts, SSO and granular memberships remain to build.', tools: [] },
  { id: 'versioned_strategy', area: 'planning', coverage: 'implemented', summary: 'Versioned strategy, pillars, cadence and activation. A new version holds managed-service publication for review.', tools: [...read('get_business'), ...edit('save_strategy')] },
  { id: 'campaign_calendar', area: 'planning', coverage: 'not_implemented', summary: 'Campaigns, idea backlog, calendar views, production tasks and bulk rescheduling are not available in the hub.', tools: [] },
  { id: 'content_composer', area: 'creation', coverage: 'partial', summary: 'Single-channel drafts with media references. Cross-channel variants, previews, format validation and reusable templates remain to build.', tools: [...read('list_drafts', 'get_draft'), ...edit('create_draft', 'update_draft')] },
  { id: 'asset_library', area: 'creation', coverage: 'partial', summary: 'Fanvue multipart uploads exist. Shared searchable asset storage, rights metadata, transforms and Postiz uploads through the hub do not.', tools: [...read('fanvue_media_status'), ...edit('fanvue_upload_start', 'fanvue_upload_part', 'fanvue_upload_complete')] },
  { id: 'creative_production', area: 'creation', coverage: 'not_implemented', summary: 'Text/image/video generation jobs and reviewable creative variants need an integrated generation workflow.', tools: [] },
  { id: 'durable_scheduling', area: 'publishing', coverage: 'implemented', summary: 'Revision-bound scheduling, cancellation, mandate checks, daily reservations and bounded rate-limit retry.', tools: [...publish('schedule_draft'), ...edit('cancel_draft')] },
  { id: 'delivery_tracking', area: 'publishing', coverage: 'partial', summary: 'Receipts and uncertain-outcome reconciliation exist. Postiz acceptance is submitted; automatic final-status synchronization remains to build.', tools: read('get_draft', 'fanvue_posts', 'postiz_posts') },
  { id: 'evergreen_and_feeds', area: 'publishing', coverage: 'not_implemented', summary: 'Recurring queues, RSS ingestion, bulk import and reminder-only publication are not hub workflows yet.', tools: [] },
  { id: 'revision_approvals', area: 'collaboration', coverage: 'implemented', summary: 'Company strategy and optional per-post approval bound to current revisions. Approvals and launch are human portal/REST operations.', tools: read('get_draft', 'get_operating_brief') },
  { id: 'team_collaboration', area: 'collaboration', coverage: 'not_implemented', summary: 'Assignments, internal discussions, notifications and multi-stage approval routing remain to build.', tools: [] },
  { id: 'unified_inbox', area: 'engagement', coverage: 'partial', summary: 'Fanvue conversation list/history with pagination and local workflow state. Other networks, webhook ingestion, search and automatic synchronization remain to build.', tools: engagementTools.filter(tool => ['list_conversations', 'get_conversation'].includes(tool.name)) },
  { id: 'comment_management', area: 'engagement', coverage: 'not_implemented', summary: 'Reading, replying to and moderating audience comments are not implemented in the hub.', tools: [] },
  { id: 'direct_messages', area: 'engagement', coverage: 'partial', summary: 'Reviewed text replies to existing Fanvue conversations. Separate channel read/draft/send grants and returned provider chat scopes are required. Attachments, new chats and other networks remain to build.', tools: engagementTools.filter(tool => ['get_conversation', 'send_reply', 'list_replies'].includes(tool.name)) },
  { id: 'engagement_workflow', area: 'engagement', coverage: 'partial', summary: 'Revision-bound reply drafts/approval, 15-minute claims, human takeover, daily limits and uncertain-send holds. Tags, saved replies, SLA/routing and automatic routine replies remain to build.', tools: engagementTools.filter(tool => !['list_conversations', 'get_conversation', 'send_reply'].includes(tool.name)) },
  { id: 'audience_and_campaigns', area: 'engagement', coverage: 'not_implemented', summary: 'Audience segments, retention journeys and paid/bulk messaging need distinct authorization and delivery controls.', tools: [] },
  { id: 'channel_metrics', area: 'analytics', coverage: 'partial', summary: 'On-demand provider metrics and strategy reviews exist. Fanvue currently exposes profile counts only; metric history and post-level aggregation remain to build.', tools: [...read('channel_analytics', 'list_reviews'), ...edit('record_review')] },
  { id: 'business_reporting', area: 'analytics', coverage: 'not_implemented', summary: 'Goal dashboards, scheduled/exportable reports, conversion attribution and revenue/ROI reporting remain to build.', tools: [] },
  { id: 'listening_and_benchmarks', area: 'listening', coverage: 'not_implemented', summary: 'Mentions, keyword alerts, sentiment, trend discovery and competitor benchmarks require data-source coverage as well as product implementation.', tools: [] },
  { id: 'scoped_mcp', area: 'agents', coverage: 'implemented', summary: 'Business-scoped Streamable HTTP MCP with role-filtered tool discovery, strict mutation checks and audit.', tools: read('get_capabilities', 'list_audit') },
  { id: 'agent_work_execution', area: 'agents', coverage: 'not_implemented', summary: 'Durable agent assignments, leases, event triggers, run budgets and human handoffs remain to build. External runtime is not started by service launch.', tools: [] },
  { id: 'mcp_oauth_and_grants', area: 'agents', coverage: 'partial', summary: 'Expiring/revocable role tokens and separate per-channel inbox/read, reply/draft and reply/send grants. MCP OAuth, moderation and commercial-action grants remain to build.', tools: [] },
  { id: 'service_operations', area: 'operations', coverage: 'partial', summary: 'Audit and Worker observability exist. Alerting, restore-tested backups, data lifecycle controls and service-level dashboards remain to build.', tools: read('list_audit') },
];

const connectors = {
  fanvue: {
    implementation: 'native',
    implemented: ['post.create', 'post.list', 'media.multipart_upload', 'media.status', 'profile.counts', 'chat.list', 'message.list', 'message.send.text_reply'],
    notImplemented: ['comment.list', 'comment.create', 'comment.delete', 'message.attachments', 'chat.create', 'message.mass_send', 'audience.segments', 'insights.earnings', 'webhook.ingest'],
    limitation: 'Inbox scopes require explicit reauthorization and must be returned by Fanvue. Only human-reviewed text replies to existing conversations are supported; no live engagement verification yet. Nested comment replies are not established by the inspected comment-create schema.',
  },
  postiz: {
    implementation: 'bridge',
    implemented: ['channel.list', 'post.submit', 'post.list', 'channel.analytics'],
    notImplemented: ['native.provider_oauth', 'inbox.read', 'message.send', 'comment.reply', 'media.upload', 'delivery.webhook_sync'],
    limitation: 'These are hub bridge capabilities. Provider-specific formats and analytics vary. Upstream product features are not automatically exposed in this hub or through MCP.',
  },
} as const;

export function capabilitySnapshot(actor: Actor, area: CapabilityArea | undefined, state: {
  businessId: string; serviceStatus: string;
  fanvue: { configured: boolean; connected: boolean };
  postiz: { configured: boolean; connected: boolean };
}) {
  const rank = ['reader', 'editor', 'publisher', 'owner'];
  return {
    businessId: state.businessId,
    baseline: '2026-10-06',
    productStage: 'foundation',
    commercialParity: false,
    serviceStatus: state.serviceStatus,
    authorization: 'Implementation coverage is not permission to execute. Connection presence does not verify current provider scopes or health. Use tools/list and the current operating brief; each operation enforces its own authorization.',
    features: featureCatalog.filter(feature => !area || feature.area === area).map(feature => ({
      ...feature,
      tools: feature.tools.filter(tool => rank.indexOf(actor.role) >= rank.indexOf(tool.role) && (!tool.action || hasEngagementGrant(actor, tool.action))).map(tool => tool.name),
    })),
    connectors: Object.fromEntries(Object.entries(connectors).map(([id, connector]) => [id, {
      ...connector, ...state[id as 'fanvue' | 'postiz'],
      scopeVerification: id === 'fanvue' ? 'enforced_per_operation' : 'not_recorded',
      liveVerification: 'not_recorded',
    }])),
  };
}
