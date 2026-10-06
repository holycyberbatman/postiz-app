// Extends the existing Wood workspace; all requests stay bound to the opened business.
let inbox = null;
// Session memory only: preserve work across pane redraws and business navigation.
// Cleared on sign-out; never use shared browser storage for private reply text.
const inboxComposers = new Map();
const composerKey = (context, userId) => `${context.business}:${context.channelId}:${userId}`;
function inboxComposer(context, userId) {
  const key = composerKey(context, userId);
  if (!inboxComposers.has(key)) inboxComposers.set(key, { text: '', edit: null, requestId: crypto.randomUUID() });
  return inboxComposers.get(key);
}
const inboxHuman = () => ['owner', 'company'].includes(state.role);
const inboxCan = action => inboxHuman() || state.data?.grants?.some(grant => grant.channelId === inbox?.channelId && grant.actions.includes(action));
const inboxCurrent = context => context === inbox && context.sequence === state.sequence && context.business === state.business;
const inboxOp = (context, name, input = {}) => op(name, input, context.business);

async function inboxView(sequence) {
  const account = state.data.connections.fanvue;
  const context = { sequence, business: state.business, channelId: account ? `fanvue:${account.uuid}` : '', items: [], selected: null, conversation: null, replies: [], request: 0, edit: null };
  inbox = context;
  context.policy = await inboxOp(context, 'get_engagement_policy');
  if (!inboxCurrent(context)) return;
  const ready = account && state.data.capabilities.fanvueInbox;
  $('#workspace-view').innerHTML = `<!-- THESIS: Review one conversation in its business context before replying. OWN-WORLD: Existing flat Wood workspace, purple actions, divided rows, explicit states. STORY: Connect, read, claim, draft, review, send or hand off. FIRST VIEWPORT: Inbox heading and policy above a conversation list; selected history and reply work share one reading pane. FORM: A local extension of the workspace, using its established split layout; no new visual identity. --><div class="section-heading"><div><h2>Audience inbox</h2><p>Fanvue conversations · reviewed text replies</p></div><div class="form-actions">${inboxHuman() ? button('Reply policy', 'inbox-policy') : ''}${ready && inboxCan('inbox:read') ? button('Refresh inbox', 'inbox-refresh') : ''}</div></div><div id="inbox-policy"></div><p class="help inbox-policy-note">${context.policy.enabled ? 'Replies require human approval. ' + escape(context.policy.dailyReplyLimit) + ' send attempts per day.' : 'Replies are off. Wood or the company can enable them in Reply policy.'} Refresh to see new activity. Reading here leaves Fanvue’s unread state unchanged.</p><div id="inbox-body"></div>`;
  if (!ready) {
    $('#inbox-body').innerHTML = `<section class="empty"><h3>${account ? 'Authorize conversation access.' : 'Connect the company’s Fanvue account.'}</h3><p>${state.data.capabilities.fanvueOAuth ? 'Choose publishing and inbox access in Fanvue, then enable reviewed replies for this company. Existing publishing access does not include private conversations.' : 'Wood needs to finish the Fanvue app setup before the creator can authorize access.'}</p>${inboxHuman() && state.data.capabilities.fanvueOAuth ? button('Connect publishing + inbox', 'inbox-connect', false) : button('View channels', 'connections')}</section>`;
    return;
  }
  if (!inboxCan('inbox:read')) {
    $('#inbox-body').innerHTML = '<section class="empty"><h3>Conversation access has not been granted.</h3><p>Wood can issue a token with inbox access for this channel in Agent access. Your publishing permissions are unchanged.</p></section>';
    return;
  }
  $('#inbox-body').innerHTML = '<div class="inbox-layout"><aside class="conversation-list" aria-label="Fanvue conversations"><div id="conversation-rows"><p class="loading">Loading conversations…</p></div><div id="conversation-pages"></div></aside><section id="conversation-detail" class="conversation-detail" aria-label="Conversation"><h3>Choose a conversation.</h3><p class="help">Read the history, claim the work, then draft a reply for review.</p></section></div>';
  await inboxLoad(context);
}
async function inboxLoad(context, cursor) {
  try {
    const page = await inboxOp(context, 'list_conversations', { channelId: context.channelId, ...(cursor ? { cursor } : {}) });
    if (!inboxCurrent(context)) return;
    context.items = [...new Map([...(cursor ? context.items : []), ...page.items].map(item => [item.userId, item])).values()];
    context.nextCursor = page.nextCursor;
    $('#conversation-rows').innerHTML = context.items.length ? context.items.map(item => `<button class="conversation-row" data-action="inbox-open" data-id="${escape(item.userId)}" ${context.selected?.userId === item.userId ? 'aria-current="true"' : ''}><span class="conversation-name">${escape(item.name)} ${item.unread ? badge('Unread') : ''}</span><span class="conversation-preview">${escape(item.preview || 'No text preview')}</span><small>${item.lastMessageAt ? escape(date(item.lastMessageAt)) : 'No recent message'} · ${escape(item.workflow.mode === 'human' ? 'Human control' : item.workflow.status)}</small></button>`).join('') : '<div class="inbox-empty"><h3>No conversations yet.</h3><p class="help">Existing Fanvue chats will appear here. Starting new chats is not available in this release.</p></div>';
    $('#conversation-pages').innerHTML = page.nextCursor ? button('More conversations', 'inbox-more') : '';
    if (cursor) {
      notify(`Loaded ${page.items.length} more conversations.`);
      $('#conversation-pages button, .conversation-row')?.focus();
    }
  } catch (error) {
    if (inboxCurrent(context)) $('#conversation-rows').innerHTML = `<div class="inbox-empty"><h3>Conversations could not be loaded.</h3><p class="help">${escape(error.message)}</p>${button('Try again', 'inbox-refresh')}</div>`;
  }
}
async function inboxOpen(context, userId) {
  const request = ++context.request;
  const selected = context.items.find(item => item.userId === userId);
  if (!selected) return;
  context.selected = selected; context.edit = null;
  $('#conversation-detail').innerHTML = '<p class="loading">Loading conversation…</p>';
  const address = { channelId: context.channelId, userId };
  try {
    const [history, replies] = await Promise.all([inboxOp(context, 'get_conversation', address), inboxOp(context, 'list_replies', address)]);
    if (!inboxCurrent(context) || context.request !== request) return;
    context.conversation = history.conversation; context.messages = history.messages; context.nextHistory = history.next; context.replies = replies;
    document.querySelectorAll('.conversation-row').forEach(row => { if (row.dataset.id === userId) row.setAttribute('aria-current', 'true'); else row.removeAttribute('aria-current'); });
    inboxDetail(context);
    const heading = $('#conversation-detail h3');
    heading.tabIndex = -1; heading.focus({ preventScroll: window.innerWidth > 760 });
  } catch (error) {
    if (inboxCurrent(context) && context.request === request) {
      $('#conversation-detail').innerHTML = `<h3>Conversation could not be loaded.</h3><p class="help">${escape(error.message)}</p>${button('Try again', 'inbox-open', true, `data-id="${escape(userId)}"`)}`;
      notify(error.message, true); $('#conversation-detail button').focus();
    }
  }
}
function inboxDetail(context) {
  const conversation = context.conversation;
  const held = conversation.claim?.expiresAt > Date.now();
  const mine = held && conversation.claim.actorId === state.data.actorId;
  const draftable = inboxCan('reply:draft') && context.policy.enabled && conversation.status === 'open' && !conversation.blockedReplyId && (conversation.mode === 'agent' || inboxHuman());
  const address = { channelId: context.channelId, userId: context.selected.userId };
  const composer = inboxComposer(context, address.userId);
  context.edit = composer.edit;
  $('#conversation-detail').innerHTML = `<div class="section-heading"><div><h3>${escape(context.selected.name)}</h3><p>${escape(conversation.mode === 'human' ? 'Human control' : 'Agent control')} · ${escape(conversation.status)}</p></div>${button('Refresh history', 'inbox-history')}</div><p class="help">${mine ? 'You hold this conversation until ' + escape(date(conversation.claim.expiresAt)) + '.' : held ? 'Another operator holds this conversation. A human can take over below.' : 'No operator currently holds this conversation.'}</p>${conversation.blockedReplyId ? '<p class="error-copy">An earlier message has an unknown delivery outcome. Wood must verify it in Fanvue and reconcile it below before any further reply.</p>' : ''}<div class="form-actions">${draftable && (!held || mine) ? button(mine ? 'Renew claim' : 'Claim conversation', 'inbox-claim') : ''}${conversation.mode === 'agent' && inboxCan('reply:draft') && (inboxHuman() || mine) ? button('Hand to a human', 'inbox-handoff') : ''}${inboxHuman() ? ((conversation.mode === 'human' || conversation.status === 'resolved') ? button(conversation.status === 'resolved' ? 'Reopen for agents' : 'Return to agents', 'inbox-resume') : '') + (conversation.status === 'open' ? button('Resolve conversation', 'inbox-resolve') : '') : ''}</div><div class="message-history">${context.nextHistory && (context.nextHistory.sentBefore || context.nextHistory.receivedBefore) ? button('Earlier messages', 'inbox-earlier') : ''}${[...context.messages].reverse().map(message => `<article class="message-row"><div class="message-meta"><strong>${escape(message.senderName)}</strong><span>${message.at ? escape(date(message.at)) : 'Time unavailable'}</span></div><p>${escape(message.text || (message.attachment ? 'GIF attachment · view in Fanvue' : 'Non-text message · view in Fanvue'))}</p><small>${escape(message.status)}${message.attachment && message.text ? ' · GIF attachment in Fanvue' : ''}</small></article>`).join('') || '<p class="help">This chat has no message history. New conversations cannot be started here.</p>'}</div>${draftable && mine ? `<form id="reply-form" class="reply-composer"><h3>${context.edit ? 'Revise reply' : 'Draft a reply'}</h3>${field('Reply text', 'replyText', context.edit?.text || '', { area: true, required: true, max: 5000, help: 'Text only. A human reviews the exact reply before it can be sent.' })}<button class="button" type="submit">${context.edit ? 'Save new revision' : 'Save for review'}</button>${composer.text || composer.edit ? button('Discard unsaved text', 'inbox-discard') : ''}</form>` : '<p class="help">Enable replies and claim the conversation to draft a response.</p>'}<div class="reply-history"><h3>Replies and delivery</h3><div id="reply-reconcile"></div>${context.replies.map(reply => `<article class="reply-row"><div class="message-meta">${badge(reply.status)}<small>Revision ${reply.revision} · ${escape(date(reply.updatedAt))}</small></div><p>${escape(reply.text)}</p>${reply.error ? `<p class="error-copy">${escape(reply.error)}</p>` : ''}${reply.messageId ? `<small>Fanvue receipt: ${escape(reply.messageId)}</small>` : ''}${reply.reconciliation ? `<p class="help">Verified: ${escape(reply.reconciliation)}</p>` : ''}<div class="form-actions">${['draft', 'approved'].includes(reply.status) && draftable && mine ? button('Edit reply', 'inbox-edit', true, `data-id="${reply.id}"`) + button('Cancel reply', 'inbox-cancel', true, `data-id="${reply.id}"`) : ''}${reply.status === 'draft' && inboxHuman() ? button('Approve this revision', 'inbox-approve', false, `data-id="${reply.id}"`) : ''}${reply.status === 'approved' && inboxCan('reply:send') && mine && draftable ? button('Send reviewed reply', 'inbox-send', false, `data-id="${reply.id}"`) : ''}${reply.status === 'uncertain' && state.role === 'owner' ? button('Record verified outcome', 'inbox-reconcile', true, `data-id="${reply.id}"`) : ''}</div></article>`).join('') || '<p class="help">No replies have been drafted in this workspace.</p>'}</div>`;
  const input = $('#replyText');
  if (input) {
    input.value = composer.text;
    input.addEventListener('input', () => { composer.text = input.value; composer.requestId = crypto.randomUUID(); });
  }
  const edit = composer.edit;
  bindForm('#reply-form', async data => {
    const request = context.request;
    const requestId = composer.requestId;
    const input = { ...address, conversationRevision: conversation.revision, text: data.get('replyText') };
    await inboxOp(context, edit ? 'update_reply' : 'create_reply', edit ? { ...input, id: edit.id, revision: edit.revision } : { ...input, requestId });
    if (inboxComposers.get(composerKey(context, address.userId)) === composer && composer.text === input.text && composer.requestId === requestId) inboxComposers.delete(composerKey(context, address.userId));
    if (!inboxCurrent(context) || context.request !== request || context.selected?.userId !== address.userId) return;
    notify('Reply saved for human review. No message has been sent.');
    await inboxOpen(context, address.userId);
  });
}
function inboxPolicy(context) {
  const policy = context.policy;
  $('#inbox-policy').innerHTML = `<form id="reply-policy-form" class="form-shell"><h3>Reply policy for ${escape(state.data.business.name)}</h3><p class="help">Every reply in this release requires human approval. Changing this policy invalidates approvals made under an earlier version.</p><div class="form-grid"><div class="field"><label for="repliesEnabled">Reviewed replies</label><select id="repliesEnabled" name="enabled"><option value="false" ${!policy.enabled ? 'selected' : ''}>Off</option><option value="true" ${policy.enabled ? 'selected' : ''}>On · review every reply</option></select></div>${field('Daily send attempt limit', 'dailyReplyLimit', policy.dailyReplyLimit, { type: 'number', required: true, attrs: 'min="1" max="100"' })}${field('Response guidance and escalation', 'replyInstructions', policy.instructions, { area: true, wide: true, help: 'Describe approved knowledge, tone, and when the team should hand the conversation to a person.' })}</div><p class="help">Channel: ${escape(state.data.connections.fanvue?.displayName || 'Connect Fanvue first')}. Automatic, paid, attachment, and bulk replies are not available.</p><div class="form-actions"><button class="button" type="submit">Save reply policy</button>${button('Close', 'inbox-close-policy')}</div></form>`;
  bindForm('#reply-policy-form', async data => {
    await inboxOp(context, 'save_engagement_policy', { revision: policy.revision, policy: { enabled: data.get('enabled') === 'true', channelIds: context.channelId ? [context.channelId] : [], dailyReplyLimit: Number(data.get('dailyReplyLimit')), instructions: data.get('replyInstructions'), replyMode: 'approval' } });
    if (inboxCurrent(context)) { notify('Reply policy saved.'); await workspace(context.business, 'inbox'); }
  });
  $('#repliesEnabled').focus();
}
async function inboxAction(action, target) {
  if (!action?.startsWith('inbox-')) return false;
  const context = inbox;
  if (action === 'inbox-connect') {
    const business = state.business; const sequence = state.sequence;
    const result = await op('connect_fanvue', { engagement: true }, business);
    if (business === state.business && sequence === state.sequence) location.assign(result.url);
    return true;
  }
  if (!context || !inboxCurrent(context)) return true;
  target.disabled = true;
  try {
    if (action === 'inbox-policy') { inboxPolicy(context); return true; }
    if (action === 'inbox-close-policy') { $('#inbox-policy').replaceChildren(); return true; }
    if (action === 'inbox-refresh') { await inboxLoad(context); return true; }
    if (action === 'inbox-more') { await inboxLoad(context, context.nextCursor); return true; }
    if (action === 'inbox-open') { await inboxOpen(context, target.dataset.id); return true; }
    if (!context.selected) return true;
    const userId = context.selected.userId;
    const viewRequest = context.request;
    const address = { channelId: context.channelId, userId };
    const conversation = context.conversation;
    const reply = context.replies.find(item => item.id === target.dataset.id);
    if (action === 'inbox-history') { await inboxOpen(context, userId); return true; }
    if (action === 'inbox-earlier') {
      const request = context.request;
      const older = await inboxOp(context, 'get_conversation', { ...address, ...Object.fromEntries(Object.entries(context.nextHistory || {}).filter(([, value]) => value)) });
      if (!inboxCurrent(context) || request !== context.request) return true;
      context.messages = [...new Map([...context.messages, ...older.messages].map(message => [message.id, message])).values()]; context.nextHistory = older.next;
      inboxDetail(context);
      notify(`Loaded ${older.messages.length} earlier messages. Your reply text is preserved.`);
      const focus = $('#conversation-detail .message-history button') || $('#conversation-detail h3');
      focus.tabIndex = focus.tabIndex < 0 ? -1 : focus.tabIndex; focus.focus();
      return true;
    }
    if (action === 'inbox-discard') { inboxComposers.delete(composerKey(context, userId)); inboxDetail(context); $('#replyText')?.focus(); return true; }
    if (action === 'inbox-claim') {
      await inboxOp(context, 'claim_conversation', { ...address, conversationRevision: conversation.revision });
      if (inboxCurrent(context)) notify('Conversation claimed for 15 minutes.');
    }
    if (['inbox-handoff', 'inbox-resume', 'inbox-resolve'].includes(action)) await inboxOp(context, 'set_conversation_state', { ...address, conversationRevision: conversation.revision, mode: action === 'inbox-resume' ? 'agent' : 'human', status: action === 'inbox-resolve' ? 'resolved' : 'open' });
    if (action === 'inbox-edit' && reply) {
      const composer = inboxComposer(context, userId);
      // Preserve an in-progress composition; editing a different saved reply is explicit.
      if (composer.text && composer.edit?.id !== reply.id) { notify('Save or clear the current reply text before editing another reply.', true); $('#replyText')?.focus(); return true; }
      if (composer.edit?.id !== reply.id) { composer.edit = reply; composer.text = reply.text; }
      inboxDetail(context); $('#replyText').focus(); return true;
    }
    if (['inbox-approve', 'inbox-send', 'inbox-cancel'].includes(action) && reply) {
      const result = await inboxOp(context, ({ 'inbox-approve': 'approve_reply', 'inbox-send': 'send_reply', 'inbox-cancel': 'cancel_reply' })[action], { ...address, id: reply.id, revision: reply.revision });
      if (inboxCurrent(context)) notify(result.status === 'sent' ? 'Fanvue accepted the reply and returned a message receipt.' : `Reply ${result.status}.`, ['failed', 'uncertain'].includes(result.status));
    }
    if (action === 'inbox-reconcile' && reply) {
      $('#reply-reconcile').innerHTML = `<form id="reply-outcome-form" class="reply-composer"><h3>Record a verified outcome</h3><p class="help">Inspect the conversation in Fanvue first. This records your finding; it never resends the message.</p><div class="field"><label for="replyOutcome">Verified delivery</label><select name="outcome" id="replyOutcome"><option value="sent">Sent</option><option value="not_sent">Not sent</option></select></div>${field('Fanvue message UUID', 'messageId', '', { help: 'Required for a sent message.' })}${field('Verification evidence', 'evidence', '', { area: true, required: true, max: 2000 })}<button class="button" type="submit">Record outcome</button></form>`;
      bindForm('#reply-outcome-form', async data => {
        const request = context.request;
        await inboxOp(context, 'reconcile_reply', { ...address, id: reply.id, outcome: data.get('outcome'), evidence: data.get('evidence'), ...(data.get('messageId') ? { messageId: data.get('messageId') } : {}) });
        if (inboxCurrent(context) && context.request === request && context.selected?.userId === userId) await inboxOpen(context, userId);
      });
      $('#replyOutcome').focus(); return true;
    }
    if (inboxCurrent(context) && context.request === viewRequest && context.selected?.userId === userId) await inboxOpen(context, userId);
    return true;
  } finally { target.disabled = false; }
}
