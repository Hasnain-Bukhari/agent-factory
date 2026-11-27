# Phase 6 Dashboard and Automation Threat Model

## Scope and decision

Phase 6 is an optional **local-only, synthetic-data** client layer. It does not add a public site, live feed, external scheduler, or real notification transport. `runtime/src/phase6.mjs` accepts only an injected narrow application-tool caller, injected synthetic feed fetchers, an injected scheduler state interface, and an injected offline notification responder. It has no persistence, key-store, filesystem, HTTP-client, or notification-network import.

The dashboard gateway is deliberately transport-neutral for this gate. Any future HTTP wrapper must bind only to `127.0.0.1`, preserve the gateway's host/origin checks, cap headers and bodies before parsing, and add no routes that expose files, raw store access, keys, arbitrary queries, or configuration secrets. Public deployment is out of scope and prohibited.

## Assets and trust boundaries

Protected assets are the encrypted store, key material, application credentials, exact mutation proposals, session/CSRF secrets, schedule configuration, cached feed observations, and notification preferences. Untrusted inputs include browser requests, origins, cookies, CSRF headers, commands, feed bytes and timestamps, schedule triggers, task results, notification events, and any text that resembles an instruction.

The dashboard authenticates a local user, authorizes a small route, validates and bounds input, and calls only `finance_get_overview`, `finance_list_accounts`, `finance_propose_command`, or `finance_commit_proposal`. The existing MCP/application boundary remains authoritative for owner binding, scopes, schema validation, proposal expiry, idempotency, domain rules, audit, encryption, and persistence.

## Threats and controls

| Threat | Control | Gate evidence |
| --- | --- | --- |
| Remote or rebinding access | Exact loopback host and local HTTP origin checks; a future wrapper must bind only to `127.0.0.1` | Remote host and hostile-origin tests |
| Password guessing/session theft | Scrypt-derived password verifier, bounded login attempts, 192-bit random session IDs, HMAC-SHA-256 signed cookies, absolute and idle expiry, bounded session count, HttpOnly/SameSite=Strict cookie | Wrong password, rate-limit, tamper, expiry, logout tests |
| CSRF | Local origin required for every state change plus a 256-bit per-session CSRF token | Missing token and hostile-origin tests |
| Privilege escalation | Route-specific read/propose/commit scopes and a four-method application client | Unauthorized and boundary inspection tests |
| Confirmation bypass | Commit requires the exact case-sensitive string `CONFIRM <64-hex-confirmation-hash>`; application proposal checks remain independent | Empty, vague, wrong-hash, and wrong-case tests |
| Injection/confused deputy | Strict route/body keys, bounded typed values, and no execution of command or feed text | Prompt-injection and feed-poisoning tests |
| Sensitive errors/cache leaks | Stable bounded error codes, no exception text, `Cache-Control: no-store`, `nosniff`, and no-referrer headers | Privacy-safe error assertions |
| Feed poisoning/resource exhaustion | Byte, record, field, grammar, numeric-string, timestamp, future-skew, timeout, and retry limits; cache updates only after full validation | Poison, oversize, malformed, future, timeout tests |
| Stale values treated as facts | Every result carries `fresh`, `stale`, or `missing`, `observed_at`, synthetic provenance, and per-record `observed`, `estimated`, or `converted` label | Staleness/outage/label tests |
| Scheduler overlap/replay | Atomic claim interface, one active run per task, deterministic run/source-event ID, durable-state injection point, replay receipt | Overlap, replay, failure tests |
| Excess scheduler privilege | Each task declares allowed capabilities; configuration may select only a subset | Privilege rejection test |
| Notification disclosure | Default off, explicit opt-in and code allowlist, exact three-field event schema, code/severity/time-only delivery, quiet hours, dedupe | Privacy, quiet-hours, opt-in tests |
| Failure propagation | Feed outage returns classified cache state, task failure returns a minimal receipt, responder failure returns a minimal code; none can write storage directly | Failure-isolation tests |

## Residual risks and prohibited expansions

- A compromised unlocked local OS session can act as the user. Local authentication reduces accidental and browser-origin access; it does not defeat host compromise.
- The test scheduler state is in memory. A real local scheduler must provide an owner-only durable implementation with atomic claim/finish semantics. Deterministic source-event IDs still let the application boundary reject duplicate mutations after scheduler-state loss.
- Feed cache is non-canonical. It must never silently create ledger facts, overwrite historical source amounts, or be treated as a price/rate without its labels and observation time.
- Critical notification codes may bypass quiet hours by design; they still contain no financial values. A live responder requires a separate privacy, credential, delivery, retention, and revocation review.
- No live feed URL, notification service, public dashboard, credential, real financial record, or production schedule is authorized by this gate.

## Incident response

Pause dashboard mutations and schedules first. Revoke all dashboard sessions, disable notifications, preserve minimal audit/configuration hashes, and check application audit continuity. Treat unexpected feed content as untrusted evidence: quarantine the synthetic cache, do not import it, and restore only from canonical encrypted generations if integrity checks require recovery. Re-enable one component at a time after local authentication, boundary, cache, and idempotency checks pass.
