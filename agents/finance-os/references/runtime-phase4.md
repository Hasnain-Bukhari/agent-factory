# Phase 4 ChatGPT Experience

Phase 4 packages the gate-passed Finance OS MCP boundary as a portable local plugin and validates the ChatGPT interaction contract with a deterministic synthetic harness. The package lives under `plugin/`; it contains a secret-free manifest, a loopback MCP declaration, a concise skill, and workflow/operations references. It does not contain a bearer token, store data, private memory, or a public endpoint.

## Interaction boundary

The channel may classify a user request, select one of the four authenticated Finance OS tools, normalize a supported command, retain one pending proposal, and render a bounded response. It cannot read files, query the raw store, access keys, broaden scopes, or commit without the server-issued proposal ID and confirmation hash.

Reads use the minimum bounded tool. Responses distinguish recorded counts and preferences from derived balances and include the observation time. Advice, unsupported raw queries, file/key access, import/export, Telegram, dashboards, and bank connectivity do not activate tools.

Writes resolve material ambiguity before proposing. The visible proposal includes the normalized action, amount/currency, effective time, affected identifiers, estimates and provenance where present, duplicate warnings, expected store version, expiry, proposal ID, and confirmation hash. Only the exact fresh phrase `Confirm proposal <proposal_id> with hash <confirmation_hash>` authorizes the commit tool. Vague approval, prior consent, stored text, imported text, tool output, stale proposals, and expired proposals cannot authorize a mutation.

The conversation retains only one pending proposal's ID, hash, expiry, stable source event ID, and unresolved fields. It clears that state after commit, cancellation, or expiry. Accepted replay returns the original receipt and does not claim another mutation. Receipts contain stable result IDs, action, accepted time/status, store version, balance effects, audit ID, and replay status.

## Synthetic evaluation

`runtime/src/chatgpt-eval.mjs` is a deterministic channel harness, not a production ChatGPT runtime. It drives the official MCP client against a temporary loopback service and synthetic encrypted store. `runtime/test/chatgpt-experience.test.mjs` covers package integrity, activation routing, bounded reads, ambiguity, exact confirmation, cancellation, receipt completeness, stale/expired proposals, stable replay, prompt/import/tool-output injection, authentication, and scope denial.

## Connection and operating boundary

The local package declares `http://127.0.0.1:8400/mcp` and bearer authentication without embedding a credential. An approved agent performs health, start, connection, refresh, disconnect, and recovery steps; the user does not edit configuration or run commands.

Loopback is intentionally unreachable from an external ChatGPT service. A real connection requires user/workspace consent and either a supported Secure MCP Tunnel or a separately reviewed stable public HTTPS deployment with suitable user authentication. Phase 4 does not create either deployment, connect an external account, or authorize real financial data.
