import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions, Response as MFResponse, Request as MFRequest } from 'miniflare';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const admin = 'test-admin-'.padEnd(64, 'a');
const creator = '123e4567-e89b-42d3-a456-426614174000';
let mf: Miniflare;
let directory: string;
let externalPosts: Record<string, number> = {};
let providerRequestCount = 0;
let providerMode = 'success';
let fanvueScopes: string | undefined;
const fan = '550e8400-e29b-41d4-a716-446655440001';
let chatMessages = [{ uuid: '550e8400-e29b-41d4-a716-446655440010', text: 'What is coming up this week?', sentAt: '2026-10-04T10:00:00Z', sender: { uuid: fan, handle: 'synthetic-fan' }, recipient: { uuid: creator, handle: 'test-creator' }, status: 'SENT', type: 'SINGLE_RECIPIENT', gif: null }];
let chatSends = 0;
let chatMode = 'success';
let tokenExchanges: Array<URLSearchParams> = [];
let tokens: Record<string, string> = {};
let base = '';

async function api(path: string, body?: unknown, token = admin, method = body === undefined ? 'GET' : 'POST') {
  const response = await mf.dispatchFetch(`https://hub.test${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() as any, headers: response.headers };
}
const op = (name: string, input: unknown = {}, token = admin, business = 'alpha') => api(`/api/businesses/${business}/${name}`, input, token);
const strategy = { title: 'Earn trust', objective: 'Grow qualified interest', pillars: [{ name: 'Education', guidance: 'Explain the craft accurately' }], cadence: [{ channelId: 'postiz:channel-a', postsPerWeek: 3 }], guardrails: ['No unsupported claims'], successMetrics: ['Qualified visits'] };
function draft(requestId: string, extra: object = {}) {
  return { requestId, title: 'Behind the work', content: 'Here is our process.', channelId: 'postiz:channel-a', pillar: 'Education', scheduledAt: new Date(Date.now() + 3600000).toISOString(), media: [], settings: {}, ...extra };
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'postiz-hub-test-'));
  await build({ entryPoints: ['src/index.ts'], outfile: join(directory, 'worker.mjs'), bundle: true, format: 'esm', platform: 'browser', target: 'es2022', external: ['cloudflare:workers', 'node:*'], logLevel: 'silent' });
  mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: await readFile(join(directory, 'worker.mjs'), 'utf8'), compatibilityDate: '2026-09-27',
    durableObjects: { BUSINESSES: { className: 'BusinessWorkspace', useSQLite: true }, DIRECTORY: { className: 'BusinessDirectory', useSQLite: true } },
    bindings: { HUB_ADMIN_TOKEN: admin, TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32), PUBLIC_ORIGIN: 'https://hub.test', POSTIZ_ORIGIN: 'https://postiz.test', FANVUE_API_VERSION: '2025-06-26', FANVUE_CLIENT_ID: 'test-client', FANVUE_CLIENT_SECRET: 'test-secret' },
    serviceBindings: { ASSETS: () => new MFResponse('Test assets') },
    outboundService: async (request: MFRequest) => {
      providerRequestCount += 1;
      const url = new URL(request.url);
      if (url.hostname === 'postiz.test') {
        if (url.pathname.endsWith('/integrations')) {
          const isBeta = request.headers.get('Authorization') === 'beta-postiz-key';
          return MFResponse.json([{ id: isBeta ? 'channel-b' : 'channel-a', name: isBeta ? 'Beta social' : 'Alpha social', identifier: 'linkedin', disabled: false }]);
        }
        if (url.pathname.endsWith('/posts') && request.method === 'POST') {
          const value = await request.json() as any;
          const content = value.posts[0].value[0].content;
          externalPosts[content] = (externalPosts[content] || 0) + 1;
          if (providerMode === 'ambiguous') return MFResponse.json({ error: 'upstream failed' }, { status: 503 });
          if (providerMode === 'rate-limit-once' && externalPosts[content] === 1) return MFResponse.json({}, { status: 429, headers: { 'Retry-After': '1' } });
          return MFResponse.json([{ id: `accepted-${externalPosts[content]}` }]);
        }
      }
      if (url.hostname === 'auth.fanvue.com') {
        if (url.pathname.endsWith('/revoke')) return new MFResponse(null, { status: 200 });
        expect(request.headers.get('Authorization')).toBe(`Basic ${btoa('test-client:test-secret')}`);
        const values = new URLSearchParams(await request.text());
        tokenExchanges.push(values);
        expect(values.has('client_secret')).toBe(false);
        return MFResponse.json({ access_token: 'fanvue-access', refresh_token: 'fanvue-refresh', expires_in: values.get('grant_type') === 'authorization_code' ? 60 : 3600, ...(fanvueScopes ? { scope: fanvueScopes } : {}) });
      }
      if (url.hostname === 'api.fanvue.com') {
        expect(request.headers.get('X-Fanvue-API-Version')).toBe('2025-06-26');
        if (url.pathname === '/v1/users/me') return MFResponse.json({ uuid: creator, handle: 'test-creator', displayName: 'Test creator', isCreator: true, isAiCreator: false });
        if (url.pathname === '/v1/chats') return MFResponse.json({ data: [{ user: { uuid: fan, handle: 'synthetic-fan', displayName: 'Synthetic fan' }, isRead: false, lastMessageAt: chatMessages[0].sentAt, lastMessage: { text: chatMessages[0].text } }], nextCursor: url.searchParams.has('cursor') ? null : 'page-next' });
        if (url.pathname === `/v1/chats/${fan}/messages`) {
          expect(url.searchParams.get('markAsRead')).toBe('false');
          return MFResponse.json({ data: url.searchParams.has('sentBefore') ? [] : chatMessages, dateFilter: url.searchParams.has('sentBefore') ? null : { sentBefore: '2026-10-04T09:00:00Z', receivedBefore: '2026-10-04T09:00:00Z' } });
        }
        if (url.pathname === `/v1/chats/${fan}/message` && request.method === 'POST') {
          const body = await request.json() as any;
          expect(Object.keys(body)).toEqual(['text']);
          chatSends += 1;
          if (chatMode === 'ambiguous') return MFResponse.json({}, { status: 503 });
          if (chatMode === 'missing-receipt') return MFResponse.json({});
          if (chatMode === 'rejected') return MFResponse.json({}, { status: 429 });
          const messageUuid = `550e8400-e29b-41d4-a716-${String(chatSends).padStart(12, '0')}`;
          chatMessages.unshift({ uuid: messageUuid, text: body.text, sentAt: new Date().toISOString(), sender: { uuid: creator, handle: 'test-creator' }, recipient: { uuid: fan, handle: 'synthetic-fan' }, status: 'SENT', type: 'SINGLE_RECIPIENT', gif: null });
          return MFResponse.json({ messageUuid }, { status: 201 });
        }
        if (url.pathname === '/v1/media/uploads') return MFResponse.json({ uploadId: 'upload-alpha', mediaUuid: creator, partSize: 5242880, totalParts: 2, maxParts: 10000 });
        if (url.pathname === '/v1/media/uploads/upload-alpha/parts/urls') {
          expect(url.search).toBe('?from=1&to=1');
          return MFResponse.json({ partSize: 5242880, parts: [{ partNumber: 1, url: 'https://upload.example.test/part-1' }] });
        }
        if (url.pathname === '/v1/media/uploads/upload-alpha' && request.method === 'PATCH') {
          expect((await request.json() as any).parts).toHaveLength(2);
          return MFResponse.json({ mediaUuid: creator, status: 'processing' });
        }
        if (url.pathname === `/v1/media/${creator}`) return MFResponse.json({ uuid: creator, status: 'ready' });
        if (url.pathname === '/v1/posts' && request.method === 'POST') {
          const value = await request.json() as any;
          externalPosts[value.text] = (externalPosts[value.text] || 0) + 1;
          return MFResponse.json({ uuid: 'provider-post', publishedAt: new Date().toISOString() });
        }
      }
      return MFResponse.json({ error: `Unexpected test request ${url.pathname}` }, { status: 404 });
    },
  }));
  base = (await mf.ready).origin;
  for (const id of ['alpha', 'beta']) {
    expect((await api('/api/businesses', { id, name: id.toUpperCase(), timezone: 'America/New_York', managedService: false })).status).toBe(201);
    expect((await op('connect_postiz', { apiKey: `${id}-postiz-key` }, admin, id)).status).toBe(200);
  }
  for (const role of ['reader', 'editor', 'publisher']) {
    const result = await op('issue_token', { name: `${role} agent`, role });
    tokens[role] = result.body.token;
  }
}, 30000);
afterAll(async () => { await mf?.dispose(); if (directory) await rm(directory, { recursive: true, force: true }); });

describe.sequential('Business boundaries and content lifecycle', () => {
  test('authentication, tenant isolation, role checks, and origin validation', async () => {
    expect((await api('/api/businesses', undefined, 'invalid')).status).toBe(401);
    expect((await api('/api/businesses', undefined, tokens.reader)).body).toEqual([{ id: 'alpha', name: 'ALPHA' }]);
    expect((await op('get_business', {}, tokens.editor, 'beta')).status).toBe(403);
    expect((await op('save_strategy', strategy, tokens.reader)).status).toBe(403);
    expect((await op('issue_token', { name: 'escalated', role: 'publisher' }, tokens.editor)).status).toBe(403);
    const response = await mf.dispatchFetch('https://hub.test/api/businesses', { headers: { Authorization: `Bearer ${admin}`, Origin: 'https://evil.test' } });
    expect(response.status).toBe(403);
    expect((await mf.dispatchFetch('https://hub.test/api/businesses', { method: 'POST', headers: { Authorization: `Bearer ${admin}` }, body: 'invalid json' })).status).toBe(400);
    expect((await mf.dispatchFetch('https://hub.test/api/businesses', { method: 'POST', headers: { Authorization: `Bearer ${admin}` }, body: 'a'.repeat(100001) })).status).toBe(413);
    expect((await api('/api/businesses', { id: 'alpha', name: 'Duplicate', timezone: 'America/New_York' })).status).toBe(409);
  });
  test('renaming a business updates the portfolio without exposing other businesses', async () => {
    await op('update_business', { name: 'ALPHA renamed' });
    expect((await api('/api/businesses')).body.find((b: any) => b.id === 'alpha').name).toBe('ALPHA renamed');
    expect((await api('/api/businesses', undefined, tokens.reader)).body).toEqual([{ id: 'alpha', name: 'ALPHA renamed' }]);
    await op('update_business', { name: 'ALPHA' });
  });
  test('strategy activation is owner-only and validates connected channels', async () => {
    const saved = await op('save_strategy', strategy, tokens.editor);
    expect(saved.body.status).toBe('draft');
    expect((await op('activate_strategy', { version: saved.body.version }, tokens.publisher)).status).toBe(403);
    expect((await op('activate_strategy', { version: saved.body.version })).body.status).toBe('active');
  });
  test('concurrent retried creation is idempotent and mismatched payload is rejected', async () => {
    const input = draft('request-idempotent');
    const values = await Promise.all(Array.from({ length: 5 }, () => op('create_draft', input, tokens.editor)));
    expect(new Set(values.map(v => v.body.id)).size).toBe(1);
    expect((await op('create_draft', { ...input, content: 'Different' }, tokens.editor)).status).toBe(409);
  });
  test('publishing needs human approval and edits invalidate it', async () => {
    const input = draft('request-approval');
    const { body: value } = await op('create_draft', input, tokens.editor);
    expect((await op('schedule_draft', { id: value.id, revision: 1 }, tokens.publisher)).status).toBe(403);
    expect((await op('approve_draft', { id: value.id, revision: 1 }, tokens.publisher)).status).toBe(403);
    expect((await op('approve_draft', { id: value.id, revision: 1 })).status).toBe(200);
    const edited = await op('update_draft', { id: value.id, revision: 1, draft: { ...input, content: 'Edited after review' } }, tokens.editor);
    expect(edited.body.revision).toBe(2);
    expect(edited.body.approvedBy).toBeUndefined();
    expect((await op('schedule_draft', { id: value.id, revision: 1 }, tokens.publisher)).status).toBe(409);
    expect((await op('schedule_draft', { id: value.id, revision: 2 }, tokens.publisher)).status).toBe(403);
  });
  test('unknown channels and stale strategy versions cannot publish', async () => {
    expect((await op('create_draft', draft('request-wrong-channel', { channelId: 'postiz:channel-b' }), tokens.editor)).status).toBe(400);
    const { body: value } = await op('create_draft', draft('request-old-strategy'));
    await op('approve_draft', { id: value.id, revision: 1 });
    const saved = await op('save_strategy', strategy);
    await op('activate_strategy', { version: saved.body.version });
    expect((await op('schedule_draft', { id: value.id, revision: 1 }, tokens.publisher)).status).toBe(409);
  });
  test('a scheduled post is sent once; Postiz acceptance is reported as submitted', async () => {
    const content = 'one-publication';
    const { body: value } = await op('create_draft', draft('request-once', { content, scheduledAt: new Date(Date.now() + 1200).toISOString() }));
    await op('approve_draft', { id: value.id, revision: 1 });
    const results = await Promise.all([op('schedule_draft', { id: value.id, revision: 1 }, tokens.publisher), op('schedule_draft', { id: value.id, revision: 1 }, tokens.publisher)]);
    expect(results.map(v => v.status)).toEqual([200, 200]);
    await expect.poll(async () => (await op('get_draft', { id: value.id })).body.status, { timeout: 10000 }).toBe('submitted');
    expect(externalPosts[content]).toBe(1);
    expect((await op('cancel_draft', { id: value.id }, tokens.editor)).status).toBe(409);
  });
  test('ambiguous publication is held for owner reconciliation, never auto retried', async () => {
    providerMode = 'ambiguous';
    const { body: value } = await op('create_draft', draft('request-ambiguous', { content: 'unknown-outcome', scheduledAt: new Date(Date.now() + 1200).toISOString() }));
    await op('approve_draft', { id: value.id, revision: 1 });
    await op('schedule_draft', { id: value.id, revision: 1 });
    await expect.poll(async () => (await op('get_draft', { id: value.id })).body.status, { timeout: 10000 }).toBe('uncertain');
    expect(externalPosts['unknown-outcome']).toBe(1);
    expect((await op('schedule_draft', { id: value.id, revision: 1 })).status).toBe(409);
    expect((await op('resolve_uncertain', { id: value.id, outcome: 'published' })).status).toBe(400);
    expect((await op('resolve_uncertain', { id: value.id, outcome: 'published', providerId: 'verified-id' })).body.status).toBe('published');
    providerMode = 'success';
  });
  test('MCP client can initialize, discover role-filtered tools, and call within the business', async () => {
    const client = new Client({ name: 'integration-test', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp/alpha`), { requestInit: { headers: { Authorization: `Bearer ${tokens.reader}` } } });
    await client.connect(transport);
    const list = await client.listTools();
    expect(list.tools.some(t => t.name === 'get_business')).toBe(true);
    expect(list.tools.some(t => t.name === 'schedule_draft')).toBe(false);
    const result = await client.callTool({ name: 'get_business', arguments: {} });
    expect(JSON.stringify(result)).toContain('ALPHA');
    expect(JSON.stringify(result)).not.toContain('alpha-postiz-key');
    await client.close();
  });
  test('an explicit 429 is retried after the provider delay and then submitted', async () => {
    providerMode = 'rate-limit-once';
    const { body: value } = await op('create_draft', draft('request-rate-limit', { content: 'limited-once', scheduledAt: new Date(Date.now() + 1200).toISOString() }));
    await op('approve_draft', { id: value.id, revision: 1 });
    await op('schedule_draft', { id: value.id, revision: 1 });
    await expect.poll(async () => (await op('get_draft', { id: value.id })).body.retryAt, { timeout: 5000 }).toBeGreaterThan(Date.now());
    await expect.poll(async () => (await op('get_draft', { id: value.id })).body.status, { timeout: 10000 }).toBe('submitted');
    expect(externalPosts['limited-once']).toBe(2);
    providerMode = 'success';
  }, 15000);
  test('OAuth binds PKCE and business to a single-use browser state', async () => {
    const start = await op('connect_fanvue');
    expect(start.status).toBe(200);
    const authorize = new URL(start.body.url);
    const state = authorize.searchParams.get('state');
    const cookie = start.headers.get('Set-Cookie')!.split(';')[0];
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    const callback = `https://hub.test/oauth/fanvue/callback?state=${state}&code=test-code`;
    expect((await mf.dispatchFetch(callback)).status).toBe(400);
    const success = await mf.dispatchFetch(callback, { headers: { Cookie: cookie }, redirect: 'manual' });
    expect(success.status).toBe(303);
    expect(success.headers.get('Location')).toContain('business=alpha');
    expect((await mf.dispatchFetch(callback, { headers: { Cookie: cookie } })).status).toBe(400);
    expect(tokenExchanges[0].get('code_verifier')).toHaveLength(43);
    expect((await op('get_business')).body.connections.fanvue.uuid).toBe(creator);
    expect((await op('get_business', {}, admin, 'beta')).body.connections.fanvue).toBeNull();
  });
  test('Fanvue uploads are business-scoped and refresh tokens before media requests', async () => {
    expect((await op('fanvue_upload_start', { name: 'Sample', filename: 'sample.mp4', mediaType: 'video', sizeBytes: 6000000 }, tokens.reader)).status).toBe(403);
    const started = await op('fanvue_upload_start', { name: 'Sample', filename: 'sample.mp4', mediaType: 'video', sizeBytes: 6000000 }, tokens.editor);
    expect(started.body.totalParts).toBe(2);
    expect(tokenExchanges.filter(t => t.get('grant_type') === 'refresh_token')).toHaveLength(1);
    expect((await op('fanvue_upload_part', { uploadId: 'upload-alpha', partNumber: 1 }, admin, 'beta')).status).toBe(404);
    expect((await op('fanvue_upload_part', { uploadId: 'upload-alpha', partNumber: 3 }, tokens.editor)).status).toBe(404);
    expect((await op('fanvue_upload_part', { uploadId: 'upload-alpha', partNumber: 1 }, tokens.editor)).body).toEqual({ url: 'https://upload.example.test/part-1', partNumber: 1, partSize: 5242880 });
    expect((await op('fanvue_upload_complete', { uploadId: 'upload-alpha', parts: [{ PartNumber: 1, ETag: 'first' }, { PartNumber: 1, ETag: 'duplicate' }] }, tokens.editor)).status).toBe(400);
    expect((await op('fanvue_upload_complete', { uploadId: 'upload-alpha', parts: [{ PartNumber: 1, ETag: 'first' }, { PartNumber: 2, ETag: 'second' }] }, tokens.editor)).body.status).toBe('processing');
    expect((await op('fanvue_media_status', { id: creator })).body.status).toBe('ready');
  });
  test('explicit automatic policy permits the publisher to run an approved strategy', async () => {
    const saved = await op('save_strategy', { ...strategy, cadence: [{ channelId: `fanvue:${creator}`, postsPerWeek: 3 }] });
    await op('activate_strategy', { version: saved.body.version });
    await op('update_business', { publishingMode: 'automatic' });
    const { body: value } = await op('create_draft', draft('request-fanvue-auto', { content: 'Fanvue launch', channelId: `fanvue:${creator}`, scheduledAt: new Date(Date.now() + 1200).toISOString(), fanvue: { audience: 'subscribers', mediaUuids: [] } }), tokens.editor);
    expect((await op('schedule_draft', { id: value.id, revision: 1 }, tokens.publisher)).status).toBe(200);
    await expect.poll(async () => (await op('get_draft', { id: value.id })).body.status, { timeout: 10000 }).toBe('published');
    expect(externalPosts['Fanvue launch']).toBe(1);
  });
  test('revoked tokens cannot access the API or MCP', async () => {
    const issued = await op('issue_token', { name: 'temporary', role: 'reader' });
    await op('revoke_token', { id: issued.body.id });
    expect((await op('get_business', {}, issued.body.token)).status).toBe(401);
    expect((await mf.dispatchFetch(`${base}/mcp/alpha`, { method: 'POST', headers: { Authorization: `Bearer ${issued.body.token}` }, body: '{}' })).status).toBe(401);
  });
});

