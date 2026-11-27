# Phase 6 Gate Report — 2026-11-27

## Result

**Passed for the optional local-only synthetic interfaces; no unresolved Phase 6 implementation blocker.** The dashboard gateway, bounded feed client, least-privilege scheduler, and privacy-minimal notifier satisfy the Phase 6 acceptance criteria without weakening the Phase 2–5 controls. No real financial data, credential, public listener, live feed, external notification, or external service was used.

This result does not authorize a production dashboard or automation deployment. A live wrapper, credential store, durable scheduler state, provider/egress policy, notification transport, monitoring/retention, incident ownership, real data, and any non-loopback exposure remain separately gated.

## Environment and dependency evidence

- Host/runtime: Apple-silicon macOS (`darwin-arm64`), Node.js 22; runtime version 0.6.0.
- Phase 6 adds no package dependency. Locked direct dependencies remain Ajv 8.20.0, `@modelcontextprotocol/sdk` 1.32.2, and Zod 4.6.7.
- `npm audit --audit-level=low`: 0 vulnerabilities.
- `npm ls --all --omit=optional`: required installed dependency tree matches the lockfile; the SDK's unused platform-specific `@cfworker/json-schema` remains the only unmet optional dependency.

## Boundary and control decision

`runtime/src/phase6.mjs` imports only Node cryptography and the local canonical hash helper. It has no storage, key-provider, filesystem, HTTP-client, domain, import/export, or notification-network dependency. The dashboard receives a four-method application client that maps only to the existing overview, account-page, proposal, and commit tools. Feed retrieval and notification delivery are injected; the gate uses only synthetic fetch functions and an offline responder.

The dashboard contract requires loopback host and local-origin checks, a scrypt-derived local password verifier, bounded login attempts, signed random sessions with idle/absolute expiry, route authorization, per-session CSRF, strict body/query limits, privacy-safe errors, no-store and browser-hardening headers, and exact case-sensitive `CONFIRM <hash>` mutation confirmation. The application boundary independently retains owner, scope, proposal-expiry, schema, idempotency, audit, encryption, and persistence enforcement.

## Automated evidence

- Full deterministic Phase 2–6 regression/integration suite: **94 runnable tests passed, 0 failed**, with **1 optional macOS Keychain lifecycle test skipped**.
- Phase 6 contributes **13 passing adversarial tests** covering local authentication, login throttling, remote/hostile-origin rejection, session tamper/expiry/logout, authorization, CSRF, validation and body bounds, privacy-safe errors, exact-confirmation bypass attempts, prompt injection, feed poisoning/oversize/malformed/future/numeric/timeout/retry/staleness/outage behavior, observed/estimated/converted labels, scheduler least privilege/pause/disable/overlap/replay/failure identity, notification opt-in/allowlist/privacy/quiet hours/deduplication/failure isolation, and direct persistence/key/filesystem/network dependency exclusion.
- Canonical validation: **6 Draft 2020-12 schemas, 6 positive fixtures, and 1 expected-negative semantic fixture** passed.
- Module syntax check passed for every runtime source, test, and executable module.
- **18 JSON files** parsed successfully.
- All local Markdown links pass after this report is present.
- Credential/private-key signature scan: 0 matches.
- Sensitive runtime-artifact filename scan: 0 matches.
- `git diff --check`: passed.

## Feed, schedule, and notification behavior

- Feed bytes, record counts, keys, field grammars, exact integer strings, timestamps, and future skew are bounded. Invalid input never replaces a known-good cache. Timeouts retry with a bounded backoff; outage returns classified fresh/stale/missing state rather than inventing a value.
- Every feed result carries synthetic provenance and `observed_at`; every accepted record is explicitly labeled `observed`, `estimated`, or `converted`. A cache beyond the maximum stale age returns no records.
- Scheduler configuration may select only a subset of each task's declared capabilities. Enabled, paused, and disabled states are explicit. Atomic claims prevent overlap; scheduled time derives a deterministic run and application source-event ID; completed and failed runs replay their original minimal receipt.
- Notifications are disabled until explicit opt-in, require an event-code allowlist, enforce Bangkok quiet hours, deduplicate, and pass only code, severity, and occurrence time to the responder. Amounts, balances, names, transaction text, and arbitrary fields are rejected by schema.
- Schedule and notification configuration audits contain a random event ID, action, time, subject where applicable, and a configuration hash—not configuration contents or financial values.

## Independent adversarial review and repairs

The post-implementation adversarial pass found and repaired three issues before gate closure:

1. Password verification used scrypt but did not throttle repeated failures, and response headers lacked a complete browser-hardening set. Login attempts are now bounded per window; responses add CSP, frame denial, permissions policy, no-referrer, no-store, and `nosniff`, with regression coverage.
2. Scheduler state originally derived the active task name by splitting a composite key. Separator-bearing names could collide in overlap bookkeeping. Task names now use a strict separator-free grammar, and state claim/finish receives the validated name explicitly.
3. The initial parallel cross-file regression run produced one timing-sensitive Phase 5 Telegram delivery assertion while its isolated suite passed. Gate scripts now isolate test files with Node's test concurrency set to one; concurrency, lock, overlap, replay, and duplicate-delivery behaviors remain explicitly tested inside their owning suites. The final full run passed 94/94 runnable tests.

The review also confirmed that feed text is never executed, invalid feeds do not evict valid cache, scheduler failures cannot reach storage except through the idempotent application boundary, and notification failure cannot reveal values or corrupt other components.

## Operations and residual boundaries

The threat model and incident procedure are in [`dashboard-automation-threat-model.md`](dashboard-automation-threat-model.md). Agent-driven, zero-code local enable/sign-in/review/confirm/schedule/notify/pause/recovery guidance is in [`runtime-phase6.md`](runtime-phase6.md) and [`operations.md`](operations.md).

Residual deployment blockers are intentionally open in [`../OPEN_ISSUES.md`](../OPEN_ISSUES.md): select and review a loopback-only listener wrapper and credential store, owner-only durable scheduler state with atomic claims, feed provider and egress restrictions, notification transport and retention/revocation, monitoring, and incident ownership. Any real-data pilot still requires the separate plain-language disclosure, backup choice, and fresh explicit approval.
