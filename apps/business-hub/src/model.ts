import { z } from 'zod';

export const roleSchema = z.enum(['reader', 'editor', 'publisher', 'owner']);
export type Role = z.infer<typeof roleSchema>;
export type Actor = { id: string; role: Role };
export const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{2,59}$/);
export const businessSchema = z.object({
  id: slugSchema,
  name: z.string().trim().min(1).max(120),
  timezone: z.string().max(80).refine(value => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
  }, 'Use an IANA timezone such as America/New_York'),
  brandVoice: z.string().max(5000).default(''),
  audience: z.string().max(5000).default(''),
  goals: z.array(z.string().max(500)).max(20).default([]),
  publishingMode: z.enum(['approval', 'automatic']).default('approval'),
  dailyPostLimit: z.number().int().min(1).max(100).default(10),
}).strict();
export type Business = z.infer<typeof businessSchema>;
export const strategySchema = z.object({
  title: z.string().min(1).max(200),
  objective: z.string().min(1).max(5000),
  pillars: z.array(z.object({ name: z.string().min(1).max(120), guidance: z.string().max(3000) }).strict()).min(1).max(20),
  cadence: z.array(z.object({ channelId: z.string().min(1).max(150), postsPerWeek: z.number().int().min(1).max(50) }).strict()).min(1).max(40),
  guardrails: z.array(z.string().max(1000)).max(30).default([]),
  successMetrics: z.array(z.string().max(500)).max(20).default([]),
}).strict();
export type Strategy = z.infer<typeof strategySchema> & { version: number; status: 'draft' | 'active'; updatedAt: string };
export const draftSchema = z.object({
  requestId: z.string().min(8).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  title: z.string().min(1).max(200),
  content: z.string().max(20000),
  channelId: z.string().min(1).max(150),
  pillar: z.string().min(1).max(120),
  scheduledAt: z.string().datetime({ offset: true }),
  media: z.array(z.object({ id: z.string().max(100), path: z.string().url().max(2000) }).strict()).max(20).default([]),
  settings: z.record(z.unknown()).default({}),
  fanvue: z.object({
    audience: z.enum(['subscribers', 'followers-and-subscribers']),
    mediaUuids: z.array(z.string().uuid()).max(20).default([]),
    mediaPreviewUuid: z.string().uuid().optional(),
    price: z.number().int().min(300).max(50000).optional(),
  }).strict().optional(),
}).strict().refine(value => value.content.trim() || value.media.length || value.fanvue?.mediaUuids.length, 'Add text or media');
export type DraftInput = z.infer<typeof draftSchema>;
export type Draft = DraftInput & {
  id: string; strategyVersion: number; revision: number;
  status: 'draft' | 'approved' | 'scheduled' | 'publishing' | 'published' | 'submitted' | 'failed' | 'uncertain' | 'cancelled';
  createdAt: string; updatedAt: string; createdBy: string; approvedBy?: string;
  providerResult?: unknown; error?: string; attempts: number; retryAt?: number;
};
export type Channel = { id: string; name: string; provider: string; disabled?: boolean };
export type Credential = { access_token: string; refresh_token: string; expires_at: number; user: { uuid: string; handle: string; displayName: string; isAiCreator?: boolean } };
export type TokenRecord = { id: string; name: string; role: Role; createdAt: string; expiresAt: number; revoked?: boolean };
export class HubError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function requireRole(actor: Actor, minimum: Role) {
  if (['reader', 'editor', 'publisher', 'owner'].indexOf(actor.role) < ['reader', 'editor', 'publisher', 'owner'].indexOf(minimum)) {
    throw new HubError(403, `${minimum} access is required`);
  }
}
export function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}
export function errorResponse(error: unknown): Response {
  if (error instanceof SyntaxError) return json({ error: 'Send a valid JSON request body' }, 400);
  if (error instanceof z.ZodError) return json({ error: 'Invalid input', issues: error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) }, 400);
  if (error instanceof HubError) return json({ error: error.message }, error.status);
  // Provider bodies and credentials must never appear in logs or API errors.
  console.error('Business hub request failed', error instanceof Error ? error.name : 'UnknownError');
  return json({ error: 'The request could not be completed. Check connection status and try again.' }, 500);
}