describe('Capability discovery', () => {
  test('reports implementation gaps without contacting providers or exposing credentials', async () => {
    const before = providerRequestCount;
    const result = await op('get_capabilities', {}, tokens.reader);
    expect(result.status).toBe(200);
    expect(providerRequestCount).toBe(before);
    expect(result.body.businessId).toBe('alpha');
    expect(result.body.commercialParity).toBe(false);
    expect(result.body.connectors.postiz).toMatchObject({ connected: true, implementation: 'bridge', scopeVerification: 'not_recorded' });
    expect(result.body.connectors.fanvue.notImplemented).toContain('message.mass_send');
    expect(result.body.features.find((feature: any) => feature.id === 'unified_inbox')).toMatchObject({ coverage: 'partial', tools: [] });
    const serialized = JSON.stringify(result.body);
    for (const secret of [admin, tokens.reader, 'alpha-postiz-key', 'fanvue-access', 'fanvue-refresh', 'test-secret']) expect(serialized).not.toContain(secret);
    expect((await op('get_capabilities', {}, tokens.reader, 'beta')).status).toBe(403);
    expect((await op('get_capabilities', { businessId: 'beta' }, tokens.reader)).status).toBe(400);
  });
  test('area filtering and MCP role discovery agree without granting missing workflow operations', async () => {
    expect((await op('get_capabilities', { area: 'unknown' }, tokens.reader)).status).toBe(400);
    const engagement = await op('get_capabilities', { area: 'engagement' }, tokens.publisher);
    expect(engagement.body.features.length).toBeGreaterThan(0);
    expect(engagement.body.features.every((feature: any) => feature.area === 'engagement')).toBe(true);
    expect(engagement.body.features.flatMap((feature: any) => feature.tools)).toEqual(['get_engagement_policy']);
    for (const role of ['reader', 'editor', 'publisher']) {
      const client = new Client({ name: 'capabilities-test', version: '1.0.0' });
      await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp/alpha`), { requestInit: { headers: { Authorization: `Bearer ${tokens[role]}` } } }));
      try {
        const discovered = (await client.listTools()).tools.map(tool => tool.name);
        const result = await client.callTool({ name: 'get_capabilities', arguments: {} });
        expect(result.isError).toBe(false);
        const catalog = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
        const advertised = catalog.features.flatMap((feature: any) => feature.tools);
        expect(advertised.every((name: string) => discovered.includes(name))).toBe(true);
        expect(advertised.includes('schedule_draft')).toBe(role === 'publisher');
        expect(advertised.includes('create_draft')).toBe(role !== 'reader');
        expect(discovered).not.toContain('send_message');
      } finally { await client.close(); }
    }
    const before = providerRequestCount;
    expect((await op('send_message', {}, tokens.publisher)).status).toBe(404);
    expect(providerRequestCount).toBe(before);
  });
});

describe.sequential('Wood Enterprises managed service', () => {
  const business = 'oak-company';
  let company = '';
  let publisher = '';
  let companyGrantId = '';
  let briefRevision = 0;
  let strategyVersion = 0;
  const managed = (operation: string, input: unknown = {}, token = admin) => op(operation, input, token, business);
  let brief: any = {
    name: 'Oak Company · test', timezone: 'America/New_York', contactName: 'Test representative', contactEmail: 'representative@example.test',
    website: 'https://example.test', offers: 'A synthetic service for testing', audience: 'Synthetic customers', brandVoice: 'Clear and practical',
    goals: [{ outcome: 'Increase qualified enquiries', metric: 'Qualified enquiries per month', target: '20', deadline: '' }],
    channels: [{ platform: 'LinkedIn', profileUrl: 'https://example.test/company', channelId: '' }],
    assetLinks: [], guardrails: ['No unsupported claims'], notes: '', reviewPolicy: 'company_strategy',
  };
  async function saveAndSubmit() {
    const saved = await managed('save_onboarding', { revision: briefRevision, brief }, company);
    expect(saved.status).toBe(200); briefRevision = saved.body.revision;
    expect((await managed('submit_onboarding', { revision: briefRevision }, company)).status).toBe(200);
  }
  test('company access is isolated and cannot grant access, manage agents, or publish', async () => {
    expect((await api('/api/businesses', { id: business, name: brief.name, timezone: brief.timezone })).status).toBe(201);
    const access = await managed('issue_company_access', { name: 'Company representative', days: 30 });
    company = access.body.token; companyGrantId = access.body.id;
    expect(access.body.role).toBe('company');
    expect((await api('/api/businesses', undefined, company)).body.map((value: any) => value.id)).toEqual([business]);
    expect((await op('get_business', {}, company, 'alpha')).status).toBe(403);
    for (const operation of ['issue_token', 'issue_company_access', 'start_service', 'save_strategy', 'update_business', 'resolve_uncertain', 'get_summary']) expect((await managed(operation, {}, company)).status).toBe(403);
    expect((await mf.dispatchFetch(`${base}/mcp/${business}`, { method: 'POST', headers: { Authorization: `Bearer ${company}` }, body: '{}' })).status).toBe(403);
    expect((await managed('issue_token', { name: 'Forged company grant', role: 'company' })).status).toBe(400);
  });
  test('company portal discovery exposes its mandate state without agent tool access', async () => {
    const result = await managed('get_capabilities', {}, company);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ businessId: business, serviceStatus: 'onboarding' });
    expect(result.body.features.flatMap((feature: any) => feature.tools)).toEqual([]);
    expect((await op('get_capabilities', {}, company, 'alpha')).status).toBe(403);
  });
  test('onboarding drafts save incrementally, enforce revisions, and reject invalid links', async () => {
    const saved = await managed('save_onboarding', { revision: 0, brief: { name: brief.name, timezone: brief.timezone } }, company);
    expect(saved.status).toBe(200); briefRevision = saved.body.revision;
    expect((await managed('submit_onboarding', { revision: briefRevision }, company)).status).toBe(400);
    expect((await managed('save_onboarding', { revision: 0, brief }, company)).status).toBe(409);
    expect((await managed('save_onboarding', { revision: briefRevision, brief: { ...brief, assetLinks: ['javascript:alert(1)'] } }, company)).status).toBe(400);
    expect((await managed('save_onboarding', { revision: briefRevision, brief: { ...brief, managedService: false } }, company)).status).toBe(400);
    await saveAndSubmit();
    const readiness = await managed('get_operating_brief', {}, company);
    expect(readiness.body.service.status).toBe('review');
    expect(readiness.body.checks.find((check: any) => check.id === 'channels').ready).toBe(false);
    expect((await managed('start_service', { team: 'Wood content team' })).status).toBe(409);
    expect((await api('/api/businesses')).body.find((value: any) => value.id === business).serviceStatus).toBe('review');
  });
  test('launch requires connected requested channels, company strategy approval, and publisher access', async () => {
    expect((await managed('connect_postiz', { apiKey: 'oak-postiz-key' }, company)).status).toBe(200);
    brief.channels[0].channelId = 'postiz:channel-a';
    await saveAndSubmit();
    const saved = await managed('save_strategy', strategy); strategyVersion = saved.body.version;
    await managed('activate_strategy', { version: strategyVersion });
    expect((await managed('approve_strategy', { version: strategyVersion, briefRevision })).status).toBe(403);
    expect((await managed('approve_strategy', { version: strategyVersion, briefRevision }, company)).status).toBe(200);
    expect((await managed('start_service', { team: 'Wood content team' })).status).toBe(409);
    const access = await managed('issue_token', { name: 'Wood publisher team', role: 'publisher' }); publisher = access.body.token;
    const input = draft('managed-before-launch');
    const created = await managed('create_draft', input, publisher);
    expect((await managed('schedule_draft', { id: created.body.id, revision: 1 }, publisher)).status).not.toBe(200);
    expect((await managed('get_operating_brief', {}, publisher)).body.ready).toBe(true);
    expect((await managed('start_service', { team: 'Wood content team', reviewEveryDays: 7 })).body.status).toBe('active');
    expect((await managed('get_business', {}, company)).body.business.publishingMode).toBe('automatic');
    const post = await managed('create_draft', draft('managed-live-test', { content: 'managed mock publication', scheduledAt: new Date(Date.now() + 1200).toISOString() }), publisher);
    expect((await managed('schedule_draft', { id: post.body.id, revision: 1 }, publisher)).status).toBe(200);
    await expect.poll(async () => (await managed('get_draft', { id: post.body.id })).body.status, { timeout: 10000 }).toBe('submitted');
    expect(externalPosts['managed mock publication']).toBe(1);
  });
  test('saving an unchanged brief preserves the active service and company approval', async () => {
    const before = (await managed('get_operating_brief')).body;
    const saved = await managed('save_onboarding', { revision: briefRevision, brief }, company);
    expect(saved.status).toBe(200);
    expect(saved.body.revision).toBe(briefRevision);
    const after = (await managed('get_operating_brief')).body;
    expect(after.service).toEqual(before.service);
    expect(after.service.status).toBe('active');
    expect(after.ready).toBe(true);
  });
  test('a company pause holds a queued post before any provider write', async () => {
    const post = await managed('create_draft', draft('managed-paused-test', { content: 'held by company pause', scheduledAt: new Date(Date.now() + 1200).toISOString() }), publisher);
    expect((await managed('schedule_draft', { id: post.body.id, revision: 1 }, publisher)).status).toBe(200);
    expect((await managed('pause_service', {}, company)).body.status).toBe('paused');
    await expect.poll(async () => (await managed('get_draft', { id: post.body.id })).body.status, { timeout: 10000 }).toBe('failed');
    expect(externalPosts['held by company pause']).toBeUndefined();
    expect((await api('/api/businesses')).body.find((value: any) => value.id === business).serviceStatus).toBe('paused');
    expect((await managed('start_service', { team: 'Wood content team' })).status).toBe(200);
  });
  test('MCP strategy revisions hold the service and update the Wood portfolio', async () => {
    const client = new Client({ name: 'wood-agent-test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp/${business}`), { requestInit: { headers: { Authorization: `Bearer ${publisher}` } } }));
    try {
      const tools = await client.listTools();
      expect(tools.tools.some(tool => tool.name === 'get_operating_brief')).toBe(true);
      expect(tools.tools.some(tool => tool.name === 'start_service' || tool.name === 'approve_strategy')).toBe(false);
      expect((await client.callTool({ name: 'save_strategy', arguments: { ...strategy, title: 'Refined strategy' } })).isError).toBe(false);
    } finally { await client.close(); }
    strategyVersion = (await managed('get_business')).body.strategy.version;
    expect((await api('/api/businesses')).body.find((value: any) => value.id === business).serviceStatus).toBe('review');
    await managed('activate_strategy', { version: strategyVersion });
    expect((await managed('start_service', { team: 'Wood team' })).status).toBe(409);
    expect((await managed('approve_strategy', { version: strategyVersion - 1, briefRevision }, company)).status).toBe(409);
    expect((await managed('approve_strategy', { version: strategyVersion, briefRevision }, company)).status).toBe(200);
  });
  test('per-post company approval cannot be substituted by Wood or reused after a brief change', async () => {
    brief.reviewPolicy = 'company_posts'; await saveAndSubmit();
    await managed('approve_strategy', { version: strategyVersion, briefRevision }, company);
    expect((await managed('start_service', { team: 'Wood team' })).status).toBe(200);
    const post = await managed('create_draft', draft('managed-company-review'), publisher);
    expect((await managed('approve_draft', { id: post.body.id, revision: 1 })).status).toBe(403);
    expect((await managed('approve_draft', { id: post.body.id, revision: 1 }, company)).status).toBe(200);
    brief.notes = 'Updated operating mandate'; await saveAndSubmit();
    expect((await managed('schedule_draft', { id: post.body.id, revision: 1 }, publisher)).status).toBe(409);
    await managed('approve_strategy', { version: strategyVersion, briefRevision }, company);
    await managed('start_service', { team: 'Wood team' });
    expect((await managed('schedule_draft', { id: post.body.id, revision: 1 }, publisher)).status).toBe(403);
    expect((await managed('approve_draft', { id: post.body.id, revision: 1 }, company)).status).toBe(200);
    expect((await managed('schedule_draft', { id: post.body.id, revision: 1 }, publisher)).status).toBe(200);
    await managed('cancel_draft', { id: post.body.id });
  });
  test('a completed performance review advances the next review date', async () => {
    const result = await managed('record_review', { periodStart: '2026-09-01T00:00:00Z', periodEnd: '2026-09-07T00:00:00Z', findings: 'Synthetic review; no live commercial measurements.', nextActions: ['Validate the first real platform post'], metrics: {} }, publisher);
    expect(result.status).toBe(200);
    const current = (await managed('get_operating_brief')).body;
    expect(Date.parse(current.service.nextReviewAt)).toBeGreaterThan(Date.now());
    expect((await api('/api/businesses')).body.find((value: any) => value.id === business).nextReviewAt).toBe(current.service.nextReviewAt);
  });
  test('revoking company access during OAuth prevents the connection from being saved', async () => {
    const start = await managed('connect_fanvue', {}, company);
    expect(start.status).toBe(200);
    const authorize = new URL(start.body.url);
    const cookie = start.headers.get('Set-Cookie')!.split(';')[0];
    await managed('revoke_token', { id: companyGrantId });
    const response = await mf.dispatchFetch(`https://hub.test/oauth/fanvue/callback?state=${authorize.searchParams.get('state')}&code=company-code`, { headers: { Cookie: cookie }, redirect: 'manual' });
    expect(response.status).toBe(401);
    expect((await managed('get_business')).body.connections.fanvue).toBeNull();
    expect((await managed('save_onboarding', { revision: briefRevision, brief }, company)).status).toBe(401);
  });
});

