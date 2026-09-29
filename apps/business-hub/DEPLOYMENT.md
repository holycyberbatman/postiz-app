# Deployment runbook

## Cloudflare hub

Run from `apps/business-hub`. Authenticate Wrangler to the intended Cloudflare account before deploying. The account needs Workers and Durable Objects access; usage is billed according to that account’s plan.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm setup:secrets --production
pnpm run deploy
pnpm exec wrangler secret bulk .secrets/production.json
```

The initial deployment refuses all authenticated operations until the secrets are installed. `.secrets/production.json` and `.secrets/OWNER-ACCESS.txt` are ignored by Git and created with mode 0600 in a private directory. Save them in a password manager or encrypted backup. Use the owner token only for owner sessions; issue scoped tokens for agent teams.

The deploy command prints the actual Workers URL. Set `PUBLIC_ORIGIN` to that exact HTTPS origin, or to your configured custom domain, then deploy again. Keep `FANVUE_API_VERSION` in `wrangler.jsonc`; set additional nonsecret variables alongside it. For a one-off origin override:

```sh
pnpm exec wrangler deploy --var PUBLIC_ORIGIN:https://YOUR-HUB.example.com
```

For a persistent production origin, add it under `vars` in `wrangler.jsonc`. Never place OAuth secrets, provider API keys, the encryption key, or the owner token in that file.

Health: `GET /health` returns `ready` after owner/encryption secrets exist. This is hub readiness; it does not mean that providers are connected or company operations have launched. The dashboard’s Channels screen shows missing provider configuration. Without a bearer token or authenticated session, `/api/businesses` and `/mcp/{business}` return 401.

Cloudflare creates the directory and per-business SQLite Durable Object namespaces through the `v1` migration. Preserve those bindings and migration history on upgrades. Never rename the Worker or recreate namespaces as a routine deployment. Durable Object records and alarms survive Worker releases. Use Cloudflare’s storage recovery facilities and securely retained encryption keys for recovery; an automated export/restore workflow is not included in this release.

Version 0.2 adds managed-service records within the existing Durable Objects; no new namespace or migration is needed. New companies default to managed onboarding. Existing businesses without `managedService` keep the legacy approval workflow and are not automatically enrolled. Company access is distinct from agent access and cannot use MCP.

## Read-only release check

After deploying, run `pnpm smoke https://YOUR-HUB.example.com`. It uses `HUB_SMOKE_TOKEN` from the environment or the private production secret file and checks health, the dashboard, authentication, cookie flags, Origin protection, and a real MCP handshake. It does not create a business, credential, strategy, or post. Only use it with the trusted deployment origin.

## Fanvue OAuth app

Register an approved Fanvue app through [Fanvue’s developer documentation](https://api.fanvue.com/docs). Configure the exact callback:

```
https://YOUR-HUB.example.com/oauth/fanvue/callback
```

Install the app credentials using Wrangler’s interactive secret input:

```sh
pnpm exec wrangler secret put FANVUE_CLIENT_ID
pnpm exec wrangler secret put FANVUE_CLIENT_SECRET
```

Requested scopes: `openid offline_access offline read:self read:post write:post read:media write:media`. The implementation uses authorization code + S256 PKCE, HTTP Basic client authentication, a browser-bound single-use state, and refresh token rotation. The pinned API version is `2025-06-26`; the API base is `https://api.fanvue.com/v1`. Authorize the intended creator from that company’s Channels tab using Wood or company access. Fanvue must return a creator account. Revoked or expired company access cannot finish an OAuth connection started earlier.

Each business has one Fanvue creator connection. Keep a creator assigned to one business when distinct tenant isolation is required; connecting the same account to multiple businesses would intentionally share access to that account’s content. Revoke access through Disconnect Fanvue or in Fanvue itself. Changing to a different creator requires disconnecting first.

Do not send OAuth client secrets to agents. Agents use hub-issued tokens; only the Worker handles refresh credentials. No Fanvue credential has been supplied or real creator connection tested as part of the initial build.

Reference contracts: [OpenAPI](https://api.fanvue.com/docs/openapi-v1.json), [OAuth discovery](https://auth.fanvue.com/.well-known/openid-configuration).

## Persistent Postiz service

Postiz’s frontend/backend, PostgreSQL, Redis, Temporal, and uploads need a persistent container host. Workers provide the new hub, not these existing services. An existing self-hosted Postiz instance can also be connected; there is no need to redeploy it just for the hub.

A host-ready compose recipe is in `deploy/postiz.compose.yaml`, adapted from the upstream compose topology. It uses named volumes, health checks, loopback-only HTTP exposure, and no public database, Redis, Temporal, or Elasticsearch ports. Docker is not available in the build workstation, and no persistent host has been selected, so this recipe has not been launched or runtime-verified.

1. Provision a container host with enough capacity for Postiz and Temporal’s full stack. Choose backup and monitoring before relying on scheduled content.
2. Copy `deploy/.env.example` to `deploy/.env`, set an explicit released Postiz image tag or digest, distinct random database passwords and JWT secret, and the public HTTPS origin. Do not use the sample values in production.
3. Supply the social platform OAuth application credentials that the selected channels require. The hub does not remove Postiz’s platform-specific app setup requirements.
4. Run `docker compose --env-file .env -f postiz.compose.yaml config` from `deploy`, then `docker compose --env-file .env -f postiz.compose.yaml up -d`.
5. Place HTTPS ingress or a Cloudflare Tunnel in front of `127.0.0.1:4007`. Keep the Postiz public API reachable from the hub Worker; an interactive Cloudflare Access login on that API would prevent machine access.
6. For first-owner bootstrap only, temporarily set `DISABLE_REGISTRATION=false` and restrict ingress to the operator. Create the owner, then set it back to `true`, restart Postiz, and open normal ingress.
7. Create a separate Postiz organization per business, connect its social accounts, and obtain that organization’s API key.
8. Set `POSTIZ_ORIGIN` in hub `wrangler.jsonc` to the HTTPS origin (no path, credentials, or query), deploy the hub, then paste each organization’s key into the matching company’s Channels screen.

Pin and upgrade image versions deliberately. The provided image variable refers to a published upstream Postiz release because this fork’s existing Postiz engine is unchanged; the hub is deployed separately from its own source. If you later modify the original engine, build and deploy an image containing those fork changes.

## First live verification

Follow [company onboarding and Wood launch](AGENT_GUIDE.md#company-onboarding-and-wood-launch): submit the actual brief, connect and map all requested accounts, activate the strategy, collect required company approval, issue scoped team access, and launch. Verify a company token cannot access another company, issue agent access, launch, or connect to MCP; verify an editor cannot activate a strategy or schedule content. Create one agreed test draft for the intended channel, inspect media/settings and destination, obtain any required company approval, then schedule it through publisher access. Verify the final platform post and record the provider ID. No real test post was created by the automated test suite.

After successful live validation, configure the company’s content and review run schedules in the chosen agent runtime. The Service page records the assigned Wood team and next review date, but does not run a model or schedule the team. Deployment and service launch alone do not start agent jobs.
