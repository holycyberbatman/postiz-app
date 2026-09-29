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
