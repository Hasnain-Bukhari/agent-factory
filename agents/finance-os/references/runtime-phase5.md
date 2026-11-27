# Phase 5 Telegram Adapter

`runtime/src/telegram.mjs` implements a standalone channel adapter over the authenticated Finance OS MCP boundary. It imports no storage, key-provider, import/export, or domain module. Dependencies are injected: an MCP client, a versioned secret store, an outbound Telegram responder, a minimal audit sink, and a clock.

## Supported v1 interaction

The adapter accepts only one configured Telegram user in one private chat. It rejects groups, channels, edited or forwarded messages, automatic forwards, and every attachment type. Supported bounded commands are `/overview`, `/accounts`, `/expense <amount> <currency> <account-id>`, `/create-account <currency> <name>`, `/confirm <code>`, and `/cancel`. Other prose is inert and calls no Finance OS tool.

Reads call the same bounded MCP tools as ChatGPT. Writes call `finance_propose_command` with `telegram:<update_id>` as the stable source event ID. The adapter then creates a 64-hex-character confirmation code using a secret HMAC over hashed actor/chat identifiers, the server proposal ID, exact confirmation hash, and the earliest of the server and channel expiries. Only an exact `/confirm <code>` message from that actor/chat can call `finance_commit_proposal`.

Default limits are a 16 KiB raw body, 4 KiB text, 1 KiB reply, 20 requests per minute, two concurrent updates, two-second network operations, a two-minute channel confirmation, and 512 replay entries. The MCP server retains its independent body, output, proposal, rate, and execution limits. A processed reply is cached before outbound delivery so a delivery retry does not repeat a Finance OS call.

Channel audit events contain event/time, channel, action, outcome, and a keyed pseudonymous actor identifier. They exclude update IDs, raw user/chat IDs, message text, commands, amounts, account names, replies, tokens, routes, proposal hashes, and store payloads. Financial mutations continue to use the canonical domain audit through MCP.

## Lifecycle workflows

- **Connect:** validate one numeric user/chat allowlist, an HTTPS public origin, and references to separate token, webhook, route, and confirmation secrets. Resolve secrets only through the injected secret store; clear prior transient state.
- **Verify:** call the injected credential verifier with a bounded timeout and return only verified/error status.
- **Rotate:** resolve and verify all new secret versions before activation; atomically switch references, invalidate pending confirmations and replay cache, then delete superseded secret versions.
- **Pause/resume:** pause rejects new webhook work and clears pending confirmations without deleting the financial store. Resume is forbidden while external revocation is pending.
- **Disconnect:** disable the channel, clear transient state, and delete channel-secret versions. It does not delete or alter Finance OS data.
- **Emergency revoke:** pause locally first, clear pending state, request webhook deletion with pending-update drop, then delete secrets on success. If the external call fails, remain paused, mark revocation pending, and retain the token only for controlled retry.

The repository's `SyntheticTelegramSecretStore` and fake responder are test-only. A live secret-store/responder/HTTP-edge implementation is deliberately not selected or connected by this gate. An approved agent performs unavoidable account and deployment steps; the user never edits code or configuration and never sends a token through chat.

## Network and hosting boundary

The selected hosting shape and threats are recorded in [`telegram-threat-model.md`](telegram-threat-model.md). The adapter requires either direct TLS context or an edge-supplied `x-forwarded-proto: https`, exact `application/json`, the configured opaque route, and Telegram's secret-token header. A live reverse proxy must overwrite forwarded headers and pass the raw body unchanged. The Finance OS MCP endpoint remains loopback-only and is never exposed publicly.
