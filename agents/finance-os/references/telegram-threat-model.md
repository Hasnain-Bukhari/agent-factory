# Telegram Network Threat Model and Hosting Decision

## Decision

Phase 5 selects a **webhook-only adapter behind a dedicated TLS-terminating reverse proxy**. The public edge accepts only the Telegram webhook route and forwards the untouched raw body plus verified HTTPS context to the adapter. The adapter itself is transport-host agnostic and has no listener, filesystem, storage, key-store, or domain imports. It calls the existing authenticated loopback MCP boundary and an injected outbound Telegram delivery interface.

Long polling was rejected for this phase because it expands persistent outbound connection and token-handling behavior, complicates replay/offset recovery, and does not match the requested webhook authenticity controls. Direct public exposure of the Finance OS MCP service is prohibited. A live hosting provider, DNS name, certificate, reverse-proxy configuration, egress policy, and secret-store implementation require a separate deployment review and explicit approval; the Phase 5 gate contacts no Telegram endpoint.

## Trust boundaries and assets

Protected assets are the bot token, webhook secret, opaque route secret, confirmation HMAC key, MCP credential, allowlisted identity, pending proposal bindings, financial receipts, and pseudonymous channel audit continuity. The Telegram network, webhook body, message text, update identifiers, forwarding metadata, attachments, reverse-proxy headers, outbound API responses, and redeliveries are untrusted.

The bot token, webhook secret, route secret, and confirmation key are separate versioned secret-store entries. They are not accepted through chat, files, command arguments, logs, Finance OS memory, or the financial store. The MCP bearer is separately scoped to the Telegram adapter. The synthetic secret store is test-only and forbidden for a live connection.

## Threat/control matrix

| Threat | Control | Failure/recovery behavior |
| --- | --- | --- |
| Forged webhook | Require verified HTTPS context, exact secret route, and timing-safe `X-Telegram-Bot-Api-Secret-Token` comparison | Reject before parsing or MCP access; rotate webhook/route secrets on suspected compromise |
| Wrong user/chat or group context | Exact numeric user and private-chat allowlist; reject groups, channels, forwarded, automatic-forward, and edited updates | Privacy-minimal rejection; pause/revoke after repeated suspected compromise |
| Replay or duplicate delivery | Bind one digest to each update ID, deduplicate in-flight work, cache terminal delivery state, and use `telegram:<update_id>` as the MCP source event ID | Exact duplicate returns the prior outcome; altered reuse conflicts; domain idempotency prevents a second mutation after cache loss |
| Confirmation theft/rebinding | HMAC binds actor hash, chat hash, server proposal ID, exact mutation hash, and earliest expiry | Wrong actor/chat/code, stale proposal, or expiry cannot commit; rotation/pause/revoke clears pending confirmations |
| Prompt injection | Only exact bounded slash-command grammar may select tools; message and stored names remain data | Unsupported prose calls no tool; imported/tool content cannot confirm |
| Oversized or malicious content | Raw-body, text, reply, attachment, and supported-context limits before tool dispatch | Reject all attachments in v1; no file download or parsing |
| Flood/concurrency exhaustion | Per-actor minute bucket, global concurrency cap, bounded replay/pending maps, and network/tool timeouts | Return retryable bounded status without broader scope or raw errors |
| Network failure after processing | Cache processed reply before delivery; retry delivery without repeating the Finance OS call | If MCP outcome is uncertain, retry the same update/source ID; server proposal/idempotency rules return the original receipt where accepted |
| Token/secret compromise | Separate secret versions, verify-before-activate rotation, local pause, disconnect, and emergency webhook revocation | Local channel disables immediately; failed external revoke remains visibly pending and retains the token only for a controlled retry |
| Privacy leakage | Bounded replies, no raw-message audit, pseudonymous actor ID, no message/amount/identity in channel audit | Warn that Telegram retains chat outside Finance OS control; disclose only command-required review/receipt fields |
| Reverse-proxy spoofing | Edge must overwrite, not append, forwarded TLS/client headers and expose only the webhook path | Treat ambiguous proxy configuration as a deployment blocker |

## Residual risks

- Telegram and its clients retain message content outside Finance OS control. Mutation proposals necessarily reveal the exact amount/object needed for confirmation.
- A compromised Telegram account plus compromised webhook secret can impersonate the allowlisted actor; immediate pause and token/webhook rotation are required.
- In-memory replay and pending-confirmation state is lost on adapter restart. This fails closed for confirmations; stable update-derived MCP idempotency prevents duplicate financial mutation.
- A transport failure after the MCP server enters an atomic commit can make the receipt temporarily uncertain. Retrying the same delivery is required; the adapter must not invent success or a new source event ID.
- Source-IP filtering may be added at a reviewed edge but is not the primary authenticator and must not replace the secret header and allowlist.

## Live deployment blockers

No live Telegram deployment is authorized by this record. Before connection, select and review the host, TLS edge, DNS/certificate lifecycle, secret-store adapter, egress restriction, monitoring retention, and incident contact; create the token only through Telegram's own trusted account flow without copying it into chat; provision it directly into the approved secret store; and rerun the full gate against the deployed edge with synthetic financial data.
