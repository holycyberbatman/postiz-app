import type { Credential, Draft, Channel } from './model';
import { HubError } from './model';
import type { Env } from './env';
import { z } from 'zod';

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
  return { access_token: result.access_token as string, refresh_token: result.refresh_token as string, expires_at: Date.now() + result.expires_in * 1000,
    ...(typeof result.scope === 'string' ? { scopes: [...new Set<string>(result.scope.split(/\s+/).filter(Boolean))] } : {}) };
}

export type InboxMessage = { id: string; text: string | null; at: string | null; senderId: string; senderName: string; recipientId: string; status: string; kind: string; attachment: boolean };
export type InboxPage = { messages: InboxMessage[]; next: { sentBefore: string | null; receivedBefore: string | null } | null };
export interface InboxConnector {
  accountId: string;
  list(cursor?: string): Promise<{ items: Array<{ userId: string; name: string; unread: boolean; lastMessageAt: string | null; preview: string | null }>; nextCursor: string | null }>;
  history(userId: string, before?: { sentBefore?: string; receivedBefore?: string }): Promise<InboxPage>;
  send(userId: string, text: string): Promise<{ messageId: string }>;
}
// Normalize only fields needed by the inbox. Do not persist provider payloads or media URLs.
export function fanvueInbox(env: Env, credentials: Credential): InboxConnector {
  const text = z.string().max(20000).nullable();
  const person = z.object({ uuid: z.string().uuid(), handle: z.string().max(500) });
  const message = z.object({ uuid: z.string().uuid(), text, sentAt: z.string().nullable(), sender: person, recipient: person, status: z.string(), type: z.string(), gif: z.unknown().optional() });
  const query = (path: string) => fanvue(env, credentials.access_token, path);
  const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
    const result = schema.safeParse(value);
    if (!result.success) throw new ProviderError(502);
    return result.data;
  };
  return {
    accountId: credentials.user.uuid,
    async list(cursor) {
      const params = new URLSearchParams({ size: '50' });
      if (cursor) params.set('cursor', cursor);
      const page = parse(z.object({ data: z.array(z.object({ user: person.extend({ displayName: z.string().max(500) }), isRead: z.boolean(), lastMessageAt: z.string().nullable(), lastMessage: z.object({ text }).nullable() })).max(50), nextCursor: z.string().nullable() }), await query(`/chats?${params}`));
      return { items: page.data.map(item => ({ userId: item.user.uuid, name: item.user.displayName || item.user.handle, unread: !item.isRead, lastMessageAt: item.lastMessageAt, preview: item.lastMessage?.text || null })), nextCursor: page.nextCursor };
    },
    async history(userId, before = {}) {
      const params = new URLSearchParams({ limit: '50', markAsRead: 'false', ...before });
      const page = parse(z.object({ data: z.array(message).max(50), dateFilter: z.object({ sentBefore: z.string().nullable(), receivedBefore: z.string().nullable() }).nullable() }), await query(`/chats/${encodeURIComponent(userId)}/messages?${params}`));
      if (page.data.some(item => !((item.sender.uuid === credentials.user.uuid && item.recipient.uuid === userId) || (item.sender.uuid === userId && item.recipient.uuid === credentials.user.uuid)))) throw new ProviderError(502);
      return { messages: page.data.map(item => ({ id: item.uuid, text: item.text, at: item.sentAt, senderId: item.sender.uuid, senderName: item.sender.handle, recipientId: item.recipient.uuid, status: item.status, kind: item.type, attachment: !!item.gif })), next: page.dateFilter };
    },
    async send(userId, text) {
      const result = await fanvue(env, credentials.access_token, `/chats/${encodeURIComponent(userId)}/message`, { method: 'POST', body: JSON.stringify({ text }) });
      if (!z.string().uuid().safeParse(result.messageUuid).success) throw new ProviderError(502, 60, true);
      return { messageId: result.messageUuid as string };
    },
  };
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
