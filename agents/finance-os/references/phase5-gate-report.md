# Phase 5 Gate Report — 2026-11-27

## Result

**Passed for the synthetic standalone adapter; no unresolved Phase 5 implementation blocker.** The webhook-only Telegram channel adapter satisfies the Phase 5 gate over the existing authenticated MCP/domain boundary. Phase 2–4 regressions remain green. No real financial data, live bot token, Telegram account, Telegram endpoint, public listener, or external message was used.

## Environment and dependencies

- Host/runtime: Apple-silicon macOS (`darwin-arm64`, Darwin 24.6.0), Node.js 22.16.0, OpenSSL 3.0.16.
- Runtime version: 0.5.0. Phase 5 introduces no new package dependency.
- Locked direct dependencies remain Ajv 8.20.0, `@modelcontextprotocol/sdk` 1.32.2, and Zod 4.6.7.
- `npm audit --audit-level=low`: 0 vulnerabilities.
- `npm ls --all --omit=optional`: required installed dependency tree matches the lockfile; the SDK's unused platform-specific `@cfworker/json-schema` is the only unmet optional dependency.

## Hosting and boundary decision

The selected model is webhook-only behind a dedicated TLS-terminating reverse proxy. The public edge may expose only the opaque Telegram webhook route and must overwrite forwarded TLS headers. The adapter calls the loopback-only authenticated MCP service; it never exposes MCP, imports storage/keys/domain modules, or downloads attachments. Long polling and direct MCP exposure were rejected for this phase. Details and live-deployment blockers are in [`telegram-threat-model.md`](telegram-threat-model.md).

## Automated evidence

- Full loopback regression/integration suite: 81 runnable tests passed, 0 failed, with 1 optional macOS Keychain lifecycle test skipped. Phase 5 neither uses nor weakens that optional Phase 2 host-key test.
- Phase 5 adds 9 passing Telegram tests covering lifecycle, forged/non-TLS webhooks, wrong user/chat, group/forwarded/edited/attachment contexts, exact confirmation, replay/altered replay, expiry, duplicate delivery, token rotation, rate/body/concurrency/timeout limits, outbound failure/retry, prompt injection, emergency-revoke failure, and unsafe secret grammar.
- Independent schema/fixture validation remains 6 schemas, 6 positive fixtures, and 1 expected-negative fixture.
- Module syntax, local Markdown links, JSON parsing, credential/private-key signatures, sensitive-artifact scan, and standalone-boundary inspection pass.

## Security and privacy closure

- Webhook handling requires HTTPS context, exact JSON content type, a secret route, and timing-safe Telegram secret-header verification before parsing or tool access.
- Only one numeric user ID and one private chat ID are accepted. Groups, channels, edited/forwarded/automatic-forward messages, and all attachments are rejected.
- Exact body digest is bound to each update ID. In-flight duplicates share one execution; delivered duplicates do not resend; failed delivery retries the cached reply without another Finance OS call. Altered update-ID reuse conflicts.
- MCP source event IDs derive from Telegram update IDs, so domain idempotency remains authoritative after adapter cache loss.
- Confirmation HMAC binds hashed actor/chat, server proposal ID, exact mutation hash, and expiry. Pause, rotation, disconnect, and emergency revoke invalidate pending confirmations.
- Body, text, reply, rate, concurrency, replay-map, confirmation, network, and MCP limits are independent and bounded.
- Channel audit stores pseudonymous actor identifiers and action/outcome only. Tests prove it does not contain raw identities, messages, commands, or financial amounts.
- Replies contain only the bounded review/receipt fields needed for the requested command and warn that Telegram retains chat outside Finance OS control.

## Lifecycle closure

Connect, verify, verify-before-activate rotation, pause/resume, disconnect, and emergency revoke are executable through injected secret-store/network interfaces. Disconnect and revoke never delete the Finance OS store. Failed external revoke leaves the adapter paused, marks revocation pending, blocks resume, and retains the secret only for controlled retry.

## Adversarial review and repairs

The post-implementation review found three hardening gaps and repaired all before this report:

1. Webhook and route secrets originally had only a length check. They now require Telegram/header and URL-path-safe characters, with a regression test.
2. A duplicate arriving while the first delivery was in flight could inherit a failed delivery without retrying. It now observes cached delivery state and performs one retry without repeating the Finance OS call.
3. The generic audit-sink path could generate a colliding event ID when several same-action events shared a timestamp. Audit events now use cryptographically random UUIDs.

The review also confirmed that network uncertainty after an entered MCP atomic commit is handled only by replaying the same update/source ID; the adapter never invents success or a fresh mutation identity.

## Residual boundaries and blockers

1. Gate pass does not authorize a live Telegram connection. Host/provider, DNS/certificate, reverse-proxy implementation, production secret-store/responder, egress policy, monitoring retention, and incident ownership remain deployment decisions requiring review and explicit approval.
2. Telegram retains messages outside Finance OS control. A live pilot must disclose this and begin with synthetic financial records.
3. In-memory pending/replay state is lost on restart. Confirmation fails closed; stable MCP idempotency prevents duplicate accepted mutations.
4. Real financial data still requires the separate limited-pilot disclosure, backup choice, and fresh explicit approval.
5. Phase 6 is not started or authorized.
