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
let providerMode = 'success';
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
        return MFResponse.json({ access_token: 'fanvue-access', refresh_token: 'fanvue-refresh', expires_in: values.get('grant_type') === 'authorization_code' ? 60 : 3600 });
      }
      if (url.hostname === 'api.fanvue.com') {
        expect(request.headers.get('X-Fanvue-API-Version')).toBe('2025-06-26');
        if (url.pathname === '/v1/users/me') return MFResponse.json({ uuid: creator, handle: 'test-creator', displayName: 'Test creator', isCreator: true, isAiCreator: false });
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
    expect((await api('/api/businesses', { id, name: id.toUpperCase(), timezone: 'America/New_York' })).status).toBe(201);
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
