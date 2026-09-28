const $ = (selector, root = document) => root.querySelector(selector);
const main = $('#main');
const state = { nextContent: null, role: '', business: '', tab: 'content', data: null, channels: [], drafts: [], businesses: [], sequence: 0 };
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const lines = value => String(value || '').split('\n').map(value => value.trim()).filter(Boolean);
const allowed = role => ['reader', 'editor', 'publisher', 'owner'].indexOf(state.role) >= ['reader', 'editor', 'publisher', 'owner'].indexOf(role);
const badge = value => `<span class="badge ${escape(value)}">${escape(value.replaceAll('_', ' '))}</span>`;
const button = (text, action, secondary = true, extra = '') => `<button class="button ${secondary ? 'secondary' : ''}" data-action="${action}" ${extra}>${text}</button>`;
const field = (label, name, value = '', options = {}) => `<div class="field ${options.wide ? 'span-all' : ''}"><label for="${name}">${label}</label>${options.area ? `<textarea id="${name}" name="${name}" ${options.required ? 'required' : ''} maxlength="${options.max || 5000}" ${options.large ? 'class="large"' : ''}>${escape(value)}</textarea>` : `<input id="${name}" name="${name}" type="${options.type || 'text'}" value="${escape(value)}" ${options.required ? 'required' : ''} ${options.attrs || ''}>`}${options.help ? `<small>${options.help}</small>` : ''}</div>`;
function notify(message, error = false) {
  const notice = $('#notice'); notice.className = error ? 'error' : ''; notice.replaceChildren();
  const dismiss = document.createElement('button'); dismiss.textContent = '×'; dismiss.setAttribute('aria-label', 'Dismiss notification'); dismiss.onclick = () => { notice.hidden = true; };
  notice.append(dismiss, document.createTextNode(message)); notice.hidden = false;
}
async function api(path, body, method = body === undefined ? 'GET' : 'POST') {
  // Authenticated reads must not reuse a prior session's response in browser proxies.
  if (method === 'GET') path += `${path.includes('?') ? '&' : '?'}request=${crypto.randomUUID()}`;
  const response = await fetch(path, { method, cache: 'no-store', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) {
    const details = data.issues?.map(issue => `${issue.path}: ${issue.message}`).join('; ');
    throw new Error(details || data.error || 'The request could not be completed');
  }
  return data;
}
function op(operation, input = {}, business = state.business) { return api(`/api/businesses/${encodeURIComponent(business)}/${operation}`, input); }
function date(value) { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: state.data?.business.timezone || undefined }).format(new Date(value)); }
function bindForm(id, handler) {
  const form = $(id); if (!form) return;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = $('button[type=submit]', form); const previous = submit.textContent;
    submit.disabled = true; submit.textContent = 'Saving…';
    try { await handler(new FormData(form), form); }
    catch (error) { notify(error.message, true); }
    finally { submit.disabled = false; submit.textContent = previous; }
  });
}
function focusHeading(selector = 'h1') {
  const heading = $(selector, main);
  if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
}
function sessionActions() {
  $('#session-actions').innerHTML = state.role ? `<small>${escape(state.role === 'owner' ? 'Owner workspace' : `${state.role} access`)}</small>${button('Sign out', 'logout')}` : '';
}
function login() {
  state.role = ''; sessionActions();
  main.innerHTML = `<section class="login"><div class="login-intro"><div><h1>Every business.<br>Its own voice.</h1><p>Give your people and agents one place to take content from strategy to publication.</p></div><small>Postiz scheduling · Fanvue · Agent teams</small></div><form id="login-form"><h2>Open your workspace</h2><p class="muted">Sign in with the access token provided by your hub owner.</p>${field('Access token', 'token', '', { required: true, type: 'password', attrs: 'autocomplete="off" spellcheck="false"' })}<button class="button" type="submit">Sign in</button><p class="help">Your token stays in a secure browser session. Each agent token opens only its assigned business.</p></form></section>`;
  bindForm('#login-form', async data => { const result = await api('/api/session', { token: data.get('token').trim() }); state.role = result.role; sessionActions(); await portfolio(); });
}
async function portfolio() {
  window.scrollTo(0, 0);
  state.business = ''; const sequence = ++state.sequence;
  main.innerHTML = '<p class="loading">Loading businesses…</p>';
  const businesses = await api('/api/businesses'); if (sequence !== state.sequence) return;
  state.businesses = businesses;
  main.innerHTML = `<div class="page-heading"><div><h1>Your businesses</h1><p>Separate strategies, channels, and agent teams. One place to manage the work.</p></div>${allowed('owner') ? button('Add business', 'add-business', false) : ''}</div><div id="inline-form"></div>${businesses.length ? `<div class="table-wrap"><table><thead><tr><th>Business</th><th class="portfolio-secondary">Workspace</th><th class="align-right">Content operations</th></tr></thead><tbody>${businesses.map(business => `<tr><td><div class="business-cell"><span class="initials" aria-hidden="true">${escape(business.name.slice(0, 2).toUpperCase())}</span><div><button class="name-button" data-business="${escape(business.id)}">${escape(business.name)}</button><small>Business workspace</small></div></div></td><td class="portfolio-secondary"><code>${escape(business.id)}</code></td><td class="align-right">${button('Open workspace →', 'open-business', true, `data-id="${escape(business.id)}"`)}</td></tr>`).join('')}</tbody></table></div>` : `<section class="empty"><h2>Start with your first business.</h2><p>Set its voice, connect its channels, and give its agent team access. Every business gets its own strategy and publishing history.</p>${allowed('owner') ? button('Create a business', 'add-business', false) : ''}</section>`}`;
  focusHeading();
}
function addBusiness() {
  $('#inline-form').innerHTML = `<form id="business-form" class="form-shell"><h2>Create a business workspace</h2><div class="form-grid">${field('Business name', 'name', '', { required: true, attrs: 'maxlength="120"' })}${field('Workspace ID', 'id', '', { required: true, help: 'Used in the agent connection URL. Lowercase letters, numbers, and hyphens; at least 3 characters.', attrs: 'pattern="[a-z0-9][a-z0-9-]{2,59}" maxlength="60"' })}${field('Timezone', 'timezone', Intl.DateTimeFormat().resolvedOptions().timeZone, { required: true, help: 'Publication times are shown in this timezone.' })}${field('Audience', 'audience', '', { area: true })}${field('Brand voice', 'brandVoice', '', { area: true, wide: true, help: 'Describe how this business sounds, what it stands for, and what its content should avoid.' })}</div><div class="form-actions"><button class="button" type="submit">Create workspace</button>${button('Cancel', 'portfolio')}</div><p class="help">Starts with owner approval required for every post.</p></form>`;
  $('#name').focus();
  $('#name').addEventListener('input', event => { if (!$('#id').dataset.edited) $('#id').value = event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); });
  $('#id').addEventListener('input', () => { $('#id').dataset.edited = 'true'; });
  bindForm('#business-form', async data => { const business = await api('/api/businesses', Object.fromEntries(data)); notify('Business created. Connect its channels to start planning.'); await workspace(business.id, 'connections'); });
}
async function workspace(id = state.business, tab = state.tab) {
  window.scrollTo(0, 0);
  state.business = id; state.tab = tab; const sequence = ++state.sequence;
  main.innerHTML = '<p class="loading">Opening workspace…</p>';
  const data = await api(`/api/businesses/${id}`); if (sequence !== state.sequence) return;
  state.data = data; state.role = data.role; sessionActions();
  const business = data.business;
  main.innerHTML = `<section class="workspace"><a class="back" href="#" data-action="portfolio">← All businesses</a><div class="page-heading workspace-heading"><div><h1>${escape(business.name)}</h1><div class="meta"><span class="muted">${escape(business.timezone)}</span>${badge(business.publishingMode === 'approval' ? 'Owner approval' : 'Automatic publishing')}</div></div>${allowed('owner') ? button('Business settings', 'business-settings') : ''}</div><nav class="tabs" aria-label="Business workspace">${[['content', 'Content'], ['strategy', 'Strategy'], ['connections', 'Connections'], ['agents', 'Agent access'], ['activity', 'Activity']].map(([key, label]) => `<button class="tab" data-tab="${key}" ${tab === key ? 'aria-current="page"' : ''}>${label}</button>`).join('')}</nav><div id="workspace-view"><p class="loading">Loading ${escape(tab)}…</p></div></section>`;
  if (tab === 'content' || tab === 'strategy' || tab === 'connections') {
    try { state.channels = await op('list_channels', {}, id); }
    catch (error) {
      if (sequence !== state.sequence) return;
      state.channels = []; notify(error.message, true);
      if (tab !== 'connections') {
        $('#workspace-view').innerHTML = `<section class="empty"><h2>Channels could not be loaded.</h2><p>Your saved strategy and content are preserved. Check the connection or try again.</p>${button('Try again', 'refresh', false)} ${button('Manage connections', 'connections')}</section>`;
        focusHeading('#workspace-view h2'); return;
      }
    }
    if (sequence !== state.sequence) return;
  }
  if (tab === 'content') await contentView(sequence);
  if (tab === 'strategy') strategyView();
  if (tab === 'connections') connectionsView();
  if (tab === 'agents') await agentsView(sequence);
  if (tab === 'activity') await activityView(sequence);
  if (sequence === state.sequence) {
    const activeTab = $('.tab[aria-current]');
    const navigation = $('.tabs');
    navigation.scrollLeft = Math.max(0, activeTab.offsetLeft - navigation.offsetLeft - 16);
    focusHeading('#workspace-view h2');
  }
}
async function contentView(sequence = state.sequence, before) {
  const result = await op('list_drafts', before ? { before } : {}); if (sequence !== state.sequence) return;
  state.nextContent = result.nextCursor;
  state.drafts = before ? [...state.drafts, ...result.items] : result.items;
  result.items = state.drafts;
  const view = $('#workspace-view');
  view.innerHTML = `<div class="section-heading"><div><h2>Content pipeline</h2><p>Draft, review, and publish against this business’s strategy.</p></div>${allowed('editor') ? button('New draft', 'new-draft', false, !state.data.strategy ? 'disabled title="Save a strategy first"' : '') : ''}</div><div id="inline-form"></div>${result.items.length ? `<div class="content-list">${result.items.map(item => `<article class="post-row"><time datetime="${escape(item.scheduledAt)}">${escape(date(item.scheduledAt))}</time><div><h3>${escape(item.title)}</h3><p>${escape(item.content)}</p><div class="post-meta">${badge(item.status)}<span>${escape(state.channels.find(c => c.id === item.channelId)?.name || item.channelId)}</span><span>${escape(item.pillar)} · Strategy v${item.strategyVersion}</span></div>${item.error ? `<p class="error-copy">${escape(item.error)}</p>` : ''}${item.status === 'submitted' ? '<p class="help">Accepted by the publishing service. Confirm the final status in the connected platform or through MCP.</p>' : ''}</div><div class="post-actions">${['draft', 'approved'].includes(item.status) && allowed('editor') ? button('Edit', 'edit-draft', true, `data-id="${item.id}"`) : ''}${item.status === 'draft' && allowed('owner') ? button('Approve', 'approve', true, `data-id="${item.id}"`) : ''}${['draft', 'approved'].includes(item.status) && allowed('publisher') ? button('Schedule', 'schedule', false, `data-id="${item.id}" ${state.data.business.publishingMode === 'approval' && !item.approvedBy ? 'disabled title="Owner approval is required"' : ''}`) : ''}${['draft', 'approved', 'scheduled', 'failed'].includes(item.status) && allowed('editor') ? button('Cancel', 'cancel', true, `data-id="${item.id}"`) : ''}${item.status === 'uncertain' && allowed('owner') ? button('Reconcile', 'reconcile', true, `data-id="${item.id}"`) : ''}</div></article>`).join('')}</div>${result.nextCursor ? `<div class="form-actions">${button('Load older content', 'load-more-content')}</div>` : ''}` : `<section class="empty"><h2>${state.data.strategy ? 'Your next idea starts here.' : 'Give this business a direction.'}</h2><p>${state.data.strategy ? 'Create a draft or connect an agent team. Content will stay linked to the strategy version it was written for.' : 'Connect a channel, then write a content strategy with its audience, pillars, and publishing cadence.'}</p>${button(state.channels.length ? 'Open strategy' : 'Connect channels', 'goto-onboarding', false)}</section>`}`;
}
function compose(id) {
  const previous = state.drafts.find(item => item.id === id);
  const strategy = state.data.strategy;
  const selectedChannel = previous?.channelId || strategy.cadence[0]?.channelId;
  const value = previous || { title: '', content: '', pillar: strategy.pillars[0].name, settings: {}, media: [] };
  const target = $('#inline-form');
  const localDate = new Date(previous?.scheduledAt || Date.now() + 86400000);
  const localInput = new Date(localDate.getTime() - localDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  target.innerHTML = `<form id="draft-form" class="form-shell"><h2>${previous ? 'Edit draft' : 'Create a content draft'}</h2><div class="form-grid">${field('Working title', 'title', value.title, { required: true, attrs: 'maxlength="200"' })}<div class="field"><label for="channelId">Channel</label><select id="channelId" name="channelId">${strategy.cadence.map(c => `<option value="${escape(c.channelId)}" ${c.channelId === selectedChannel ? 'selected' : ''}>${escape(state.channels.find(channel => channel.id === c.channelId)?.name || c.channelId)}</option>`).join('')}</select></div>${field('Post content', 'content', value.content, { area: true, wide: true, large: true, max: 20000 })}<div class="field"><label for="pillar">Content pillar</label><select id="pillar" name="pillar">${strategy.pillars.map(p => `<option ${p.name === value.pillar ? 'selected' : ''}>${escape(p.name)}</option>`).join('')}</select></div>${field('Publish date and time', 'scheduledAt', localInput, { required: true, type: 'datetime-local', help: `Enter in your device timezone (${escape(Intl.DateTimeFormat().resolvedOptions().timeZone)}). The pipeline shows ${escape(state.data.business.timezone)}.` })}</div><div id="fanvue-fields"><div class="form-grid"><div class="field"><label for="audience">Fanvue audience</label><select name="audience" id="audience"><option value="subscribers">Subscribers</option><option value="followers-and-subscribers" ${value.fanvue?.audience === 'followers-and-subscribers' ? 'selected' : ''}>Followers and subscribers</option></select></div>${field('Price in cents (optional)', 'price', value.fanvue?.price || '', { type: 'number', attrs: 'min="300" max="50000" step="1"', help: 'Leave blank for an unpaid post. Paid posts require media.' })}${field('Fanvue media UUIDs', 'mediaUuids', (value.fanvue?.mediaUuids || []).join('\n'), { area: true, help: 'One vault media UUID per line. Your agent can upload assets through the Fanvue MCP tools.' })}${field('Free preview media UUID (optional)', 'mediaPreviewUuid', value.fanvue?.mediaPreviewUuid || '')}</div></div><details class="details" id="postiz-fields"><summary>Postiz media and channel settings</summary>${field('Uploaded Postiz media', 'mediaJson', JSON.stringify(value.media || [], null, 2), { area: true, help: 'Array of { "id": "…", "path": "https://…" } from your Postiz media library.' })}${field('Channel-specific settings', 'settingsJson', JSON.stringify(value.settings || {}, null, 2), { area: true, help: 'Some channels require additional settings. Use the fields required by your Postiz provider.' })}</details><div class="form-actions"><button class="button" type="submit">Save draft</button>${button('Close', 'refresh')}</div><p class="help">Saving does not publish. ${previous ? 'Changes clear previous approval.' : 'The current strategy version is attached to this draft.'}</p></form>`;
  function toggleChannel() { const fanvue = $('#channelId').value.startsWith('fanvue:'); $('#fanvue-fields').hidden = !fanvue; $('#postiz-fields').hidden = fanvue; }
  $('#channelId').addEventListener('change', toggleChannel); toggleChannel(); $('#title').focus(); target.scrollIntoView({ behavior: 'instant', block: 'start' });
  const business = state.business;
  const requestId = previous?.requestId || crypto.randomUUID();
  bindForm('#draft-form', async data => {
    const channelId = data.get('channelId'); const isFanvue = channelId.startsWith('fanvue:');
    const draft = { requestId, title: data.get('title'), content: data.get('content'), channelId, pillar: data.get('pillar'), scheduledAt: new Date(data.get('scheduledAt')).toISOString(), media: isFanvue ? [] : JSON.parse(data.get('mediaJson') || '[]'), settings: isFanvue ? {} : JSON.parse(data.get('settingsJson') || '{}') };
    if (isFanvue) draft.fanvue = { audience: data.get('audience'), mediaUuids: lines(data.get('mediaUuids')), ...(data.get('price') ? { price: Number(data.get('price')) } : {}), ...(data.get('mediaPreviewUuid') ? { mediaPreviewUuid: data.get('mediaPreviewUuid').trim() } : {}) };
    await op(previous ? 'update_draft' : 'create_draft', previous ? { id: previous.id, revision: previous.revision, draft } : draft, business);
    notify('Draft saved.'); if (state.business === business) await workspace(business, 'content');
  });
}
function strategyView() {
  const strategy = state.data.strategy;
  $('#workspace-view').innerHTML = `<div class="section-heading"><div><h2>Content strategy</h2><p>The shared direction for this business and its agent team.</p></div>${allowed('editor') ? button(strategy ? 'Edit strategy' : 'Write strategy', 'edit-strategy', false, !state.channels.length ? 'disabled title="Connect a channel first"' : '') : ''}</div><div id="inline-form"></div>${strategy ? `<div class="split"><article class="reading"><div class="section-heading"><h2>${escape(strategy.title)}</h2>${badge(strategy.status)}</div><p>${escape(strategy.objective)}</p><h3>Content pillars</h3><div class="pillars">${strategy.pillars.map(p => `<div><strong>${escape(p.name)}</strong><p class="muted">${escape(p.guidance)}</p></div>`).join('')}</div><h3>Publishing cadence</h3><ul>${strategy.cadence.map(c => `<li>${escape(state.channels.find(channel => channel.id === c.channelId)?.name || c.channelId)} · ${c.postsPerWeek} posts per week</li>`).join('')}</ul>${strategy.guardrails.length ? `<h3>Guardrails</h3><ul>${strategy.guardrails.map(rule => `<li>${escape(rule)}</li>`).join('')}</ul>` : ''}${strategy.successMetrics.length ? `<h3>What success looks like</h3><ul>${strategy.successMetrics.map(metric => `<li>${escape(metric)}</li>`).join('')}</ul>` : ''}</article><aside class="side-note"><h3>Strategy version ${strategy.version}</h3><p>${strategy.status === 'active' ? 'This strategy is active. Agents can create content against its pillars and cadence. The business publishing policy still applies.' : 'Review the complete strategy before activating it. Drafts cannot publish until their strategy version is active.'}</p>${strategy.status === 'draft' && allowed('owner') ? button('Activate this strategy', 'activate', false) : ''}<hr class="divider"><h3>Brand voice</h3><p>${escape(state.data.business.brandVoice || 'Add the brand voice in Business settings.')}</p><hr class="divider"><h3>Review and improve</h3><p>Agents can read channel analytics and record strategy reviews through MCP. New strategy versions require owner activation.</p></aside></div>` : `<section class="empty"><h2>Plan the work before it goes live.</h2><p>Define the objective, content pillars, cadence, guardrails, and measures of success. An owner activates the strategy before any post can publish.</p>${!state.channels.length ? button('Connect a channel first', 'connections', false) : allowed('editor') ? button('Write the first strategy', 'edit-strategy', false) : '<p class="help">An editor or owner can write this business’s strategy.</p>'}</section>`}`;
}
function editStrategy() {
  const strategy = state.data.strategy || { title: '', objective: '', pillars: [], cadence: [], guardrails: [], successMetrics: [] };
  $('#inline-form').innerHTML = `<form id="strategy-form" class="form-shell"><h2>${state.data.strategy ? 'Revise the strategy' : 'Write the strategy'}</h2>${field('Strategy title', 'title', strategy.title, { required: true, attrs: 'maxlength="200"' })}${field('Objective', 'objective', strategy.objective, { area: true, required: true })}${field('Content pillars', 'pillars', strategy.pillars.map(p => `${p.name} | ${p.guidance}`).join('\n'), { area: true, required: true, help: 'One per line: Pillar name | What this pillar should cover' })}<p class="field-label">Weekly cadence</p><p class="help">Select the channels this strategy is allowed to use.</p><div class="cadence-fields">${state.channels.filter(c => !c.disabled).map((channel, index) => { const cadence = strategy.cadence.find(c => c.channelId === channel.id); return `<div class="check-row"><input type="checkbox" id="channel-${index}" name="channels" value="${escape(channel.id)}" ${cadence ? 'checked' : ''}><label for="channel-${index}">${escape(channel.name)} <small>· ${escape(channel.provider)}</small></label><input type="number" min="1" max="50" value="${cadence?.postsPerWeek || 3}" name="frequency-${index}" aria-label="Posts per week for ${escape(channel.name)}"></div>`; }).join('')}</div><div class="form-grid">${field('Guardrails', 'guardrails', strategy.guardrails.join('\n'), { area: true, help: 'One rule per line.' })}${field('Success metrics', 'successMetrics', strategy.successMetrics.join('\n'), { area: true, help: 'One metric per line.' })}</div><div class="form-actions"><button class="button" type="submit">Save strategy draft</button>${button('Cancel', 'refresh')}</div><p class="help">Saving creates a new version. Existing content using an older version will be held until it is revised.</p></form>`;
  $('#title').focus(); const business = state.business;
  bindForm('#strategy-form', async data => {
    const selected = data.getAll('channels');
    const cadence = state.channels.filter(c => !c.disabled).map((channel, index) => ({ channelId: channel.id, postsPerWeek: Number(data.get(`frequency-${index}`)) })).filter(c => selected.includes(c.channelId));
    await op('save_strategy', { title: data.get('title'), objective: data.get('objective'), pillars: lines(data.get('pillars')).map(line => { const [name, ...rest] = line.split('|'); return { name: name.trim(), guidance: rest.join('|').trim() }; }), cadence, guardrails: lines(data.get('guardrails')), successMetrics: lines(data.get('successMetrics')) }, business);
    notify('Strategy saved as a new draft. An owner can activate it after review.'); if (state.business === business) await workspace(business, 'strategy');
  });
}
function connectionsView() {
  const data = state.data; const account = data.connections.fanvue;
  $('#workspace-view').innerHTML = `<div class="section-heading"><div><h2>Connected channels</h2><p>Use one Postiz organization and the matching Fanvue creator for this business.</p></div></div><section class="connection-row"><div><h3>Postiz social channels</h3><p>Connect the organization that contains this business’s Instagram, LinkedIn, TikTok, and other social accounts.</p>${data.postizOrigin ? `<p class="help"><a href="${escape(data.postizOrigin)}" target="_blank" rel="noopener noreferrer">Open your Postiz instance ↗</a></p>` : ''}</div><div>${badge(data.connections.postiz ? 'Connected' : 'Not connected')}${!data.capabilities.postiz ? '<p>Set the Postiz server address during deployment to enable this connection.</p>' : allowed('owner') ? `<form id="postiz-form">${field('Organization API key', 'apiKey', '', { required: true, type: 'password', attrs: 'autocomplete="off"' })}<button type="submit" class="button">${data.connections.postiz ? 'Update connection' : 'Connect Postiz'}</button></form>` : '<p>Your hub owner manages this connection.</p>'}${data.connections.postiz && allowed('owner') ? `<div class="form-actions">${button('Disconnect Postiz', 'disconnect-postiz')}</div>` : ''}</div></section><section class="connection-row"><div><h3>Fanvue</h3><p>Connect this business’s creator account to publish text and media through Fanvue’s official API.</p></div><div>${badge(account ? 'Connected' : 'Not connected')}${account ? `<p><strong>${escape(account.displayName)}</strong> · @${escape(account.handle)} ${account.isAiCreator ? badge('AI creator') : ''}</p>` : ''}${!data.capabilities.fanvueOAuth ? '<p>Fanvue app credentials must be configured during deployment before a creator can connect.</p>' : allowed('owner') ? `<div class="form-actions">${button(account ? 'Reconnect with Fanvue' : 'Connect with Fanvue', 'connect-fanvue', false)}</div>` : '<p>Your hub owner manages this connection.</p>'}${account && allowed('owner') ? `<div class="form-actions">${button('Disconnect Fanvue', 'disconnect-fanvue')}</div>` : ''}</div></section>${state.channels.length ? `<hr class="divider"><h3>Available to this strategy</h3><div class="table-wrap"><table><thead><tr><th>Channel</th><th>Platform</th><th>State</th></tr></thead><tbody>${state.channels.map(channel => `<tr><td>${escape(channel.name)}</td><td>${escape(channel.provider)}</td><td>${badge(channel.disabled ? 'Disabled' : 'Connected')}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  bindForm('#postiz-form', async data => { await op('connect_postiz', { apiKey: data.get('apiKey').trim() }); notify('Postiz organization connected.'); await workspace(state.business, 'connections'); });
}
async function agentsView(sequence) {
  const business = state.business;
  const businessName = state.data.business.name;
  const tokens = allowed('owner') ? await op('list_tokens', {}, business) : [];
  if (sequence !== state.sequence) return;
  const endpoint = `${location.origin}/mcp/${business}`;
  $('#workspace-view').innerHTML = `<div class="section-heading"><div><h2>Agent access</h2><p>Give each team its own revocable token for this business.</p></div></div><div class="split"><div>${allowed('owner') ? `<form id="token-form" class="form-shell"><h2>Create an agent token</h2>${field('Team or agent name', 'name', '', { required: true, attrs: 'maxlength="120"' })}<div class="form-grid"><div class="field"><label for="role">Permissions</label><select id="role" name="role"><option value="editor">Editor · plan and draft</option><option value="reader">Reader · inspect and report</option><option value="publisher">Publisher · draft and schedule</option></select></div>${field('Expires in days', 'days', 90, { type: 'number', required: true, attrs: 'min="1" max="365"' })}</div><button type="submit" class="button">Create token</button><div id="token-result"></div></form>` : ''}<div class="reading"><h3>Business MCP endpoint</h3><code>${escape(endpoint)}</code><p class="help">Use Streamable HTTP with an Authorization: Bearer header. Supply an agent token for this business.</p><h3>Start the team with this brief</h3><p>Read the business profile, active strategy, and channels. Draft content for the approved pillars and cadence. Schedule only within the publishing policy. Check results, record the review, and propose the next strategy version.</p></div></div><aside class="side-note"><h3>Authority stays explicit.</h3><p>Readers inspect. Editors plan and draft. Publishers can also schedule authorized content.</p><p class="help">Agent tokens cannot activate strategies, approve content, change business settings, or create more tokens.</p><hr class="divider"><h3>One token, one business.</h3><p>This endpoint and its credentials are bound to ${escape(state.data.business.name)}. Create separate tokens for other businesses.</p></aside></div>${tokens.length ? `<h3 class="section-heading">Issued tokens</h3><div class="table-wrap"><table class="token-table"><thead><tr><th>Team</th><th>Role</th><th>Expires</th><th></th></tr></thead><tbody>${tokens.map(token => `<tr><td>${escape(token.name)}${token.revoked ? '<small>Revoked</small>' : ''}</td><td>${escape(token.role)}</td><td>${escape(date(token.expiresAt))}</td><td>${!token.revoked ? button('Revoke', 'revoke', true, `data-id="${escape(token.id)}"`) : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  bindForm('#token-form', async data => {
    const result = await op('issue_token', { name: data.get('name'), role: data.get('role'), days: Number(data.get('days')) }, business);
    if (sequence !== state.sequence || state.business !== business) {
      await op('revoke_token', { id: result.id }, business);
      notify(`You left ${businessName} while the token was being created. It was revoked; create a new token in that workspace.`);
      return;
    }
    $('#token-result').innerHTML = `<div class="token-result"><strong>Save this token now.</strong><p class="help">It is shown only once. Store it in your agent team’s secret manager.</p><code id="new-token"></code>${button('Copy token', 'copy-token')}</div>`;
    $('#new-token').textContent = result.token;
  });
}
async function activityView(sequence) {
  const [audit, reviews] = await Promise.all([op('list_audit'), op('list_reviews')]); if (sequence !== state.sequence) return;
  $('#workspace-view').innerHTML = `<div class="section-heading"><div><h2>Activity and reviews</h2><p>Who changed what, and what the content taught the team.</p></div>${button('Refresh', 'refresh')}</div>${reviews.length ? `<div class="reading"><h3>Latest strategy review</h3><p>${escape(reviews[0].findings)}</p><ul>${reviews[0].nextActions.map(action => `<li>${escape(action)}</li>`).join('')}</ul></div><hr class="divider">` : ''}${audit.items.length ? `<ul class="audit-list">${audit.items.map(item => `<li><time>${escape(date(item.at))}</time><div><span>${escape(item.action.replaceAll('_', ' '))}</span><small>${escape(item.actor === 'admin' ? 'Hub owner' : item.actor === 'scheduler' ? 'Publishing scheduler' : `${item.role} · ${item.actor.slice(0, 12)}`)}</small></div></li>`).join('')}</ul>` : '<section class="empty"><h2>No activity yet.</h2><p>Strategy changes, token grants, approvals, and publishing outcomes will appear here.</p></section>'}`;
}
function businessSettings() {
  const business = state.data.business;
  $('#workspace-view').innerHTML = `<form id="settings-form" class="form-shell"><h2>Business settings</h2><div class="form-grid">${field('Business name', 'name', business.name, { required: true })}${field('Timezone', 'timezone', business.timezone, { required: true })}${field('Brand voice', 'brandVoice', business.brandVoice, { area: true })}${field('Audience', 'audience', business.audience, { area: true })}${field('Business goals', 'goals', business.goals.join('\n'), { area: true, wide: true, help: 'One goal per line.' })}<div class="field"><label for="publishingMode">Publishing policy</label><select id="publishingMode" name="publishingMode"><option value="approval">Owner approves each post</option><option value="automatic" ${business.publishingMode === 'automatic' ? 'selected' : ''}>Agents publish within an active strategy</option></select><small>Automatic mode authorizes publisher agents to schedule without individual approval. Strategies still need owner activation.</small></div>${field('Daily publication limit', 'dailyPostLimit', business.dailyPostLimit, { required: true, type: 'number', attrs: 'min="1" max="100"' })}</div><div class="form-actions"><button class="button" type="submit">Save business settings</button>${button('Cancel', 'refresh')}</div></form>`;
  bindForm('#settings-form', async data => { const value = Object.fromEntries(data); value.goals = lines(value.goals); value.dailyPostLimit = Number(value.dailyPostLimit); await op('update_business', value, business.id); notify('Business settings saved.'); await workspace(business.id); });
}
function reconcile(id) {
  $('#inline-form').innerHTML = `<form id="reconcile-form" class="form-shell"><h2>Resolve an uncertain publication</h2><p class="help">Inspect the destination platform first. Marking an unverified outcome can leave a duplicate or a missing post.</p><div class="field"><label for="outcome">Verified outcome</label><select id="outcome" name="outcome"><option value="published">The post is published</option><option value="not_published">The post was not published</option></select></div>${field('Provider post ID', 'providerId', '', { help: 'Required when the post is published.' })}<div class="form-actions"><button class="button" type="submit">Record verified outcome</button>${button('Cancel', 'refresh')}</div></form>`;
  bindForm('#reconcile-form', async data => { await op('resolve_uncertain', { id, outcome: data.get('outcome'), ...(data.get('providerId') ? { providerId: data.get('providerId') } : {}) }); notify('Publication reconciled.'); await workspace(); });
}
document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action],[data-tab],[data-business]'); if (!target) return; event.preventDefault();
  if (target.disabled) return;
  try {
    if (target.dataset.tab) return await workspace(state.business, target.dataset.tab);
    if (target.dataset.business) return await workspace(target.dataset.business, 'content');
    const action = target.dataset.action; const id = target.dataset.id;
    if (action === 'logout') { await api('/api/session', undefined, 'DELETE'); return login(); }
    if (action === 'portfolio') return await portfolio();
    if (action === 'add-business') return addBusiness();
    if (action === 'open-business') return await workspace(id, 'content');
    if (action === 'refresh') return await workspace();
    if (action === 'load-more-content') { target.disabled = true; await contentView(state.sequence, state.nextContent); focusHeading('#workspace-view h2'); return; }
    if (action === 'business-settings') return businessSettings();
    if (action === 'goto-onboarding') return await workspace(state.business, state.channels.length ? 'strategy' : 'connections');
    if (action === 'connections') return await workspace(state.business, 'connections');
    if (action === 'edit-strategy') return editStrategy();
    if (action === 'new-draft' || action === 'edit-draft') return compose(id);
    if (action === 'reconcile') return reconcile(id);
    if (action === 'copy-token') { await navigator.clipboard.writeText($('#new-token').textContent); return notify('Token copied. Store it securely.'); }
    target.disabled = true;
    if (action === 'activate') { await op('activate_strategy', { version: state.data.strategy.version }); notify('Strategy activated.'); }
    if (action === 'approve' || action === 'schedule') { const draft = state.drafts.find(d => d.id === id); await op(action === 'approve' ? 'approve_draft' : 'schedule_draft', { id, revision: draft.revision }); notify(action === 'approve' ? 'Draft approved.' : 'Post scheduled.'); }
    if (action === 'cancel') { await op('cancel_draft', { id }); notify('Draft cancelled.'); }
    if (action === 'revoke') { await op('revoke_token', { id }); notify('Token revoked.'); }
    if (action === 'disconnect-postiz' || action === 'disconnect-fanvue') { await op('disconnect_channel', { provider: action.slice(11) }); notify('Connection removed. Scheduled content for that connection will be held.'); }
    if (action === 'connect-fanvue') { const result = await op('connect_fanvue'); location.assign(result.url); return; }
    await workspace();
  } catch (error) { notify(error.message, true); }
  finally { target.disabled = false; }
});
async function boot() {
  try {
    const session = await api('/api/session'); state.role = session.role; sessionActions();
    const business = new URL(location.href).searchParams.get('business') || session.businessId;
    if (business) await workspace(business, new URL(location.href).searchParams.has('connected') ? 'connections' : 'content'); else await portfolio();
  } catch { login(); }
}
boot();
