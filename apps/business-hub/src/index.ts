import { z } from 'zod';
import type { Env } from './env';
import type { Actor } from './model';
import { businessSchema, slugSchema, json, errorResponse, HubError, requireRole, requireCompanyOrOwner } from './model';
import { hash, randomToken, sameSecret } from './crypto';
import { fanvue, fanvueToken } from './connectors';
import { handleMcp } from './mcp';
import type { OAuthState } from './directory';
export { BusinessWorkspace } from './workspace';
export { BusinessDirectory } from './directory';

const MAX_BODY = 100000;
function cookie(request: Request, name: string) {
  return request.headers.get('Cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1) || '';
}
async function authenticate(request: Request, env: Env): Promise<{ actor: Actor; businessId?: string }> {
  if (!env.HUB_ADMIN_TOKEN || env.HUB_ADMIN_TOKEN.length < 32) throw new HubError(503, 'The hub owner must configure an admin token before use');
  const header = request.headers.get('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : cookie(request, 'hub_session');
  if (!token || token.length > 4096) throw new HubError(401, 'Sign in with your hub access token');
  if (await sameSecret(token, env.HUB_ADMIN_TOKEN)) return { actor: { id: 'admin', role: 'owner' } };
  const match = /^bh\.([a-z0-9][a-z0-9-]{2,59})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) throw new HubError(401, 'Invalid access token');
  const response = await env.BUSINESSES.getByName(match[1]).fetch('https://internal/authenticate', { method: 'POST', body: JSON.stringify({ token }) });
  if (!response.ok) throw new HubError(401, 'Token is invalid, expired, or revoked');
  return { actor: await response.json() as Actor, businessId: match[1] };
}
async function workspace(env: Env, businessId: string, actor: Actor, operation: string, input: unknown = {}) {
  const result = await env.BUSINESSES.getByName(businessId).fetch('https://internal/operations', {
    method: 'POST', headers: { 'X-Hub-Actor': JSON.stringify(actor), 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation, input }),
  });
  if (result.ok && ['update_business', 'save_onboarding', 'submit_onboarding', 'save_strategy', 'start_service', 'pause_service', 'record_review', 'connect_postiz', 'disconnect_channel'].includes(operation)) {
    const summary = await env.BUSINESSES.getByName(businessId).fetch('https://internal/operations', { method: 'POST', headers: { 'X-Hub-Actor': JSON.stringify({ id: 'admin', role: 'owner' }) }, body: JSON.stringify({ operation: 'get_summary' }) });
    if (summary.ok) await env.DIRECTORY.getByName('directory').fetch('https://internal/rename', { method: 'POST', body: await summary.text() });
  }
  return result;
}
function origin(env: Env, request: Request) {
  const value = env.PUBLIC_ORIGIN || new URL(request.url).origin;
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') throw new HubError(503, 'PUBLIC_ORIGIN must use HTTPS');
  return url.origin;
}
function sessionCookie(request: Request, name: string, value: string, seconds: number, sameSite = 'Strict') {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${seconds}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  // Validate Origin for browser clients, including MCP DNS-rebinding defenses.
  const source = request.headers.get('Origin');
  if (source && source !== url.origin) throw new HubError(403, 'Cross-origin requests are not allowed');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY) throw new HubError(413, 'Request is too large');
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (reader) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_BODY) { await reader.cancel(); throw new HubError(413, 'Request is too large'); }
      chunks.push(chunk.value);
    }
    const buffer = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    const body = new TextDecoder().decode(buffer);
    request = new Request(request.url, { method: request.method, headers: request.headers, body: body || undefined });
  }
  if (pathname === '/health') return json({ service: 'postiz-business-hub', status: env.HUB_ADMIN_TOKEN?.length >= 32 && env.TOKEN_ENCRYPTION_KEY ? 'ready' : 'setup_required', version: '0.2.0' });
  if (pathname === '/api/session' && request.method === 'POST') {
    const { token } = z.object({ token: z.string().min(1).max(4096) }).strict().parse(await request.json());
    const auth = await authenticate(new Request(request.url, { headers: { Authorization: `Bearer ${token}` } }), env);
    const response = json({ role: auth.actor.role, businessId: auth.businessId });
    response.headers.set('Set-Cookie', sessionCookie(request, 'hub_session', token, 8 * 3600));
    return response;
  }
  if (pathname === '/api/session' && request.method === 'DELETE') {
    const response = json({ signedOut: true });
    response.headers.set('Set-Cookie', sessionCookie(request, 'hub_session', '', 0));
    return response;
  }
  if (pathname === '/oauth/fanvue/callback') {
    const state = url.searchParams.get('state');
    const browserCookie = cookie(request, 'fanvue_state');
    if (!state || !browserCookie) throw new HubError(400, 'Missing Fanvue connection state. Start again from Connections.');
    const consumed = await env.DIRECTORY.getByName('directory').fetch('https://internal/oauth/consume', { method: 'POST', body: JSON.stringify({ state, cookieHash: await hash(browserCookie) }) });
    if (!consumed.ok) return consumed;
    const data = await consumed.json() as OAuthState;
    if (url.searchParams.has('error')) throw new HubError(400, 'Fanvue authorization was declined. Start again when ready.');
    const code = url.searchParams.get('code');
    if (!code) throw new HubError(400, 'Fanvue did not return an authorization code');
    const tokens = await fanvueToken(env, { grant_type: 'authorization_code', code, code_verifier: data.verifier, redirect_uri: data.redirectUri });
    const profile = await fanvue(env, tokens.access_token, '/users/me');
    if (!profile.isCreator || typeof profile.uuid !== 'string') throw new HubError(400, 'Connect the Fanvue creator account for this business');
    const credential = { ...tokens, user: { uuid: profile.uuid, handle: profile.handle, displayName: profile.displayName, isAiCreator: profile.isAiCreator } };
    const saved = await env.BUSINESSES.getByName(data.businessId).fetch('https://internal/fanvue-callback', { method: 'POST', headers: { 'X-Hub-Actor': JSON.stringify(data.actor || { id: 'oauth', role: 'owner' }) }, body: JSON.stringify(credential) });
    if (!saved.ok) return saved;
    return new Response(null, { status: 303, headers: { Location: `${origin(env, request)}/?business=${data.businessId}&connected=fanvue`, 'Set-Cookie': sessionCookie(request, 'fanvue_state', '', 0, 'Lax') } });
  }
  if (pathname.startsWith('/api/') || pathname.startsWith('/mcp/')) {
    const auth = await authenticate(request, env);
    if (pathname === '/api/session' && request.method === 'GET') return json({ role: auth.actor.role, businessId: auth.businessId });
    if (pathname === '/api/businesses') {
      if (request.method === 'GET') {
        if (auth.businessId) {
          const response = await workspace(env, auth.businessId, auth.actor, 'get_business');
          if (!response.ok) return response;
          const result = await response.json() as { business: { id: string; name: string } };
          return json([{ id: result.business.id, name: result.business.name }]);
        }
        return env.DIRECTORY.getByName('directory').fetch('https://internal/list');
      }
      if (request.method === 'POST') {
        requireRole(auth.actor, 'owner');
        return env.DIRECTORY.getByName('directory').fetch('https://internal/create', { method: 'POST', body: JSON.stringify(businessSchema.parse(await request.json())) });
      }
    }
    const match = /^\/(api\/businesses|mcp)\/([^/]+)(?:\/([^/]+))?$/.exec(pathname);
    if (!match) throw new HubError(404, 'Not found');
    const businessId = slugSchema.parse(match[2]);
    if (auth.businessId && auth.businessId !== businessId) throw new HubError(403, 'This token belongs to another business');
    if (match[1] === 'mcp' && auth.actor.role === 'company') throw new HubError(403, 'Company access is for the portal. Wood issues separate agent credentials.');
    if (match[1] === 'mcp' && !match[3]) return handleMcp(request, businessId, auth.actor, (operation, input) => workspace(env, businessId, auth.actor, operation, input));
    const operation = match[3] || 'get_business';
    if (operation === 'connect_fanvue' && request.method === 'POST') {
      requireCompanyOrOwner(auth.actor);
      if (!env.FANVUE_CLIENT_ID || !env.FANVUE_CLIENT_SECRET) throw new HubError(503, 'Configure FANVUE_CLIENT_ID and FANVUE_CLIENT_SECRET before connecting');
      const exists = await workspace(env, businessId, auth.actor, 'get_business');
      if (!exists.ok) return exists;
      const state = randomToken(); const verifier = randomToken(); const browserCookie = randomToken();
      const redirectUri = `${origin(env, request)}/oauth/fanvue/callback`;
      const data: OAuthState = { businessId, actor: auth.actor, verifier, cookieHash: await hash(browserCookie), expiresAt: Date.now() + 600000, redirectUri };
      const saved = await env.DIRECTORY.getByName('directory').fetch('https://internal/oauth/create', { method: 'POST', body: JSON.stringify({ state, data }) });
      if (!saved.ok) return saved;
      const authorize = new URL('https://auth.fanvue.com/oauth2/auth');
      authorize.search = new URLSearchParams({ client_id: env.FANVUE_CLIENT_ID, redirect_uri: redirectUri, response_type: 'code', scope: 'openid offline_access offline read:self read:post write:post read:media write:media', state, code_challenge: await hash(verifier), code_challenge_method: 'S256' }).toString();
      const response = json({ url: authorize.toString() });
      response.headers.set('Set-Cookie', sessionCookie(request, 'fanvue_state', browserCookie, 600, 'Lax'));
      return response;
    }
    if (request.method === 'GET' && !match[3]) return workspace(env, businessId, auth.actor, 'get_business');
    if (request.method !== 'POST') throw new HubError(405, 'Use POST for business operations');
    const result = await workspace(env, businessId, auth.actor, operation, await request.json());
    return result;
  }
  if (!['GET', 'HEAD'].includes(request.method)) throw new HubError(405, 'Method not allowed');
  return env.ASSETS.fetch(request);
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let response: Response;
    try { response = await route(request, env); } catch (error) { response = errorResponse(error); }
    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    return new Response(response.body, { status: response.status, headers });
  },
} satisfies ExportedHandler<Env>;
