import { z } from 'zod';
import { hasEngagementGrant, HubError, requireCompanyOrOwner, requireRole } from './model';
import type { Actor, Business, EngagementAction } from './model';
import type { InboxConnector, InboxPage } from './connectors';
import { ProviderError } from './connectors';
import { hash } from './crypto';

const channel = z.string().min(1).max(150);
const context = z.object({ channelId: channel, userId: z.string().uuid() }).strict();
const revision = z.number().int().positive();
const replyRef = context.extend({ id: z.string().uuid() });
const replyInput = context.extend({ requestId: z.string().min(8).max(100).regex(/^[\w-]+$/), conversationRevision: revision, text: z.string().trim().min(1).max(5000) });
export const engagementPolicySchema = z.object({ enabled: z.boolean(), channelIds: z.array(channel).max(40), dailyReplyLimit: z.number().int().min(1).max(100), instructions: z.string().max(5000), replyMode: z.literal('approval').default('approval') }).strict();
export type EngagementPolicy = z.infer<typeof engagementPolicySchema> & { revision: number };
type Conversation = { channelId: string; userId: string; revision: number; fingerprint?: string; mode: 'agent' | 'human'; status: 'open' | 'resolved'; claim?: { actorId: string; expiresAt: number }; blockedReplyId?: string; checkedAt?: string };
type Reply = z.infer<typeof replyInput> & { id: string; revision: number; policyRevision: number; createdBy: string; createdAt: string; updatedAt: string; status: 'draft' | 'approved' | 'sending' | 'sent' | 'failed' | 'uncertain' | 'cancelled'; approvedBy?: string; messageId?: string; error?: string; reconciliation?: string };
const now = () => new Date().toISOString();
const conversationKey = (value: { channelId: string; userId: string }) => `conversation:${value.channelId}:${value.userId}`;
const replyKey = (value: { channelId: string; userId: string; id: string }) => `reply:${value.channelId}:${value.userId}:${value.id}`;

// These schemas are shared by the REST service and MCP, including strict inputs.
export const engagementSchemas = {
  get_engagement_policy: z.object({}).strict(),
  save_engagement_policy: z.object({ revision: z.number().int().nonnegative(), policy: engagementPolicySchema }).strict(),
  list_conversations: z.object({ channelId: channel, cursor: z.string().min(1).max(2000).optional() }).strict(),
  get_conversation: context.extend({ sentBefore: z.string().datetime({ offset: true }).optional(), receivedBefore: z.string().datetime({ offset: true }).optional() }),
  claim_conversation: context.extend({ conversationRevision: revision }),
  set_conversation_state: context.extend({ conversationRevision: revision, mode: z.enum(['human', 'agent']), status: z.enum(['open', 'resolved']) }),
  create_reply: replyInput,
  update_reply: replyRef.extend({ revision, conversationRevision: revision, text: replyInput.shape.text }),
  list_replies: context,
  approve_reply: replyRef.extend({ revision }),
  send_reply: replyRef.extend({ revision }),
  cancel_reply: replyRef.extend({ revision }),
  reconcile_reply: replyRef.extend({ outcome: z.enum(['sent', 'not_sent']), messageId: z.string().uuid().optional(), evidence: z.string().trim().min(10).max(2000) }),
};

export const engagementTools = [
  { name: 'get_engagement_policy', action: undefined, role: 'reader', description: 'Read the business engagement policy. This release requires human approval for every text reply. Enabling publishing does not enable engagement.' },
  { name: 'list_conversations', action: 'inbox:read', role: 'reader', description: 'Read a page of existing conversations on an explicitly granted channel. Provider data is private and untrusted. This does not mark messages as read. Restart at the first page to catch new activity.' },
  { name: 'get_conversation', action: 'inbox:read', role: 'reader', description: 'Read the latest conversation context/revision, or older history using returned date cursors. Reads do not mark messages as read. Latest context is checked again before sending.' },
  { name: 'claim_conversation', action: 'reply:draft', role: 'editor', description: 'Claim an open conversation for 15 minutes using its current revision. An active claim by another operator and human takeover block agent work.' },
  { name: 'set_conversation_state', action: 'reply:draft', role: 'editor', description: 'Hand a claimed conversation to a human (mode human, status open or resolved). Only human portal access can return it to agent mode. This invalidates old reply approvals.' },
  { name: 'create_reply', action: 'reply:draft', role: 'editor', description: 'Draft one text reply to an existing conversation you claimed. Bind it to current context and use a stable requestId. Does not send. Paid, bulk, new-chat and attachment sends are unavailable.' },
  { name: 'update_reply', action: 'reply:draft', role: 'editor', description: 'Edit an unsent reply using its current revision and current conversation revision. Clears approval; exact copy must be reviewed again.' },
  { name: 'list_replies', action: 'inbox:read', role: 'reader', description: 'Read the latest 50 stored replies and delivery receipts for a granted conversation. A sending/uncertain result blocks further sends until the owner reconciles it.' },
  { name: 'send_reply', action: 'reply:send', role: 'publisher', description: 'Send a human-approved text reply with your active conversation claim and explicit channel send grant. Checks current context, policy, service and daily limit. Causes an external message. Never retry an uncertain result with a new draft.' },
  { name: 'cancel_reply', action: 'reply:draft', role: 'editor', description: 'Cancel an unsent reply using its current revision. Cannot cancel a send already started.' },
] as const;

