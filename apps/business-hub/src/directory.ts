import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import { json, errorResponse, HubError, businessSchema } from './model';
import { hash, seal, unseal } from './crypto';

export type OAuthState = { businessId: string; verifier: string; cookieHash: string; expiresAt: number; redirectUri: string };
export class BusinessDirectory extends DurableObject<Env> {
  private pending: Promise<unknown> = Promise.resolve();
  async fetch(request: Request): Promise<Response> {
    const result = this.pending.then(() => this.respond(request));
    this.pending = result.catch(() => undefined);
    return result;
  }
  private async respond(request: Request): Promise<Response> {
    try {
      const path = new URL(request.url).pathname;
      if (path === '/list') return json([...await this.ctx.storage.list({ prefix: 'business:', limit: 1000 })].map(([, value]) => value));
      if (path === '/create') {
        const business = businessSchema.parse(await request.json());
        return await (async () => {
          if (await this.ctx.storage.get(`business:${business.id}`)) throw new HubError(409, 'A business with this ID already exists');
          const result = await this.env.BUSINESSES.getByName(business.id).fetch('https://internal/initialize', { method: 'POST', body: JSON.stringify(business) });
          // A lost response may leave an initialized workspace; only the admin can
          // register it, and fetching its profile avoids inventing a new identity.
          if (!result.ok && result.status !== 409) return result;
          const profile = await this.env.BUSINESSES.getByName(business.id).fetch('https://internal/operations', { method: 'POST', headers: { 'X-Hub-Actor': JSON.stringify({ id: 'admin', role: 'owner' }) }, body: JSON.stringify({ operation: 'get_business' }) });
          if (!profile.ok) return profile;
          const actual = (await profile.json() as { business: { id: string; name: string } }).business;
          await this.ctx.storage.put(`business:${business.id}`, { id: actual.id, name: actual.name });
          return json(actual, 201);
        })();
      }
      if (path === '/rename') {
        const { id, name } = businessSchema.pick({ id: true, name: true }).parse(await request.json());
        if (!await this.ctx.storage.get(`business:${id}`)) throw new HubError(404, 'Business not found');
        await this.ctx.storage.put(`business:${id}`, { id, name });
        return json({ id, name });
      }
      if (path === '/oauth/create') {
        const { state, data } = await request.json() as { state: string; data: OAuthState };
        await this.ctx.storage.put(`oauth:${await hash(state)}`, { expiresAt: data.expiresAt, sealed: await seal(data, this.env.TOKEN_ENCRYPTION_KEY, 'oauth') });
        await this.ctx.storage.setAlarm(Date.now() + 600000);
        return json({ saved: true });
      }
      if (path === '/oauth/consume') {
        const { state, cookieHash } = await request.json() as { state: string; cookieHash: string };
        const key = `oauth:${await hash(state)}`;
        return await (async () => {
          const stored = await this.ctx.storage.get<{ expiresAt: number; sealed: string }>(key);
          if (!stored || stored.expiresAt <= Date.now()) throw new HubError(400, 'Fanvue connection expired. Start again from Connections.');
          const data = await unseal<OAuthState>(stored.sealed, this.env.TOKEN_ENCRYPTION_KEY, 'oauth');
          if (data.cookieHash !== cookieHash) throw new HubError(400, 'Fanvue connection must finish in the browser where it started');
          await this.ctx.storage.delete(key);
          return json(data);
        })();
      }
      throw new HubError(404, 'Not found');
    } catch (error) { return errorResponse(error); }
  }
  async alarm() {
    const states = await this.ctx.storage.list<{ expiresAt: number }>({ prefix: 'oauth:', limit: 1000 });
    for (const [key, state] of states) if (state.expiresAt <= Date.now()) await this.ctx.storage.delete(key);
    if (states.size) await this.ctx.storage.setAlarm(Date.now() + 600000);
  }
}
