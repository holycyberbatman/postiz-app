const reviewPolicies = {
  company_strategy: 'Company approves the strategy; Wood manages publishing',
  company_posts: 'Company approves the strategy and every post',
  wood_managed: 'Wood approves the strategy and manages publishing',
};
let goalIndex = 0;
let channelIndex = 0;
function canConnect() { return state.role === 'owner' || state.role === 'company'; }
function canApprovePost(post) {
  if (state.data.onboarding?.reviewPolicy === 'company_posts') {
    return state.role === 'company' && (post.approvedByRole !== 'company' || post.approvalBriefRevision !== state.data.onboarding.revision);
  }
  return allowed('owner') && post.status === 'draft';
}
async function serviceView(sequence) {
  const business = state.business;
  const result = await op('get_operating_brief', {}, business);
  if (sequence !== state.sequence) return;
  const { brief, service, checks } = result;
  const companyApproval = service.companyApproval?.briefRevision === brief.revision && service.companyApproval?.strategyVersion === result.strategy?.version;
  const statusCopy = {
    onboarding: 'The company brings its goals, voice, and channels. Wood turns that brief into a content operation.',
    review: 'Wood is preparing the strategy and connections. Complete the launch checks before publishing begins.',
    active: 'Wood is authorized to operate this company’s content under the agreed strategy and review policy.',
    paused: 'Publishing is on hold. Wood can resume the service after checking the current brief and strategy.',
  };
  $('#workspace-view').innerHTML = `<div class="section-heading"><div><h2>${service.status === 'active' ? 'Content operations' : 'From company goals to content operations'}</h2><p>${escape(statusCopy[service.status])}</p></div>${button('Refresh status', 'refresh')}</div>
    <div class="split"><div><section class="reading"><h3>Launch readiness</h3><ul class="readiness-list">${checks.map(check => `<li><span class="readiness-symbol" aria-hidden="true">${check.ready ? '✓' : '—'}</span><span>${escape(check.label)}</span>${badge(check.ready ? 'ready' : 'needed')}</li>`).join('')}</ul><div class="form-actions">${button(brief.revision ? 'Review company brief' : 'Complete company brief', 'onboarding', service.status === 'active')}${button('Manage channels', 'connections')}</div></section>
    ${allowed('owner') && service.status !== 'active' ? `<form id="launch-form" class="form-shell launch-form"><h3>${service.status === 'paused' ? 'Resume the service' : 'Launch the service'}</h3><p class="help">Launching authorizes publishing under this company’s agreed review policy. Your agent runtime runs the team using its business access token.</p><div class="form-grid">${field('Wood operating team', 'team', service.team || '', { required: true, attrs: 'maxlength="120"', help: 'The team accountable for content and performance reviews.' })}${field('Review cadence in days', 'reviewEveryDays', service.reviewEveryDays || 7, { type: 'number', required: true, attrs: 'min="1" max="90"' })}</div><button class="button" type="submit" ${!result.ready ? 'disabled' : ''}>${service.status === 'paused' ? 'Resume service' : 'Launch service'}</button>${!result.ready ? '<p class="help">Finish the launch checks above to enable publishing.</p>' : ''}</form>` : ''}
    ${service.status === 'active' && canConnect() ? `<div class="form-actions">${button('Pause publishing', 'pause-service')}</div>` : ''}</div>
    <aside class="side-note"><h3>One shared service. A clear mandate.</h3><p>${escape(reviewPolicies[brief.reviewPolicy])}.</p><hr class="divider"><h3>${service.team ? 'Operating team' : 'What Wood manages'}</h3><p>${escape(service.team || 'Strategy, production, scheduling, and performance reviews across the channels in your brief.')}</p>${service.nextReviewAt ? `<p class="help">Next review due ${escape(date(service.nextReviewAt))}.</p>` : ''}<hr class="divider"><h3>What the company owns</h3><p>Business goals, the offer, brand guidance, access to its channels, and the agreed review policy.</p>${brief.contactName ? `<p class="help">Company contact: ${escape(brief.contactName)}</p>` : ''}${state.role === 'company' && result.strategy && brief.reviewPolicy !== 'wood_managed' ? `<div class="form-actions">${button(companyApproval ? 'Review approved strategy' : 'Review strategy for approval', 'show-strategy', false)}</div>` : ''}</aside></div>
    ${allowed('owner') ? `<section class="access-section"><div class="section-heading"><div><h2>Invite the company</h2><p>Give its representative access to this company’s brief, channels, strategy, and results.</p></div></div><form id="company-access-form" class="form-shell"><div class="form-grid">${field('Representative name', 'representative', brief.contactName, { required: true, attrs: 'maxlength="120"' })}${field('Access expires in days', 'accessDays', 30, { required: true, type: 'number', attrs: 'min="1" max="365"' })}</div><button class="button secondary" type="submit">Create company access link</button><p class="help">Share the link directly with the intended representative. Wood can revoke it under Agent access. This does not send an email.</p><div id="company-access-result"></div></form></section>` : ''}`;
  bindForm('#launch-form', async data => {
    await op('start_service', { team: data.get('team'), reviewEveryDays: Number(data.get('reviewEveryDays')) }, business);
    if (sequence !== state.sequence) return;
    notify('Service launched. Wood can schedule under the agreed publishing policy.'); await workspace(business, 'service');
  });
  bindForm('#company-access-form', async data => {
    const result = await op('issue_company_access', { name: data.get('representative'), days: Number(data.get('accessDays')) }, business);
    if (sequence !== state.sequence) { await op('revoke_token', { id: result.id }, business); notify('You left the workspace. The unused company access link was revoked.'); return; }
    const url = `${location.origin}/#access=${encodeURIComponent(result.token)}`;
    $('#company-access-result').innerHTML = `<div class="token-result"><strong>Share this link with the company representative.</strong><p class="help">Anyone holding it can access this company until expiry or revocation. The link is shown only once.</p><code id="company-access-link"></code>${button('Copy access link', 'copy-company-link')}</div>`;
    $('#company-access-link').textContent = url;
  });
}
function goalRow(value = {}) {
  const id = goalIndex++;
  return `<div class="intake-row" data-goal><div class="form-grid">${field('Desired business outcome', `goal-outcome-${id}`, value.outcome, { attrs: 'data-goal-outcome maxlength="500"', help: 'For example: more qualified enquiries for a specific offer.' })}${field('How you will measure it', `goal-metric-${id}`, value.metric, { attrs: 'data-goal-metric maxlength="200"' })}${field('Target', `goal-target-${id}`, value.target, { attrs: 'data-goal-target maxlength="200"' })}${field('Target date (optional)', `goal-date-${id}`, value.deadline, { type: 'date', attrs: 'data-goal-deadline' })}</div>${button('Remove goal', 'remove-goal')}</div>`;
}
function channelRow(value = {}) {
  const id = channelIndex++;
  const known = state.channels.some(channel => channel.id === value.channelId);
  return `<div class="intake-row" data-intake-channel><div class="form-grid">${field('Platform', `platform-${id}`, value.platform, { attrs: 'data-platform maxlength="80" list="platforms"', help: 'For example: LinkedIn, Instagram, YouTube, or Fanvue.' })}${field('Public profile URL (optional)', `profile-${id}`, value.profileUrl, { type: 'url', attrs: 'data-profile-url' })}<div class="field span-all"><label for="connected-${id}">Connected account</label><select id="connected-${id}" data-connected-channel><option value="">Connection still needed</option>${value.channelId && !known ? `<option value="${escape(value.channelId)}" selected>Saved account · verify its connection</option>` : ''}${state.channels.filter(channel => !channel.disabled).map(channel => `<option value="${escape(channel.id)}" ${value.channelId === channel.id ? 'selected' : ''}>${escape(channel.name)} · ${escape(channel.provider)}</option>`).join('')}</select><small>A profile URL describes the account. Authorization happens in Channels.</small></div></div>${button('Remove channel', 'remove-channel')}</div>`;
}
function onboardingView(step = 0) {
  const business = state.business;
  const sequence = state.sequence;
  const brief = state.data.onboarding;
  if (!canConnect()) {
    $('#workspace-view').innerHTML = `<section class="reading"><h2>Company mandate</h2><p class="help">The company and Wood manage onboarding. Your team can read the full mandate with get_operating_brief.</p><h3>Business goals</h3><ul>${brief.goals.map(goal => `<li>${escape(goal.outcome)} · ${escape(goal.metric)}: ${escape(goal.target)}</li>`).join('')}</ul><h3>Review policy</h3><p>${escape(reviewPolicies[brief.reviewPolicy])}</p></section>`;
    return;
  }
  let currentRevision = brief.revision;
  const steps = ['Company & goals', 'Brand & audience', 'Channels', 'Review & submit'];
  $('#workspace-view').innerHTML = `<div class="section-heading"><div><h2>Company onboarding</h2><p>Tell Wood what success means for this company. Save your progress at any step.</p></div>${brief.revision ? badge(`revision ${brief.revision}`) : ''}</div>
    <ol class="intake-steps" aria-label="Onboarding progress">${steps.map((label, index) => `<li ${index === step ? 'aria-current="step"' : ''}><span>${index + 1}</span>${label}</li>`).join('')}</ol>
    ${state.data.service?.submittedRevision ? '<p class="help mandate-notice">Saving changes to this submitted brief holds publishing until Wood reviews and launches the service again. Reviewing it without changes keeps the current mandate.</p>' : ''}
    <form id="onboarding-form" class="form-shell">
    <fieldset ${step !== 0 ? 'hidden' : ''}><legend>Company and business goals</legend><div class="form-grid">${field('Company name', 'briefName', brief.name, { required: true, attrs: 'maxlength="120"' })}${field('Company website (optional)', 'website', brief.website, { type: 'url' })}${field('Company contact', 'contactName', brief.contactName, { attrs: 'maxlength="120"' })}${field('Contact email', 'contactEmail', brief.contactEmail, { type: 'email' })}${field('Timezone', 'briefTimezone', brief.timezone, { required: true })}${field('What does the company offer?', 'offers', brief.offers, { area: true, help: 'Products, services, and the actions you want customers to take.' })}</div><h3>Measurable goals</h3><p class="help">Start with the outcomes content should support. Wood will use these in performance reviews.</p><div id="goal-rows">${(brief.goals.length ? brief.goals : [{}]).map(goalRow).join('')}</div>${button('Add another goal', 'add-goal')}</fieldset>
    <fieldset ${step !== 1 ? 'hidden' : ''}><legend>Audience and brand guidance</legend>${field('Who are you trying to reach?', 'briefAudience', brief.audience, { area: true })}${field('How should the company sound?', 'briefVoice', brief.brandVoice, { area: true, help: 'Tone, language, examples, and what makes the company distinct.' })}${field('Brand and asset links (optional)', 'assetLinks', brief.assetLinks.join('\n'), { area: true, help: 'One link per line to approved photos, logos, or brand guidelines. Do not enter passwords or API keys.' })}${field('Content boundaries (optional)', 'guardrails', brief.guardrails.join('\n'), { area: true, help: 'One rule per line: claims to avoid, topics to exclude, or review requirements.' })}</fieldset>
    <fieldset ${step !== 2 ? 'hidden' : ''}><legend>Channels Wood will operate</legend><p class="help">List every account in scope, then match it to an authorized connection. You can submit the brief while Wood helps complete connections.</p><datalist id="platforms">${['LinkedIn', 'Instagram', 'Facebook', 'YouTube', 'TikTok', 'Threads', 'X', 'Pinterest', 'Fanvue', 'Reddit'].map(platform => `<option value="${platform}"></option>`).join('')}</datalist><div id="channel-rows">${(brief.channels.length ? brief.channels : [{}]).map(channelRow).join('')}</div><div class="form-actions">${button('Add another channel', 'add-intake-channel')}<button class="button secondary" type="submit" data-destination="connections">Save and connect accounts</button></div></fieldset>
    <fieldset ${step !== 3 ? 'hidden' : ''}><legend>Agree on the operating mandate</legend><div class="field"><label for="reviewPolicy">Review and publishing policy</label><select id="reviewPolicy" name="reviewPolicy">${Object.entries(reviewPolicies).map(([value, label]) => `<option value="${value}" ${brief.reviewPolicy === value ? 'selected' : ''}>${escape(label)}</option>`).join('')}</select><small>Wood confirms this mandate at launch. Company approvals require a company representative’s access.</small></div>${field('Anything else Wood should know?', 'briefNotes', brief.notes, { area: true })}<div class="submission-summary"><h3>What happens next</h3><p>Wood reviews your goals, verifies the accounts, prepares the strategy, and assigns an operating team. Publishing starts only after the launch checks and agreed approvals are complete.</p><p class="help">Changing a submitted brief holds publishing until it is reviewed and launched again.</p></div></fieldset>
    <div class="form-actions intake-actions">${step > 0 ? `<button class="button secondary" type="submit" data-step="${step - 1}">Save and go back</button>` : ''}<button class="button secondary" type="submit" data-destination="service">Save for later</button>${step < 3 ? `<button class="button" type="submit" data-step="${step + 1}">Save and continue</button>` : '<button class="button" type="submit" data-destination="submit">Submit to Wood</button>'}</div></form>`;
  const progress = $('.intake-steps');
  progress.scrollLeft = Math.max(0, $('[aria-current]', progress).offsetLeft - progress.offsetLeft - 8);
  bindForm('#onboarding-form', async (data, form, submit) => {
    const goals = [...form.querySelectorAll('[data-goal]')].map(row => ({ outcome: $('[data-goal-outcome]', row).value.trim(), metric: $('[data-goal-metric]', row).value.trim(), target: $('[data-goal-target]', row).value.trim(), deadline: $('[data-goal-deadline]', row).value })).filter(goal => goal.outcome || goal.metric || goal.target || goal.deadline);
    const channels = [...form.querySelectorAll('[data-intake-channel]')].map(row => ({ platform: $('[data-platform]', row).value.trim(), profileUrl: $('[data-profile-url]', row).value.trim(), channelId: $('[data-connected-channel]', row).value })).filter(channel => channel.platform || channel.profileUrl || channel.channelId);
    const value = { name: data.get('briefName'), timezone: data.get('briefTimezone'), contactName: data.get('contactName'), contactEmail: data.get('contactEmail').trim(), website: data.get('website').trim(), offers: data.get('offers'), audience: data.get('briefAudience'), brandVoice: data.get('briefVoice'), goals, channels, assetLinks: lines(data.get('assetLinks')), guardrails: lines(data.get('guardrails')), notes: data.get('briefNotes'), reviewPolicy: data.get('reviewPolicy') };
    const saved = await op('save_onboarding', { revision: currentRevision, brief: value }, business);
    currentRevision = saved.revision;
    if (sequence !== state.sequence) return;
    state.data.onboarding = saved;
    state.data.business = { ...state.data.business, name: saved.name, timezone: saved.timezone, audience: saved.audience, brandVoice: saved.brandVoice };
    if (submit.dataset.destination === 'submit') {
      await op('submit_onboarding', { revision: saved.revision }, business);
      notify('Brief submitted to Wood. The service stays on hold until launch is complete.');
      return workspace(business, 'service');
    }
    if (submit.dataset.destination) { notify('Company brief saved.'); return workspace(business, submit.dataset.destination); }
    onboardingView(Number(submit.dataset.step)); focusHeading('#workspace-view h2'); window.scrollTo(0, 0);
  });
}
async function serviceAction(action, target) {
  if (action === 'onboarding') { await workspace(state.business, 'onboarding'); return true; }
  if (action === 'show-strategy') { await workspace(state.business, 'strategy'); return true; }
  if (action === 'add-goal') {
    if (document.querySelectorAll('[data-goal]').length >= 10) { notify('Use up to ten goals so the team can focus.', true); return true; }
    $('#goal-rows').insertAdjacentHTML('beforeend', goalRow()); $('#goal-rows').lastElementChild.querySelector('input').focus(); return true;
  }
  if (action === 'remove-goal') { target.closest('[data-goal]').remove(); return true; }
  if (action === 'add-intake-channel') {
    if (document.querySelectorAll('[data-intake-channel]').length >= 40) { notify('Use up to forty channels per company.', true); return true; }
    $('#channel-rows').insertAdjacentHTML('beforeend', channelRow()); $('#channel-rows').lastElementChild.querySelector('input').focus(); return true;
  }
  if (action === 'remove-channel') { target.closest('[data-intake-channel]').remove(); return true; }
  if (action === 'copy-company-link') { await navigator.clipboard.writeText($('#company-access-link').textContent); notify('Company access link copied.'); return true; }
  if (action === 'pause-service' || action === 'company-approve-strategy') {
    const business = state.business; target.disabled = true;
    try {
      await op(action === 'pause-service' ? 'pause_service' : 'approve_strategy', action === 'pause-service' ? {} : { version: state.data.strategy.version, briefRevision: state.data.onboarding.revision }, business);
      if (state.business === business) { notify(action === 'pause-service' ? 'Publishing is paused.' : 'Company strategy approval recorded.'); await workspace(business, 'service'); }
    } finally { target.disabled = false; }
    return true;
  }
  return false;
}