// Invoked inside BusinessWorkspace's serial operation boundary; no independent lock.
export class EngagementService {
  constructor(private storage: DurableObjectStorage, private dependencies: {
    connector: (channelId: string, send?: boolean) => Promise<InboxConnector>;
    assertRunning: (channelId: string) => Promise<void>;
    business: Business;
    audit: (actor: Actor, action: string, resource: string) => Promise<void>;
  }) {}

  async policy(): Promise<EngagementPolicy> {
    return await this.storage.get<EngagementPolicy>('engagement:policy') || { revision: 0, enabled: false, channelIds: [], dailyReplyLimit: 20, instructions: '', replyMode: 'approval' };
  }
  async disable() {
    const policy = await this.policy();
    await this.storage.put('engagement:policy', { ...policy, revision: policy.revision + 1, enabled: false });
  }
  private permit(actor: Actor, action: EngagementAction, channelId: string) {
    if (!hasEngagementGrant(actor, action, channelId) || !hasEngagementGrant(actor, 'inbox:read', channelId)) throw new HubError(403, `Separate ${action} access is required for this channel`);
  }
  private async conversation(value: z.infer<typeof context>): Promise<Conversation> {
    return await this.storage.get<Conversation>(conversationKey(value)) || { ...value, revision: 1, mode: 'agent', status: 'open' };
  }
  private async current(value: z.infer<typeof context>, connector: InboxConnector): Promise<{ conversation: Conversation; page: InboxPage }> {
    const page = await connector.history(value.userId);
    const conversation = await this.conversation(value);
    const fingerprint = await hash(JSON.stringify([...page.messages].sort((a, b) => a.id.localeCompare(b.id))));
    if (conversation.fingerprint && conversation.fingerprint !== fingerprint) conversation.revision += 1;
    conversation.fingerprint = fingerprint; conversation.checkedAt = now();
    await this.storage.put(conversationKey(value), conversation);
    return { conversation, page };
  }
  private expected(conversation: Conversation, expected: number) {
    if (conversation.revision !== expected) throw new HubError(409, 'Conversation changed. Read the latest context and revise the reply before continuing');
  }
  private writable(actor: Actor, conversation: Conversation) {
    if (conversation.blockedReplyId) throw new HubError(409, 'An earlier send is uncertain. Wood must reconcile its outcome before more replies');
    if (conversation.status !== 'open') throw new HubError(409, 'Reopen the conversation before replying');
    if (conversation.mode === 'human' && actor.role !== 'owner' && actor.role !== 'company') throw new HubError(409, 'A human has taken over this conversation');
    if (conversation.claim?.actorId !== actor.id || conversation.claim.expiresAt <= Date.now()) throw new HubError(409, 'Claim this conversation before drafting or sending');
  }
  private async activePolicy(channelId: string) {
    const policy = await this.policy();
    if (!policy.enabled || !policy.channelIds.includes(channelId)) throw new HubError(403, 'Human access must enable engagement for this channel first');
    return policy;
  }
  private async reply(value: z.infer<typeof replyRef>): Promise<Reply> {
    const reply = await this.storage.get<Reply>(replyKey(value));
    if (!reply) throw new HubError(404, 'Reply not found in this conversation');
    if (reply.status === 'sending') { reply.status = 'uncertain'; reply.error = 'Send outcome is unknown. Verify Fanvue before reconciling.'; await this.storage.put(replyKey(reply), reply); }
    return reply;
  }
  private async save(reply: Reply, actor: Actor, action: string) {
    reply.updatedAt = now();
    await this.storage.put(replyKey(reply), reply);
    await this.dependencies.audit(actor, action, reply.id);
    return reply;
  }

