import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const origin = new URL(process.argv[2]);
assert.equal(origin.protocol, 'https:', 'Use the deployed HTTPS origin');
assert.equal(origin.pathname, '/');
assert.equal(origin.username + origin.password + origin.search + origin.hash, '');
const token = process.env.HUB_SMOKE_TOKEN || JSON.parse(await readFile(new URL('../.secrets/production.json', import.meta.url), 'utf8')).HUB_ADMIN_TOKEN;
const request = (path, options = {}) => fetch(new URL(path, origin), { redirect: 'manual', signal: AbortSignal.timeout(15000), ...options });
const version = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
const health = await request('/health');
assert.equal(health.status, 200);
const readiness = await health.json();
assert.equal(readiness.status, 'ready');
assert.equal(readiness.version, version);
const page = await request('/');
assert.equal(page.status, 200);
assert.match(await page.text(), /Wood Enterprises/);
assert.equal(page.headers.get('X-Frame-Options'), 'DENY');
const inboxScript = await request(`/inbox.js?v=${version}-1`);
assert.equal(inboxScript.status, 200);
assert.match(await inboxScript.text(), /async function inboxView/);
assert.equal((await request('/api/businesses')).status, 401);
assert.equal((await request('/mcp/deployment-probe', { method: 'POST', body: '{}' })).status, 401);
const headers = { Authorization: `Bearer ${token}` };
const directory = await request('/api/businesses', { headers });
assert.equal(directory.status, 200);
assert.match(directory.headers.get('Cache-Control'), /no-store/);
const businesses = await directory.json();
assert.ok(Array.isArray(businesses));
assert.equal((await request('/api/businesses', { headers: { ...headers, Origin: 'https://untrusted.example' } })).status, 403);
const session = await request('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
assert.equal(session.status, 200);
// Assert booleans so a failed check cannot print the credential-bearing cookie.
const sessionCookie = session.headers.get('Set-Cookie') || '';
assert.ok(/HttpOnly; SameSite=Strict/.test(sessionCookie), 'Session cookie needs HttpOnly and SameSite=Strict');
assert.ok(/Secure/.test(sessionCookie), 'Session cookie needs Secure');
const client = new Client({ name: 'hub-deployment-smoke', version: '1.0.0' });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp/deployment-probe', origin), { requestInit: { headers } }));
  const { tools } = await client.listTools();
  assert.ok(tools.some(tool => tool.name === 'get_business'));
  assert.ok(tools.some(tool => tool.name === 'get_operating_brief'));
  assert.ok(tools.some(tool => tool.name === 'get_capabilities'));
  assert.ok(tools.some(tool => tool.name === 'get_engagement_policy'));
  assert.ok(tools.some(tool => tool.name === 'list_conversations'));
  assert.ok(tools.some(tool => tool.name === 'send_reply'));
  assert.ok(!tools.some(tool => tool.name === 'approve_reply'));
  assert.ok(!tools.some(tool => tool.name === 'issue_token'));
  console.log(JSON.stringify({ origin: origin.origin, version, health: 'ready', dashboard: 'passed', inboxAsset: 'passed', authentication: 'passed', sessionCookie: 'passed', originProtection: 'passed', mcpHandshake: 'passed', toolCount: tools.length, businessCount: businesses.length, writesToBusinesses: 0 }, null, 2));
} finally {
  await client.close();
}
