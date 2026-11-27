# Phase 6 Local Dashboard and Automation

`runtime/src/phase6.mjs` implements the Phase 6 gate as composable local-only controls. It is not a public web application and contains no live integration. Gate tests use synthetic data, synthetic feed functions, an in-memory scheduler state, and an offline notification responder.

## Components

- `createApplicationClient` exposes exactly four existing use cases: overview, account page, proposal, and commit. It accepts a tool caller and exposes no raw request, datastore, file, key, audit, import, export, or encryption operation.
- `LocalSessionAuthority` and `createDashboardGateway` provide loopback host/origin enforcement, scrypt password verification, signed short-lived sessions, idle expiry, bounded session count, route scopes, CSRF enforcement, strict input validation, exact commit confirmation, and privacy-safe responses.
- `BoundedFeedClient` validates bounded JSON from an injected synthetic fetcher. It retries timeouts, updates cache only after complete validation, and returns fresh/stale/missing plus `observed_at`, provenance, and observed/estimated/converted labels.
- `LeastPrivilegeScheduler` restricts configured capabilities to the task's declared allowlist, prevents overlap, derives deterministic run/source-event IDs, returns replay receipts, supports pause/disable, and audits configuration hashes without configuration contents.
- `MinimalNotifier` is off by default, requires opt-in plus an event-code allowlist, enforces quiet hours in `Asia/Bangkok`, deduplicates delivery, and sends only code, severity, and occurrence time through the injected responder.

## Zero-code local operations

An approved agent performs these actions; the user does not edit source, configuration, or encrypted files:

1. **Enable for a synthetic session:** verify the full gate, confirm that the listener wrapper is loopback-only, create a new local dashboard password and separate random session-signing secret without placing either in chat or the repository, and start with schedules and notifications disabled.
2. **Sign in:** open only the loopback address shown by the approved wrapper. A successful sign-in creates a short-lived HttpOnly/SameSite session and a per-session CSRF token. Close the session or sign out when finished.
3. **Review data:** confirm every price/rate view shows its fresh/stale/missing state, observation time, synthetic provenance, and estimated/converted status. Missing or stale data is a warning, never a recorded fact.
4. **Make a change:** review the application proposal and type the exact displayed `CONFIRM <hash>` value. The dashboard cannot weaken the application boundary's independent proposal, expiry, owner, scope, idempotency, or audit checks.
5. **Enable a schedule:** approve only the named task and minimum listed capabilities. Choose enabled or paused explicitly. Reusing a scheduled time reuses its deterministic identity and must not create a second mutation.
6. **Enable notifications:** opt in explicitly, approve a small event-code allowlist, and review quiet hours. Default content contains no balances, amounts, account labels, transaction text, or feed values.
7. **Pause or disable:** pause schedules before maintenance; disable notifications independently; sign out or revoke all sessions to stop dashboard access. These actions do not delete the encrypted store.
8. **Recover:** on feed outage, use the classified stale cache only for display or wait for a fresh observation. On task/responder failure, preserve the minimal error code and retry only with the same source identity. On suspected compromise, follow the incident sequence in [`dashboard-automation-threat-model.md`](dashboard-automation-threat-model.md).

## Live-operation blockers

The gate supplies interfaces and synthetic evidence, not a production listener, credential store, durable scheduler-state adapter, feed provider, or notification transport. Selecting or connecting any of those, using real financial data, or making the dashboard reachable beyond loopback requires a separate threat/deployment review, plain-language disclosure, and fresh explicit approval.