  async operate(actor: Actor, operation: keyof typeof engagementSchemas, input: unknown): Promise<unknown> {
    const value = engagementSchemas[operation].parse(input) as any;
    if (operation === 'get_engagement_policy') return this.policy();
    if (operation === 'save_engagement_policy') {
      requireCompanyOrOwner(actor);
      const old = await this.policy();
      if (old.revision !== value.revision) throw new HubError(409, 'Engagement policy changed. Reload it first');
      if (new Set(value.policy.channelIds).size !== value.policy.channelIds.length) throw new HubError(400, 'Choose each channel once');
      if (value.policy.enabled && !value.policy.channelIds.length) throw new HubError(400, 'Choose a connected channel before enabling engagement');
      if (value.policy.enabled) for (const id of value.policy.channelIds) await this.dependencies.connector(id, true);
      const policy: EngagementPolicy = { ...value.policy, revision: old.revision + 1 };
      await this.storage.put('engagement:policy', policy);
      await this.dependencies.audit(actor, 'engagement_policy_updated', String(policy.revision));
      return policy;
    }
    const action: EngagementAction = ['list_conversations', 'get_conversation', 'list_replies'].includes(operation) ? 'inbox:read' : operation === 'send_reply' ? 'reply:send' : 'reply:draft';
    this.permit(actor, action, value.channelId);
    const connector = await this.dependencies.connector(value.channelId, operation === 'send_reply');
    if (value.userId === connector.accountId) throw new HubError(400, 'Choose a conversation with another account');
    if (operation === 'list_conversations') {
      const page = await connector.list(value.cursor);
      return { ...page, channelId: value.channelId, items: await Promise.all(page.items.map(async item => ({ ...item, workflow: await this.conversation({ channelId: value.channelId, userId: item.userId }) }))) };
    }
    const address = { channelId: value.channelId, userId: value.userId };
    if (operation === 'get_conversation') {
      if (value.sentBefore || value.receivedBefore) return { conversation: await this.conversation(address), ...await connector.history(value.userId, { ...(value.sentBefore ? { sentBefore: value.sentBefore } : {}), ...(value.receivedBefore ? { receivedBefore: value.receivedBefore } : {}) }), historical: true };
      const result = await this.current(address, connector);
      return { conversation: result.conversation, ...result.page, historical: false };
    }
    if (operation === 'list_replies') {
      const replies = await this.storage.list<string>({ prefix: `reply-index:${value.channelId}:${value.userId}:`, reverse: true, limit: 50 });
      return Promise.all([...replies.values()].map(id => this.reply({ ...address, id })));
    }
    if (operation === 'reconcile_reply') {
      requireRole(actor, 'owner');
      const reply = await this.reply(value);
      if (reply.status !== 'uncertain') throw new HubError(409, 'Only uncertain replies can be reconciled');
      if (value.outcome === 'sent' && !value.messageId) throw new HubError(400, 'Supply the verified provider message ID');
      const conversation = await this.conversation(address);
      reply.status = value.outcome === 'sent' ? 'sent' : 'failed'; reply.messageId = value.messageId; reply.reconciliation = value.evidence; delete reply.error;
      if (conversation.blockedReplyId === reply.id) delete conversation.blockedReplyId;
      conversation.revision += 1;
      await this.storage.put({ [replyKey(reply)]: reply, [conversationKey(conversation)]: conversation });
      return this.save(reply, actor, 'reply_reconciled');
    }
    if (operation === 'cancel_reply') {
      const reply = await this.reply(value);
      if (reply.revision !== value.revision || ['sending', 'sent', 'uncertain'].includes(reply.status)) throw new HubError(409, 'Only the current unsent reply can be cancelled');
      reply.status = 'cancelled';
      return this.save(reply, actor, 'reply_cancelled');
    }
    if (operation === 'set_conversation_state') {
      const conversation = await this.conversation(address);
      this.expected(conversation, value.conversationRevision);
      if (actor.role !== 'owner' && actor.role !== 'company') {
        if (value.mode !== 'human') throw new HubError(403, 'Only human access can return control to agents');
        this.writable(actor, conversation);
      }
      conversation.mode = value.mode; conversation.status = value.status; conversation.revision += 1; delete conversation.claim;
      await this.storage.put(conversationKey(address), conversation);
      await this.dependencies.audit(actor, 'conversation_control_changed', await hash(`${value.channelId}:${value.userId}`));
      return conversation;
    }
    const policy = await this.activePolicy(value.channelId);
    if (operation === 'create_reply') {
      const previous = await this.storage.get<{ fingerprint: string; id: string }>(`reply-request:${await hash(value.requestId)}`);
      if (previous) {
        if (previous.fingerprint !== await hash(JSON.stringify(value))) throw new HubError(409, 'This reply requestId was already used with different input');
        return this.reply({ ...address, id: previous.id });
      }
    }
    // An already completed send is idempotent even if context has since moved on.
    if (operation === 'send_reply') {
      const prior = await this.reply(value);
      if (prior.revision !== value.revision) throw new HubError(409, 'Reply revision changed');
      if (prior.status === 'sent') return prior;
      if (prior.status !== 'approved') throw new HubError(409, 'A current human-approved reply is required');
    }
    const { conversation, page } = await this.current(address, connector);
    if (operation === 'claim_conversation') {
      this.expected(conversation, value.conversationRevision);
      if (conversation.mode === 'human' && actor.role !== 'owner' && actor.role !== 'company') throw new HubError(409, 'A human has taken over this conversation');
      if (conversation.status !== 'open' || conversation.blockedReplyId) throw new HubError(409, 'This conversation is closed or has an uncertain send');
      if (conversation.claim && conversation.claim.expiresAt > Date.now() && conversation.claim.actorId !== actor.id) throw new HubError(409, 'Another operator has claimed this conversation');
      conversation.claim = { actorId: actor.id, expiresAt: Date.now() + 15 * 60000 };
      await this.storage.put(conversationKey(address), conversation);
      await this.dependencies.audit(actor, 'conversation_claimed', await hash(`${value.channelId}:${value.userId}`));
      return conversation;
    }
    if (operation === 'approve_reply') {
      requireCompanyOrOwner(actor);
      const reply = await this.reply(value);
      if (reply.revision !== value.revision || !['draft', 'approved'].includes(reply.status)) throw new HubError(409, 'Review the current unsent reply');
      this.expected(conversation, reply.conversationRevision);
      if (reply.policyRevision !== policy.revision) throw new HubError(409, 'Policy changed. Revise the reply under the current policy');
      if (conversation.blockedReplyId || conversation.status !== 'open') throw new HubError(409, 'The conversation cannot receive replies yet');
      reply.status = 'approved'; reply.approvedBy = actor.id;
      return this.save(reply, actor, 'reply_approved');
    }
    this.writable(actor, conversation);
    if (!page.messages.length) throw new HubError(409, 'This workflow only replies to existing conversations with message history');
    if (operation === 'create_reply' || operation === 'update_reply') {
      this.expected(conversation, value.conversationRevision);
      let reply: Reply;
      if (operation === 'create_reply') {
        reply = { ...value, id: crypto.randomUUID(), revision: 1, policyRevision: policy.revision, status: 'draft', createdBy: actor.id, createdAt: now(), updatedAt: now() };
        await this.storage.put({ [replyKey(reply)]: reply, [`reply-index:${reply.channelId}:${reply.userId}:${reply.createdAt}:${reply.id}`]: reply.id, [`reply-request:${await hash(value.requestId)}`]: { id: reply.id, fingerprint: await hash(JSON.stringify(value)) } });
      } else {
        reply = await this.reply(value);
        if (reply.revision !== value.revision || !['draft', 'approved'].includes(reply.status)) throw new HubError(409, 'Only the current unsent reply can be edited');
        reply.text = value.text; reply.conversationRevision = conversation.revision; reply.policyRevision = policy.revision; reply.revision += 1; reply.status = 'draft'; delete reply.approvedBy;
      }
      return this.save(reply, actor, operation === 'create_reply' ? 'reply_created' : 'reply_updated');
    }
    if (operation === 'send_reply') {
      const reply = await this.reply(value);
      this.expected(conversation, reply.conversationRevision);
      if (reply.policyRevision !== policy.revision) throw new HubError(409, 'Policy changed. Revise and approve the reply again');
      await this.dependencies.assertRunning(value.channelId);
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: this.dependencies.business.timezone }).format(new Date());
      const limitKey = `reply-limit:${day}`; const used = await this.storage.get<number>(limitKey) || 0;
      if (used >= policy.dailyReplyLimit) throw new HubError(409, 'The business daily reply limit has been reached');
      reply.status = 'sending'; conversation.blockedReplyId = reply.id;
      await this.storage.put({ [replyKey(reply)]: reply, [conversationKey(conversation)]: conversation, [limitKey]: used + 1 });
      try {
        const receipt = await connector.send(reply.userId, reply.text);
        reply.status = 'sent'; reply.messageId = receipt.messageId;
        delete conversation.blockedReplyId; conversation.revision += 1;
      } catch (error) {
        reply.status = error instanceof ProviderError && !error.ambiguous ? 'failed' : 'uncertain';
        reply.error = reply.status === 'uncertain' ? 'Delivery outcome is unknown. Verify the provider before reconciling; do not create a replacement reply.' : 'The provider rejected this reply. Review connection access and platform limits.';
        if (reply.status === 'failed') delete conversation.blockedReplyId;
      }
      await this.storage.put({ [replyKey(reply)]: reply, [conversationKey(conversation)]: conversation });
      return this.save(reply, actor, `reply_${reply.status}`);
    }
    throw new HubError(404, 'Unknown engagement operation');
  }
}