describe.sequential('Fanvue engagement with distinct consent and grants', () => {
  const business = 'engage-team';
  const channelId = `fanvue:${creator}`;
  const address = { channelId, userId: fan };
  let writer = ''; let observer = ''; let second = ''; let writerId = '';
  const engage = (operation: string, input: unknown = {}, token = admin) => op(operation, input, token, business);
  async function connect(scopes?: string) {
    fanvueScopes = scopes;
    const start = await engage('connect_fanvue', { engagement: true });
    expect(start.status).toBe(200);
    const url = new URL(start.body.url);
    expect(url.searchParams.get('scope')).toContain('read:chat write:chat');
    const result = await mf.dispatchFetch(`https://hub.test/oauth/fanvue/callback?state=${url.searchParams.get('state')}&code=engagement`, { headers: { Cookie: start.headers.get('Set-Cookie')!.split(';')[0] }, redirect: 'manual' });
    expect(result.status).toBe(303);
  }
  async function policy(enabled = true, dailyReplyLimit = 20) {
    const old = (await engage('get_engagement_policy')).body;
    const result = await engage('save_engagement_policy', { revision: old.revision, policy: { enabled, channelIds: [channelId], dailyReplyLimit, instructions: 'Answer only from the approved company brief. Escalate account and payment questions.', replyMode: 'approval' } });
    expect(result.status).toBe(200);
  }
  async function makeReply(requestId: string) {
    const context = await engage('get_conversation', address, writer);
    expect(context.status).toBe(200);
    const conversationRevision = context.body.conversation.revision;
    expect((await engage('claim_conversation', { ...address, conversationRevision }, writer)).status).toBe(200);
    const input = { ...address, requestId, conversationRevision, text: 'The next update will be shared on the channel.' };
    const reply = await engage('create_reply', input, writer);
    expect(reply.status).toBe(200);
    return { reply: reply.body, input, ref: { ...address, id: reply.body.id, revision: reply.body.revision } };
  }
  test('old publishing access cannot read chats; opt-in consent records scopes and old tokens retain their permissions', async () => {
    expect((await api('/api/businesses', { id: business, name: 'Synthetic engagement test', timezone: 'America/New_York', managedService: false })).status).toBe(201);
    const basic = await engage('connect_fanvue');
    expect(new URL(basic.body.url).searchParams.get('scope')).not.toContain('read:chat');
    await connect();
    expect((await engage('list_conversations', { channelId })).status).toBe(403);
    await connect('read:self read:post write:post read:media write:media read:chat write:chat');
    await policy();
    const issued = await engage('issue_token', { name: 'Engagement team', role: 'publisher', grants: [{ channelId, actions: ['inbox:read', 'reply:draft', 'reply:send'] }] });
    writer = issued.body.token; writerId = issued.body.id;
    observer = (await engage('issue_token', { name: 'Conversation reader', role: 'reader', grants: [{ channelId, actions: ['inbox:read'] }] })).body.token;
    second = (await engage('issue_token', { name: 'Second team', role: 'publisher', grants: [{ channelId, actions: ['inbox:read', 'reply:draft', 'reply:send'] }] })).body.token;
    const ordinary = (await engage('issue_token', { name: 'Publishing only', role: 'publisher' })).body.token;
    const before = providerRequestCount;
    expect((await engage('list_conversations', { channelId }, ordinary)).status).toBe(403);
    expect(providerRequestCount).toBe(before);
    expect((await op('list_conversations', { channelId }, writer, 'beta')).status).toBe(403);
    expect((await engage('list_conversations', { channelId: `fanvue:${fan}` }, writer)).status).toBe(403);
    expect((await engage('issue_token', { name: 'Invalid role grant', role: 'reader', grants: [{ channelId, actions: ['inbox:read', 'reply:send'] }] })).status).toBe(400);
    expect((await engage('save_engagement_policy', { revision: 2, policy: {} }, writer)).status).not.toBe(200);
  });
  test('history pagination leaves read state unchanged and MCP discovers only explicitly granted actions', async () => {
    const list = await engage('list_conversations', { channelId }, observer);
    expect(list.body.items[0]).toMatchObject({ userId: fan, unread: true });
    expect(list.body.nextCursor).toBe('page-next');
    expect((await engage('list_conversations', { channelId, cursor: list.body.nextCursor }, observer)).body.nextCursor).toBeNull();
    const history = await engage('get_conversation', address, observer);
    expect(history.body.messages).toHaveLength(1);
    const older = await engage('get_conversation', { ...address, ...history.body.next }, observer);
    expect(older.body).toMatchObject({ historical: true, messages: [], next: null });
    expect(older.body.conversation.revision).toBe(history.body.conversation.revision);
    for (const [token, canSend] of [[writer, true], [observer, false]] as const) {
      const client = new Client({ name: 'engagement-test', version: '1.0.0' });
      await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp/${business}`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
      const names = (await client.listTools()).tools.map(tool => tool.name);
      expect(names).toContain('list_conversations');
      expect(names.includes('send_reply')).toBe(canSend);
      expect(names).not.toContain('approve_reply');
      const result = await client.callTool({ name: 'list_conversations', arguments: { channelId } });
      expect(result.isError).toBe(false);
      const coverage = (await engage('get_capabilities', {}, token)).body.features.flatMap((feature: any) => feature.tools);
      expect(new Set(coverage)).toEqual(new Set(names));
      await client.close();
    }
  });
  test('exclusive claims, review, strict text-only inputs and send idempotency prevent duplicate replies', async () => {
    const value = await makeReply('reply-reviewed-once');
    expect((await engage('claim_conversation', { ...address, conversationRevision: value.input.conversationRevision }, second)).status).toBe(409);
    expect((await engage('create_reply', value.input, writer)).body.id).toBe(value.reply.id);
    expect((await engage('create_reply', { ...value.input, text: 'Changed' }, writer)).status).toBe(409);
    expect((await engage('create_reply', { ...value.input, price: 300 }, writer)).status).toBe(400);
    expect((await engage('create_reply', { ...value.input, mediaUuids: [creator] }, writer)).status).toBe(400);
    expect((await engage('send_reply', value.ref, observer)).status).toBe(403);
    expect((await engage('send_reply', value.ref, writer)).status).toBe(409);
    expect((await engage('approve_reply', value.ref, writer)).status).toBe(403);
    expect((await engage('approve_reply', value.ref)).status).toBe(200);
    const before = chatSends;
    const results = await Promise.all([engage('send_reply', value.ref, writer), engage('send_reply', value.ref, writer)]);
    expect(results.map(item => item.body.status)).toEqual(['sent', 'sent']);
    expect(chatSends).toBe(before + 1);
    expect(results[0].body.messageId).toBeTruthy();
    expect((await engage('cancel_reply', value.ref, writer)).status).toBe(409);
  });
  test('a new audience message or edited copy invalidates prior approval', async () => {
    const value = await makeReply('reply-stale-context');
    await engage('approve_reply', value.ref);
    chatMessages.unshift({ ...chatMessages[chatMessages.length - 1], uuid: '550e8400-e29b-41d4-a716-446655440099', text: 'Actually, I have another question.' });
    const before = chatSends;
    expect((await engage('send_reply', value.ref, writer)).status).toBe(409);
    const current = await engage('get_conversation', address, writer);
    const edited = await engage('update_reply', { ...value.ref, conversationRevision: current.body.conversation.revision, text: 'Thanks for the update. Wood will review your question.' }, writer);
    expect(edited.body).toMatchObject({ revision: 2, status: 'draft' });
    expect(edited.body.approvedBy).toBeUndefined();
    expect((await engage('send_reply', { ...value.ref, revision: 2 }, writer)).status).toBe(409);
    expect(chatSends).toBe(before);
  });
  test('human takeover and policy changes invalidate pending work', async () => {
    const value = await makeReply('reply-handoff');
    await engage('approve_reply', value.ref);
    const takeover = await engage('set_conversation_state', { ...address, conversationRevision: value.input.conversationRevision, mode: 'human', status: 'open' });
    expect(takeover.status).toBe(200);
    expect((await engage('send_reply', value.ref, writer)).status).toBe(409);
    expect((await engage('claim_conversation', { ...address, conversationRevision: takeover.body.revision }, writer)).status).toBe(409);
    expect((await engage('set_conversation_state', { ...address, conversationRevision: takeover.body.revision, mode: 'agent', status: 'open' }, writer)).status).toBe(403);
    await engage('set_conversation_state', { ...address, conversationRevision: takeover.body.revision, mode: 'agent', status: 'open' });
    const revised = await makeReply('reply-policy-change');
    await engage('approve_reply', revised.ref);
    await policy();
    expect((await engage('send_reply', revised.ref, writer)).status).toBe(409);
  });
  test('ambiguous sends and missing receipts hold the conversation until manual reconciliation', async () => {
    for (const mode of ['ambiguous', 'missing-receipt']) {
      const value = await makeReply(`reply-${mode}`);
      await engage('approve_reply', value.ref);
      chatMode = mode;
      const before = chatSends;
      expect((await engage('send_reply', value.ref, writer)).body.status).toBe('uncertain');
      expect((await engage('send_reply', value.ref, writer)).status).toBe(409);
      expect((await engage('create_reply', { ...value.input, requestId: `replacement-${mode}` }, writer)).status).toBe(409);
      expect(chatSends).toBe(before + 1);
      expect((await engage('reconcile_reply', { ...address, id: value.reply.id, outcome: 'not_sent', evidence: 'Verified on the synthetic provider account.' }, writer)).status).toBe(403);
      expect((await engage('reconcile_reply', { ...address, id: value.reply.id, outcome: 'sent', evidence: 'Verified on the synthetic provider account.' })).status).toBe(400);
      expect((await engage('reconcile_reply', { ...address, id: value.reply.id, outcome: 'not_sent', evidence: 'Verified no message on the synthetic provider account.' })).body.status).toBe('failed');
    }
    chatMode = 'success';
  });
  test('rate limits do not retry automatically and business daily limits stop further delivery', async () => {
    const value = await makeReply('reply-rate-limit');
    await engage('approve_reply', value.ref);
    chatMode = 'rejected'; const before = chatSends;
    expect((await engage('send_reply', value.ref, writer)).body.status).toBe('failed');
    expect((await engage('send_reply', value.ref, writer)).status).toBe(409);
    expect(chatSends).toBe(before + 1); chatMode = 'success';
    await policy(true, 1);
    const capped = await makeReply('reply-daily-cap');
    await engage('approve_reply', capped.ref);
    expect((await engage('send_reply', capped.ref, writer)).status).toBe(409);
    expect(chatSends).toBe(before + 1);
    await policy();
  });
  test('pause, disabled policy, revocation and disconnection each close the send boundary', async () => {
    const value = await makeReply('reply-pause');
    await engage('approve_reply', value.ref);
    await engage('pause_service');
    const before = chatSends;
    expect((await engage('send_reply', value.ref, writer)).status).toBe(409);
    await policy(false);
    expect((await engage('send_reply', value.ref, writer)).status).toBe(403);
    await engage('revoke_token', { id: writerId });
    expect((await engage('get_conversation', address, writer)).status).toBe(401);
    await engage('disconnect_channel', { provider: 'fanvue' });
    expect((await engage('get_engagement_policy')).body.enabled).toBe(false);
    expect((await engage('get_conversation', address, observer)).status).toBe(409);
    expect(chatSends).toBe(before);
  });
  test('effective scope reduction prevents sending and audit does not reveal counterpart IDs or copy', async () => {
    await connect('read:self read:chat');
    expect((await engage('list_conversations', { channelId }, observer)).status).toBe(200);
    const old = (await engage('get_engagement_policy')).body;
    const { revision, ...configuration } = old;
    expect((await engage('save_engagement_policy', { revision, policy: { ...configuration, enabled: true } })).status).toBe(403);
    const audit = JSON.stringify((await engage('list_audit', {}, observer)).body);
    expect(audit).not.toContain(fan);
    expect(audit).not.toContain('The next update will be shared');
    expect((await engage('send_reply', { ...address, id: crypto.randomUUID(), revision: 1 }, second)).status).toBe(403);
  });
  test('history with the wrong counterpart fails closed without exposing its contents', async () => {
    const original = chatMessages;
    chatMessages = [{ ...chatMessages[0], sender: { uuid: creator, handle: 'creator' }, recipient: { uuid: creator, handle: 'creator' }, text: 'Private unrelated conversation' }];
    try {
      const result = await engage('get_conversation', address, observer);
      expect(result.status).toBe(500);
      expect(JSON.stringify(result.body)).not.toContain('Private unrelated conversation');
    } finally { chatMessages = original; }
  });
});
