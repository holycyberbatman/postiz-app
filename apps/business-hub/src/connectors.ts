import type { Credential, Draft, Channel } from './model';
import { HubError } from './model';
import type { Env } from './env';

export class ProviderError extends Error {
  constructor(public status: number, public retryAfter = 60, public ambiguous = false) { super(`Provider returned ${status}`); }
}
export async function providerFetch(url: string, init: RequestInit = {}): Promise<any> {
  let response: Response;
  try { response = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(20000) }); }
  catch { throw new ProviderError(0, 60, true); }
  if (!response.ok) {
    const retry = response.headers.get('Retry-After');
    const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : retry ? (Date.parse(retry) - Date.now()) / 1000 : 60;
    throw new ProviderError(response.status, Math.min(86400, Math.max(5, Number.isFinite(seconds) ? seconds : 60)), response.status >= 500);
  }
  if (response.status === 204) return {};
  try { return await response.json(); } catch { throw new ProviderError(response.status, 60, true); }
}
export function fanvue(env: Env, token: string, path: string, init: RequestInit = {}) {
  return providerFetch(`https://api.fanvue.com/v1${path}`, {
    ...init,
    headers: { 'Authorization': `Bearer ${token}`, 'X-Fanvue-API-Version': env.FANVUE_API_VERSION, 'Content-Type': 'application/json', ...init.headers },
  });
}
export async function fanvueToken(env: Env, values: Record<string, string>) {
  if (!env.FANVUE_CLIENT_ID || !env.FANVUE_CLIENT_SECRET) throw new HubError(503, 'Configure Fanvue OAuth credentials before connecting');
  const result = await providerFetch('https://auth.fanvue.com/oauth2/token', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${btoa(`${env.FANVUE_CLIENT_ID}:${env.FANVUE_CLIENT_SECRET}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values).toString(),
  });
  if (typeof result.access_token !== 'string' || typeof result.refresh_token !== 'string' || !Number.isFinite(result.expires_in) || result.expires_in <= 0) throw new ProviderError(502);
  return { access_token: result.access_token as string, refresh_token: result.refresh_token as string, expires_at: Date.now() + result.expires_in * 1000 };
}
export async function fanvuePublish(env: Env, credentials: Credential, draft: Draft) {
  if (!draft.fanvue) throw new HubError(400, 'Fanvue audience and media settings are required');
  if (draft.content.length > 5000) throw new HubError(400, 'Fanvue posts have a 5,000 character limit');
  if (draft.fanvue.price && !draft.fanvue.mediaUuids.length) throw new HubError(400, 'Paid Fanvue posts require media');
  // Check processing before the publication boundary. Never create with unready media.
  for (const id of new Set([...draft.fanvue.mediaUuids, ...(draft.fanvue.mediaPreviewUuid ? [draft.fanvue.mediaPreviewUuid] : [])])) {
    const media = await fanvue(env, credentials.access_token, `/media/${encodeURIComponent(id)}`);
    if (media.status !== 'ready') throw new HubError(409, 'Fanvue media is not ready. Finish processing before scheduling.');
  }
  const result = await fanvue(env, credentials.access_token, '/posts', {
    method: 'POST', body: JSON.stringify({ text: draft.content, ...draft.fanvue }),
  });
  if (typeof result.uuid !== 'string') throw new ProviderError(502, 60, true);
  return { id: result.uuid, publishedAt: result.publishedAt, status: result.publishedAt ? 'published' : 'submitted' };
}
export function postizOrigin(env: Env) {
  if (!env.POSTIZ_ORIGIN) throw new HubError(503, 'Configure POSTIZ_ORIGIN to connect existing social channels');
  const url = new URL(env.POSTIZ_ORIGIN);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new HubError(503, 'POSTIZ_ORIGIN must be an HTTPS origin');
  return url.origin;
}
export function postiz(env: Env, apiKey: string, path: string, init: RequestInit = {}) {
  return providerFetch(`${postizOrigin(env)}/api/public/v1${path}`, {
    ...init, headers: { Authorization: apiKey, 'Content-Type': 'application/json', ...init.headers },
  });
}
export async function postizChannels(env: Env, apiKey: string): Promise<Channel[]> {
  const result = await postiz(env, apiKey, '/integrations');
  if (!Array.isArray(result)) throw new ProviderError(502);
  return result.map(item => ({ id: `postiz:${item.id}`, name: item.name, provider: item.identifier, disabled: !!item.disabled }));
}
export async function postizPublish(env: Env, apiKey: string, draft: Draft, channel: Channel) {
  const result = await postiz(env, apiKey, '/posts', {
    method: 'POST',
    body: JSON.stringify({ type: 'now', date: new Date().toISOString(), shortLink: false, tags: [], posts: [{
      integration: { id: channel.id.slice('postiz:'.length) },
      value: [{ content: draft.content, image: draft.media }],
      settings: { ...draft.settings, __type: channel.provider },
    }] }),
  });
  // Accepted by Postiz is not proof of publication; agents can query live status.
  return { status: 'submitted', result };
}
