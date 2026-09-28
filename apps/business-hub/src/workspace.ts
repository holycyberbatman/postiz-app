import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';
import type { Env } from './env';
import { businessSchema, draftSchema, strategySchema, roleSchema, requireRole, json, errorResponse, HubError } from './model';
import type { Business, Actor, Draft, Strategy, TokenRecord, Credential, Channel } from './model';
import { hash, randomToken, seal, unseal } from './crypto';
import { fanvue, fanvueToken, fanvuePublish, postiz, postizChannels, postizPublish, ProviderError } from './connectors';

const idInput = z.object({ id: z.string().min(1).max(150) }).strict();
const revisionInput = idInput.extend({ revision: z.number().int().positive() });
const iso = () => new Date().toISOString();

export class BusinessWorkspace extends DurableObject<Env> {
  private pending: Promise<unknown> = Promise.resolve();
  // Serialize mutations AND token refresh across concurrent REST/MCP/alarm requests.
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.pending.then(fn, fn);
    this.pending = result.catch(() => undefined);
    return result;
  }
  async fetch(request: Request): Promise<Response> {
    return this.exclusive(async () => {
      try {
        const path = new URL(request.url).pathname;
        if (path === '/initialize') {
          if (await this.ctx.storage.get('business')) throw new HubError(409, 'Business already exists');
          const business = businessSchema.parse(await request.json());
          await this.ctx.storage.put('business', business);
          return json(business, 201);
        }
        if (path === '/authenticate') {
          const { token } = await request.json() as { token: string };
          const record = await this.ctx.storage.get<TokenRecord>(`token:${await hash(token)}`);
          if (!record || record.revoked || record.expiresAt <= Date.now()) throw new HubError(401, 'Token is expired, revoked, or invalid');
          return json({ id: record.id, role: record.role });
        }
        if (path === '/fanvue-callback') {
          const business = await this.business();
          const credential = await request.json() as Credential;
          const old = await this.credential();
          if (old && old.user.uuid !== credential.user.uuid) throw new HubError(409, 'Disconnect the current Fanvue account before connecting another creator');
          await this.ctx.storage.put('fanvue', await seal(credential, this.env.TOKEN_ENCRYPTION_KEY, `${business.id}:fanvue`));
          await this.audit({ id: 'oauth', role: 'owner' }, 'fanvue_connected', credential.user.uuid);
          return json({ connected: true });
        }
        const actor = JSON.parse(request.headers.get('X-Hub-Actor') || '{}') as Actor;
        roleSchema.parse(actor.role);
        const { operation, input = {} } = await request.json() as { operation: string; input?: unknown };
        return json(await this.operate(actor, operation, input));
      } catch (error) { return errorResponse(error); }
    });
  }
  private async business(): Promise<Business> {
    const business = await this.ctx.storage.get<Business>('business');
    if (!business) throw new HubError(404, 'Business not found');
    return business;
  }
  private async audit(actor: Actor, action: string, resource: string) {
    await this.ctx.storage.put(`audit:${iso()}:${crypto.randomUUID()}`, { at: iso(), actor: actor.id, role: actor.role, action, resource });
  }
  private async credential() {
    const stored = await this.ctx.storage.get<string>('fanvue');
    return stored ? unseal<Credential>(stored, this.env.TOKEN_ENCRYPTION_KEY, `${(await this.business()).id}:fanvue`) : undefined;
  }
  private async fanvueCredential(): Promise<Credential> {
    const credential = await this.credential();
    if (!credential) throw new HubError(409, 'Connect a Fanvue creator first');
    if (credential.expires_at < Date.now() + 120000) {
      const tokens = await fanvueToken(this.env, { grant_type: 'refresh_token', refresh_token: credential.refresh_token });
      Object.assign(credential, tokens);
      // Persist rotated tokens before any subsequent API call.
      await this.ctx.storage.put('fanvue', await seal(credential, this.env.TOKEN_ENCRYPTION_KEY, `${(await this.business()).id}:fanvue`));
    }
    return credential;
  }
  private async postizKey(): Promise<string> {
    const stored = await this.ctx.storage.get<string>('postiz');
    if (!stored) throw new HubError(409, 'Connect this business’s Postiz organization first');
    return unseal<string>(stored, this.env.TOKEN_ENCRYPTION_KEY, `${(await this.business()).id}:postiz`);
  }
  private async channels(): Promise<Channel[]> {
    const channels: Channel[] = [];
    const credential = await this.credential();
    if (credential) channels.push({ id: `fanvue:${credential.user.uuid}`, name: credential.user.displayName || credential.user.handle, provider: 'fanvue' });
    if (await this.ctx.storage.get('postiz')) channels.push(...await postizChannels(this.env, await this.postizKey()));
    return channels;
  }
  private async draft(id: string): Promise<Draft> {
    const draft = await this.ctx.storage.get<Draft>(`post:${id}`);
    if (!draft) throw new HubError(404, 'Draft not found in this business');
    return draft;
  }
  private async save(draft: Draft, actor: Actor, action: string) {
    draft.updatedAt = iso();
    await this.ctx.storage.put({
      [`post:${draft.id}`]: draft,
      [`audit:${iso()}:${crypto.randomUUID()}`]: { at: iso(), actor: actor.id, role: actor.role, action, resource: draft.id },
    });
    return draft;
  }
  private async scheduleNext() {
    const pending = await this.ctx.storage.list<{ due: number }>({ prefix: 'pending:', limit: 1000 });
    if (pending.size) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, Math.min(...[...pending.values()].map(item => item.due))));
    else await this.ctx.storage.deleteAlarm();
  }
  async operate(actor: Actor, operation: string, input: unknown): Promise<unknown> {
    const business = await this.business();
    switch (operation) {
      case 'get_business': {
        const fanvueAccount = await this.credential();
        return { business, strategy: await this.ctx.storage.get('strategy') || null, connections: { fanvue: fanvueAccount?.user || null, postiz: !!await this.ctx.storage.get('postiz') }, capabilities: { fanvueOAuth: !!(this.env.FANVUE_CLIENT_ID && this.env.FANVUE_CLIENT_SECRET), postiz: !!this.env.POSTIZ_ORIGIN }, postizOrigin: this.env.POSTIZ_ORIGIN || null, role: actor.role };
      }
      case 'update_business': {
        requireRole(actor, 'owner');
        const updated = businessSchema.omit({ id: true }).partial().parse(input);
        await this.ctx.storage.put('business', { ...business, ...updated });
        await this.audit(actor, 'business_updated', business.id);
        return { ...business, ...updated };
      }
      case 'save_strategy': {
        requireRole(actor, 'editor');
        const value = strategySchema.parse(input);
        const previous = await this.ctx.storage.get<Strategy>('strategy');
        const strategy: Strategy = { ...value, status: 'draft', version: (previous?.version || 0) + 1, updatedAt: iso() };
        await this.ctx.storage.put({ strategy, [`strategy:${strategy.version}`]: strategy });
        await this.audit(actor, 'strategy_saved', String(strategy.version));
        return strategy;
      }
      case 'activate_strategy': {
        requireRole(actor, 'owner');
        const { version } = z.object({ version: z.number().int().positive() }).strict().parse(input);
        const strategy = await this.ctx.storage.get<Strategy>('strategy');
        if (!strategy || strategy.version !== version) throw new HubError(409, 'The strategy changed; review the latest version');
        const channels = await this.channels();
        if (strategy.cadence.some(item => !channels.some(c => c.id === item.channelId && !c.disabled))) throw new HubError(400, 'Every strategy channel must be connected and enabled');
        strategy.status = 'active';
        await this.ctx.storage.put({ strategy, [`strategy:${strategy.version}`]: strategy });
        await this.audit(actor, 'strategy_activated', String(version));
        return strategy;
      }
      case 'list_channels': return this.channels();
      case 'connect_postiz': {
        requireRole(actor, 'owner');
        const { apiKey } = z.object({ apiKey: z.string().min(10).max(2000) }).strict().parse(input);
        const channels = await postizChannels(this.env, apiKey);
        // The configured origin is instance-wide; agents cannot redirect credentials to arbitrary hosts.
        await this.ctx.storage.put('postiz', await seal(apiKey, this.env.TOKEN_ENCRYPTION_KEY, `${business.id}:postiz`));
        await this.audit(actor, 'postiz_connected', business.id);
        return { channels };
      }
      case 'disconnect_channel': {
        requireRole(actor, 'owner');
        const { provider } = z.object({ provider: z.enum(['postiz', 'fanvue']) }).strict().parse(input);
        if (provider === 'fanvue') {
          const credential = await this.credential();
          if (credential) {
            const response = await fetch('https://auth.fanvue.com/oauth2/revoke', {
              method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(20000),
              headers: { Authorization: `Basic ${btoa(`${this.env.FANVUE_CLIENT_ID}:${this.env.FANVUE_CLIENT_SECRET}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({ token: credential.refresh_token, token_type_hint: 'refresh_token' }),
            });
            if (!response.ok) throw new HubError(502, 'Token revocation failed. Retry disconnect or revoke access in Fanvue.');
          }
        }
        await this.ctx.storage.delete(provider);
        await this.audit(actor, `${provider}_disconnected`, business.id);
        return { disconnected: true };
      }
      case 'create_draft': {
        requireRole(actor, 'editor');
        const value = draftSchema.parse(input);
        const requestKey = `request:${await hash(value.requestId)}`;
        const fingerprint = await hash(JSON.stringify(value));
        const existing = await this.ctx.storage.get<{ id: string; fingerprint: string }>(requestKey);
        if (existing) {
          if (existing.fingerprint !== fingerprint) throw new HubError(409, 'This requestId was already used for different content');
          return this.draft(existing.id);
        }
        const strategy = await this.ctx.storage.get<Strategy>('strategy');
        if (!strategy) throw new HubError(409, 'Save a content strategy before creating drafts');
        if (!strategy.pillars.some(p => p.name === value.pillar)) throw new HubError(400, 'Choose a pillar from the current strategy');
        if (!strategy.cadence.some(c => c.channelId === value.channelId)) throw new HubError(400, 'Choose a channel from the current strategy');
        if (value.channelId.startsWith('fanvue:') && (!value.fanvue || value.media.length || value.content.length > 5000 || (value.fanvue.price && !value.fanvue.mediaUuids.length))) throw new HubError(400, 'Fanvue requires audience settings, vault media UUIDs, and at most 5,000 characters; paid posts need media');
        if (!value.channelId.startsWith('fanvue:') && value.fanvue) throw new HubError(400, 'Fanvue settings can only be used with a Fanvue channel');
        const draft: Draft = { ...value, id: `${Date.now().toString(36)}-${randomToken().slice(0, 12)}`, revision: 1, strategyVersion: strategy.version, status: 'draft', attempts: 0, createdAt: iso(), updatedAt: iso(), createdBy: actor.id };
        await this.ctx.storage.put({ [`post:${draft.id}`]: draft, [requestKey]: { id: draft.id, fingerprint } });
        await this.audit(actor, 'draft_created', draft.id);
        return draft;
      }
      case 'list_drafts': {
        const { before, limit } = z.object({ before: z.string().max(150).optional(), limit: z.number().int().min(1).max(100).default(50) }).strict().parse(input);
        const rows = await this.ctx.storage.list<Draft>({ prefix: 'post:', reverse: true, limit, ...(before ? { end: `post:${before}` } : {}) });
        const items = [...rows.values()];
        return { items, nextCursor: items.length === limit ? items.at(-1)!.id : null };
      }
      case 'update_draft': {
        requireRole(actor, 'editor');
        const { id, revision, draft: value } = z.object({ id: z.string(), revision: z.number().int().positive(), draft: draftSchema }).strict().parse(input);
        const previous = await this.draft(id);
        if (!['draft', 'approved'].includes(previous.status) || previous.revision !== revision) throw new HubError(409, 'Only the current unscheduled draft can be edited');
        if (value.requestId !== previous.requestId) throw new HubError(400, 'Preserve the original draft requestId');
        const strategy = await this.ctx.storage.get<Strategy>('strategy');
        if (!strategy || !strategy.pillars.some(p => p.name === value.pillar) || !strategy.cadence.some(c => c.channelId === value.channelId)) throw new HubError(400, 'Choose a pillar and channel from the current strategy');
        if (value.channelId.startsWith('fanvue:') && (!value.fanvue || value.media.length || value.content.length > 5000 || (value.fanvue.price && !value.fanvue.mediaUuids.length))) throw new HubError(400, 'Invalid Fanvue content or media settings');
        if (!value.channelId.startsWith('fanvue:') && value.fanvue) throw new HubError(400, 'Fanvue settings need a Fanvue channel');
        const updated: Draft = { ...previous, ...value, revision: previous.revision + 1, strategyVersion: strategy.version, status: 'draft' };
        delete updated.approvedBy;
        return this.save(updated, actor, 'draft_updated');
      }
      case 'record_review': {
        requireRole(actor, 'editor');
        const review = z.object({ periodStart: z.string().datetime({ offset: true }), periodEnd: z.string().datetime({ offset: true }), findings: z.string().min(1).max(10000), nextActions: z.array(z.string().max(1000)).max(30), metrics: z.record(z.number()).default({}) }).strict().parse(input);
        if (Date.parse(review.periodEnd) < Date.parse(review.periodStart)) throw new HubError(400, 'Review end must follow its start');
        const value = { ...review, id: crypto.randomUUID(), createdAt: iso(), createdBy: actor.id };
        await this.ctx.storage.put(`review:${value.createdAt}:${value.id}`, value);
        await this.audit(actor, 'strategy_review_recorded', value.id);
        return value;
      }
      case 'list_reviews': return [...(await this.ctx.storage.list({ prefix: 'review:', reverse: true, limit: 50 })).values()];
      case 'get_draft': return this.draft(idInput.parse(input).id);
      case 'approve_draft': {
        requireRole(actor, 'owner');
        const { id, revision } = revisionInput.parse(input);
        const draft = await this.draft(id);
        if (draft.revision !== revision || draft.status !== 'draft') throw new HubError(409, 'Review the current draft before approving');
        const strategy = await this.ctx.storage.get<Strategy>('strategy');
        if (strategy?.version !== draft.strategyVersion || strategy.status !== 'active') throw new HubError(409, 'Activate the matching strategy before approving this draft');
        draft.status = 'approved'; draft.approvedBy = actor.id;
        return this.save(draft, actor, 'draft_approved');
      }
      case 'schedule_draft': {
        requireRole(actor, 'publisher');
        const { id, revision } = revisionInput.parse(input);
        const draft = await this.draft(id);
        if (draft.revision !== revision) throw new HubError(409, 'Draft revision changed');
        if (draft.status === 'scheduled' || draft.status === 'submitted' || draft.status === 'published') return draft;
        if (!['draft', 'approved'].includes(draft.status)) throw new HubError(409, 'Only drafts or approved posts can be scheduled');
        if (business.publishingMode === 'approval' && !draft.approvedBy) throw new HubError(403, 'The business owner must approve this draft before scheduling');
        const strategy = await this.ctx.storage.get<Strategy>('strategy');
        if (!strategy || strategy.version !== draft.strategyVersion || strategy.status !== 'active') throw new HubError(409, 'An active, matching strategy is required');
        if (!strategy.cadence.some(c => c.channelId === draft.channelId)) throw new HubError(403, 'This channel is outside the approved strategy');
        const date = Date.parse(draft.scheduledAt);
        if (date < Date.now()) throw new HubError(400, 'Create a draft with a future publication time');
        const channels = await this.channels();
        if (!channels.some(c => c.id === draft.channelId && !c.disabled)) throw new HubError(400, 'The channel is disconnected or disabled');
        const pending = await this.ctx.storage.list({ prefix: 'pending:', limit: 1000 });
        if (pending.size >= 1000) throw new HubError(409, 'This business has reached its 1,000 scheduled post limit');
        const day = new Intl.DateTimeFormat('en-CA', { timeZone: business.timezone }).format(new Date(date));
        const dayKey = `daily:${day}`;
        const dayCount = await this.ctx.storage.get<number>(dayKey) || 0;
        if (dayCount >= business.dailyPostLimit) throw new HubError(409, 'This business’s daily publication limit has been reached');
        draft.status = 'scheduled';
        await this.ctx.storage.transaction(async txn => {
          await txn.put({ [`pending:${id}`]: { due: date }, [`post:${id}`]: draft, [dayKey]: dayCount + 1 });
          const alarm = await txn.getAlarm();
          if (!alarm || date < alarm) await txn.setAlarm(date);
        });
        await this.audit(actor, 'draft_scheduled', id);
        return draft;
      }
      case 'cancel_draft': {
        requireRole(actor, 'editor');
        const draft = await this.draft(idInput.parse(input).id);
        if (['publishing', 'published', 'submitted', 'uncertain'].includes(draft.status)) throw new HubError(409, 'This post may already be on the platform; inspect it there before taking action');
        draft.status = 'cancelled';
        await this.ctx.storage.delete(`pending:${draft.id}`);
        await this.save(draft, actor, 'draft_cancelled');
        await this.scheduleNext();
        return draft;
      }
      case 'resolve_uncertain': {
        requireRole(actor, 'owner');
        const { id, outcome, providerId } = idInput.extend({ outcome: z.enum(['published', 'not_published']), providerId: z.string().min(1).max(500).optional() }).parse(input);
        const draft = await this.draft(id);
        if (!['uncertain', 'publishing'].includes(draft.status)) throw new HubError(409, 'Only uncertain publications can be reconciled');
        if (outcome === 'published' && !providerId) throw new HubError(400, 'Supply the verified provider post ID');
        draft.status = outcome === 'published' ? 'published' : 'failed';
        draft.providerResult = { reconciled: true, providerId, outcome };
        delete draft.error;
        await this.ctx.storage.delete(`pending:${id}`);
        return this.save(draft, actor, 'publication_reconciled');
      }
      case 'issue_token': {
        requireRole(actor, 'owner');
        const { name, role, days } = z.object({ name: z.string().min(1).max(120), role: roleSchema.exclude(['owner']), days: z.number().int().min(1).max(365).default(90) }).strict().parse(input);
        const token = `bh.${business.id}.${randomToken()}`;
        const id = await hash(token);
        const record: TokenRecord = { id, name, role, createdAt: iso(), expiresAt: Date.now() + days * 86400000 };
        await this.ctx.storage.put(`token:${id}`, record);
        await this.audit(actor, 'token_issued', id);
        return { token, ...record };
      }
      case 'list_tokens': {
        requireRole(actor, 'owner');
        return [...(await this.ctx.storage.list<TokenRecord>({ prefix: 'token:', limit: 1000 })).values()];
      }
      case 'revoke_token': {
        requireRole(actor, 'owner');
        const { id } = idInput.parse(input);
        const record = await this.ctx.storage.get<TokenRecord>(`token:${id}`);
        if (!record) throw new HubError(404, 'Token not found');
        await this.ctx.storage.put(`token:${id}`, { ...record, revoked: true });
        await this.audit(actor, 'token_revoked', id);
        return { revoked: true };
      }
      case 'list_audit': {
        const { before } = z.object({ before: z.string().max(150).optional() }).strict().parse(input);
        const rows = await this.ctx.storage.list({ prefix: 'audit:', reverse: true, limit: 100, ...(before ? { end: before } : {}) });
        return { items: [...rows].map(([id, value]) => ({ id, ...value as object })), nextCursor: rows.size === 100 ? [...rows.keys()].at(-1) : null };
      }
      case 'fanvue_upload_start': {
        requireRole(actor, 'editor');
        const value = z.object({ name: z.string().min(1).max(255), filename: z.string().min(1).max(255), mediaType: z.enum(['image', 'video']), sizeBytes: z.number().int().positive().max(1610612736) }).strict().parse(input);
        const credential = await this.fanvueCredential();
        const result = await fanvue(this.env, credential.access_token, '/media/uploads', { method: 'POST', body: JSON.stringify(value) });
        await this.ctx.storage.put(`upload:${result.uploadId}`, { mediaUuid: result.mediaUuid, totalParts: result.totalParts, createdAt: Date.now() });
        return result;
      }
      case 'fanvue_upload_part': {
        requireRole(actor, 'editor');
        const { uploadId, partNumber } = z.object({ uploadId: z.string().min(1).max(300), partNumber: z.number().int().min(1).max(10000) }).strict().parse(input);
        const upload = await this.ctx.storage.get<{ totalParts: number }>(`upload:${uploadId}`);
        if (!upload || partNumber > upload.totalParts) throw new HubError(404, 'Upload or part not found in this business');
        const result = await fanvue(this.env, (await this.fanvueCredential()).access_token, `/media/uploads/${encodeURIComponent(uploadId)}/parts/urls?from=${partNumber}&to=${partNumber}`);
        const url = result.parts?.find((part: { partNumber: number }) => part.partNumber === partNumber)?.url;
        if (typeof url !== 'string' || !url.startsWith('https://')) throw new ProviderError(502);
        return { url, partNumber, partSize: result.partSize };
      }
      case 'fanvue_upload_complete': {
        requireRole(actor, 'editor');
        const { uploadId, parts } = z.object({ uploadId: z.string().min(1).max(300), parts: z.array(z.object({ ETag: z.string().min(1).max(200), PartNumber: z.number().int().positive() }).strict()).min(1).max(10000) }).strict().parse(input);
        const upload = await this.ctx.storage.get<{ totalParts: number }>(`upload:${uploadId}`);
        if (!upload) throw new HubError(404, 'Upload not found in this business');
        if (parts.length !== upload.totalParts || new Set(parts.map(p => p.PartNumber)).size !== upload.totalParts || parts.some(p => p.PartNumber > upload.totalParts)) throw new HubError(400, 'Supply each uploaded part exactly once');
        return fanvue(this.env, (await this.fanvueCredential()).access_token, `/media/uploads/${encodeURIComponent(uploadId)}`, { method: 'PATCH', body: JSON.stringify({ parts }) });
      }
      case 'fanvue_media_status': {
        const { id } = z.object({ id: z.string().uuid() }).strict().parse(input);
        return fanvue(this.env, (await this.fanvueCredential()).access_token, `/media/${id}`);
      }
      case 'fanvue_posts': {
        const { cursor } = z.object({ cursor: z.string().max(2000).optional() }).strict().parse(input);
        return fanvue(this.env, (await this.fanvueCredential()).access_token, `/posts${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
      }
      case 'postiz_posts': {
        const { startDate, endDate } = z.object({ startDate: z.string().datetime({ offset: true }), endDate: z.string().datetime({ offset: true }) }).strict().parse(input);
        if (Date.parse(endDate) < Date.parse(startDate) || Date.parse(endDate) - Date.parse(startDate) > 93 * 86400000) throw new HubError(400, 'Use a date range of at most 93 days');
        return postiz(this.env, await this.postizKey(), `/posts?${new URLSearchParams({ startDate, endDate })}`);
      }
      case 'channel_analytics': {
        const { id } = idInput.parse(input);
        if (id.startsWith('fanvue:')) {
          const credential = await this.fanvueCredential();
          if (id !== `fanvue:${credential.user.uuid}`) throw new HubError(404, 'Channel not found');
          const profile = await fanvue(this.env, credential.access_token, '/users/me');
          return { followers: profile.fanCounts?.followersCount, subscribers: profile.fanCounts?.subscribersCount, likes: profile.likesCount, content: profile.contentCounts };
        }
        const channels = await this.channels();
        if (!channels.some(c => c.id === id)) throw new HubError(404, 'Channel not found');
        return postiz(this.env, await this.postizKey(), `/analytics/${encodeURIComponent(id.slice(7))}?date=30`);
      }
      default: throw new HubError(404, 'Unknown operation');
    }
  }
  async alarm() {
    return this.exclusive(async () => {
      const queued = await this.ctx.storage.list<{ due: number }>({ prefix: 'pending:', limit: 1000 });
      // A recovery alarm is persisted before touching any external publishing endpoint.
      if (queued.size) await this.ctx.storage.setAlarm(Date.now() + 60000);
      const due = [...queued].filter(([, value]) => value.due <= Date.now()).slice(0, 10);
      for (const [key] of due) {
        const draft = await this.draft(key.slice(8));
        const system: Actor = { id: 'scheduler', role: 'publisher' };
        if (draft.status === 'publishing') {
          draft.status = 'uncertain'; draft.error = 'The worker restarted during publication. Verify the platform before retrying.';
          await this.save(draft, system, 'publication_uncertain'); await this.ctx.storage.delete(key); continue;
        }
        if (draft.status !== 'scheduled') { await this.ctx.storage.delete(key); continue; }
        draft.attempts += 1;
        let publicationStarted = false;
        try {
          const business = await this.business();
          const strategy = await this.ctx.storage.get<Strategy>('strategy');
          if (!strategy || strategy.status !== 'active' || strategy.version !== draft.strategyVersion || !strategy.cadence.some(c => c.channelId === draft.channelId)) throw new HubError(409, 'Strategy changed; create and approve a new draft');
          if (business.publishingMode === 'approval' && !draft.approvedBy) throw new HubError(403, 'Owner approval is required');
          const channel = (await this.channels()).find(c => c.id === draft.channelId && !c.disabled);
          if (!channel) throw new HubError(409, 'Channel is disconnected or disabled');
          const credential = channel.provider === 'fanvue' ? await this.fanvueCredential() : undefined;
          const apiKey = credential ? undefined : await this.postizKey();
          draft.status = 'publishing';
          await this.save(draft, system, 'publication_started');
          publicationStarted = true;
          const result = credential ? await fanvuePublish(this.env, credential, draft) : await postizPublish(this.env, apiKey!, draft, channel);
          draft.status = result.status as 'published' | 'submitted';
          draft.providerResult = result; delete draft.error; delete draft.retryAt;
          await this.save(draft, system, 'publication_submitted');
          await this.ctx.storage.delete(key);
        } catch (error) {
          if (error instanceof ProviderError && error.status === 429 && draft.attempts < 5) {
            draft.attempts = Math.max(1, draft.attempts);
            draft.status = 'scheduled'; draft.retryAt = Date.now() + error.retryAfter * 1000;
            draft.error = 'The platform rate limit was reached; retry is scheduled.';
            await this.ctx.storage.put(key, { due: draft.retryAt });
          } else {
            draft.status = publicationStarted && (!(error instanceof HubError) && (!(error instanceof ProviderError) || error.ambiguous)) ? 'uncertain' : 'failed';
            draft.error = error instanceof HubError ? error.message : draft.status === 'uncertain' ? 'Publication outcome is unknown. Verify the platform and reconcile before submitting again.' : 'The platform rejected the request. Check credentials, media, and provider settings.';
          }
          await this.save(draft, system, `publication_${draft.status}`);
          if (draft.status !== 'scheduled') await this.ctx.storage.delete(key);
        }
      }
      await this.scheduleNext();
    });
  }
}
