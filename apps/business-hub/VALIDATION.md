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
