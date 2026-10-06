# Initial release verification — 2026-09-28

- `pnpm typecheck`: passed.
- `pnpm test`: 14 integration tests passed using real workerd/Durable Objects and mocked providers.
- `node --check public/app.js`: passed.
- `pnpm build`: Wrangler dry run passed; bundle approximately 857 KiB / 163 KiB gzip.
- Browser: local owner sign-in, synthetic business creation, persisted portfolio, workspace navigation, truthful unconfigured connections, and agent setup screen checked. Keyboard focus reaches the new view heading. At 390px, document width equals viewport width and the selected tab is fully visible. Desktop/mobile screenshots inspected.
- Independent Impeccable finish review completed. Fixed token response binding to its originating workspace, missing view focus, misleading channel-fetch failure states, reader-only strategy action visibility, content pagination, and clipped active mobile tabs. Detector warning about a thick rounded-card border was a false positive on the square tab underline.
- Live `pnpm smoke https://postiz-business-hub.robertwood50.workers.dev`: passed dashboard, authentication, secure cookie flags, Origin checks, MCP initialization, and discovery of 19 tools. Business count was zero; no business records or social posts were written by the smoke check.
- Secrets are stored in Cloudflare secret bindings and ignored local private files. Generated production credential values were checked against staged source and were absent.

Not validated: real Fanvue authorization/upload/publication, real Postiz organization delivery, a full upstream Postiz build, or the persistent-container recipe on a target host. Those require provider credentials and the selected host. No agent runtime has been connected or scheduled yet.

# Wood Enterprises shared service — 2026-09-28

- `pnpm typecheck`: passed.
- `pnpm test`: 23 integration tests passed using real workerd/Durable Objects, mocked providers, and an MCP client. New coverage includes company access isolation, onboarding validation/revisions, all launch requirements, company-only approvals, unchanged-brief preservation, paused queued posts, MCP strategy changes, portfolio synchronization, review cadence, and revoked company access during OAuth.
- `node --check` for `public/app.js`, `public/service.js`, and `scripts/smoke.mjs`: passed.
- `pnpm build`: deployment dry run passed; bundle 871.55 KiB / 165.81 KiB gzip.
- Browser: completed and submitted all four onboarding steps with a synthetic local company, verified persisted inputs on reopening, pending channel readiness, disabled launch, edit-mandate notice, and heading focus. Desktop and 390px mobile screenshots inspected; document width equals mobile viewport width. No browser console warnings/errors observed. Release asset query versions were updated to avoid stale browser assets during verification.
- Deployed to the existing `postiz-business-hub` Worker; version `84dd5d9a-1b84-4dd5-879b-832d5d0d1b9a`. Existing Durable Object namespaces and stored legacy workspaces are preserved.
- Live `pnpm smoke https://postiz-business-hub.robertwood50.workers.dev`: passed health, Wood dashboard, authentication, secure cookie flags, Origin protection, MCP initialization, and discovery of 20 tools. Production business count remains zero; the check wrote no business records or posts.

Live provider and agent-runtime limitations above still apply. Company access uses reusable, expiring bearer links; no email invitation, SSO, or public registration is claimed. Service launch authorizes the configured publisher team but does not create or run that team’s agent runtime.

# Capability baseline and Fanvue engagement — 2026-10-06

- Release `0.3.0`; the commercial suite acceptance baseline is recorded in `CAPABILITIES.md`, with current implementation coverage exposed through `get_capabilities`. Commercial parity remains false.
- `pnpm typecheck`: passed. JavaScript syntax checks for the dashboard, inbox and smoke script passed.
- `pnpm test`: all 36 integration tests passed using real workerd/Durable Objects, mocked providers and actual MCP clients. Coverage includes explicit chat consent, unknown/reduced scopes, unchanged old token access, per-channel read/draft/send grants, role-aware MCP discovery, wrong-counterpart rejection, history cursors without mark-as-read, exclusive claims, human approval, stale context/edits, takeover, send idempotency, daily limits, explicit 429 failure, missing receipts, uncertainty holds/reconciliation, pause, revocation, disconnection and audit privacy. The wrong-counterpart negative test emits an intentionally redacted error message.
- `pnpm build`: final Wrangler dry run passed; Worker bundle 908.08 KiB / 174.35 KiB gzip. No dependency, Durable Object namespace, database migration or secret changes were required.
- Browser: a local synthetic company and mocked Fanvue connector exercised claim → approve → send, displaying the returned message receipt. Verified desktop and 390px layouts, current conversation accessibility state and focus, and preservation of unsaved reply text after history refresh. No document-wide horizontal overflow or browser warnings/errors observed.
- Independent Impeccable finish review completed. Fixed unsaved composer state loss, conversation-bound async completion, `aria-current` values and pagination/error focus/announcements. Design/surface documentation was updated from the finished extension. Detector findings concerned pre-existing rules and documented values; new inbox styles introduced no findings.
- Deployed to the existing `postiz-business-hub` Worker; version `b42abca8-f6d6-453f-a761-dca80dddfcbe`. Existing storage and credentials are preserved. Engagement defaults off; existing agent tokens are not given private-conversation permissions.
- Live smoke passed version/health, dashboard and inbox asset, authentication, cookie flags, Origin protection, MCP initialization and discovery of 31 owner-visible tools. Production business count was zero. The check wrote no business records and sent no posts or messages.

Not verified: a real Fanvue creator/token response, real conversation reads/replies, provider read/delivery state, or live app entitlements. Publishing-only OAuth is the default; explicit inbox authorization must return the necessary chat scopes. This release supports reviewed text replies to existing chats, with on-demand refresh. Webhooks, background synchronization, comments, attachments/new chats, automatic replies, paid/bulk campaigns and other networks' inboxes remain unimplemented. Claims coordinate operators within one business; provider read/send is not atomic and does not coordinate direct Fanvue operators. No agent runtime was started.
