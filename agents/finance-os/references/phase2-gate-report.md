# Phase 2 Gate Report — 2026-11-26

## Result

**Passed on the supported host; no unresolved Phase 2 security blocker.** The local encrypted core is eligible for a separately disclosed and explicitly approved limited local pilot. This report does not authorize real data, external accounts, MCP, Telegram, a dashboard, or any Phase 3 capability. No real financial data, live credential, external channel, or production key was used.

## Environment and dependency evidence

- Host: Apple-silicon macOS 15 kernel family (`darwin-arm64`, Darwin 24.6.0), local filesystem.
- Runtime: Node.js 22.16.0; OpenSSL 3.0.16.
- Validator: lockfile-pinned Ajv 8.20.0 with four pinned transitive packages; all canonical schemas declare Draft 2020-12.
- `npm audit --audit-level=low`: 0 vulnerabilities, using the live registry advisory endpoint.
- `npm ls --all --omit=optional`: the installed dependency tree matches the lockfile boundary.
- Evidence state: reviewed working tree; no commit was created.

## Automated and host-specific results

- Full host suite with the temporary Keychain test enabled: 47 passed, 0 failed, 0 skipped.
- Draft 2020-12: all six canonical schemas compiled under locked Ajv; six positive fixtures passed; representative structural violations for every schema were rejected. The expected duplicate-ID fixture remains schema-valid and is rejected by the semantic validator, as designed.
- Independent semantic fixture check: 6 schemas, 6 positive fixtures, and 1 expected-negative semantic fixture passed.
- Runtime parsing, dependency-tree inspection, lifecycle drill, local Markdown-link check, and credential/private-key signature scan passed.
- Lifecycle drill: install, doctor, synthetic initialize, start/recover, health, stop, current-version upgrade, and confirmed synthetic uninstall passed without leaving test data.
- Temporary Keychain drill: a uniquely named synthetic generic-password entry was created, read, deleted in `finally`, and confirmed unavailable afterward.

## Domain closure evidence

- Investments: immutable buy/sell/dividend/fee/split/valuation events derive FIFO lots, remaining cost basis, realized gain, position quantity, accumulated dividends and fees, timestamped market value, and unrealized gain. Quantity precision is bounded to eight decimal places by command validation and schema.
- Budgets: weekly, monthly, quarterly, yearly, and custom periods use the configured time zone; category and account filters, currency, posted/pending state, reversals, and corrected expenses are covered at a Bangkok month boundary.
- Duplicate review: matching account, signed amount, currency, category, and a bounded time window produces candidate IDs in the proposal. A distinct idempotency key remains confirmable and is never silently discarded.

## Persistence, recovery, and audit evidence

- Nonces: 10,000 generated envelopes produced 20,000 distinct data and DEK-wrapping nonces under the supported lifecycle, with no reuse.
- Fault injection: before temp creation, after temp creation, after write, after file sync, before rename, after rename, and after directory sync all retained at least one authenticated complete generation.
- Concurrency/locking: simultaneous writers produced one winner and one stale loser; a live lock was never stolen; a dead stale lock was quarantined and recovered.
- Host-process crash: an operating-system `SIGKILL` stopped a writer after its temporary write on the supported local filesystem. A fresh startup recovered the dead lock, preserved the valid active generation and audit chain, and classified the orphaned temporary file.
- Backup retention: retention runs only after authenticating the new generation, preserves invalid artifacts for review, refuses a retain count below one, and never removes the sole known-good authenticated generation.
- Restore: wrong-store, corrupted, changed-after-review, wrong-target, and same-path symlink-target-swap cases fail closed. Confirmation binds the store identity, version, staged envelope hash, requested target, and canonical target.
- Migration: explicit `0.9.0` to `1.0.0` migration creates and verifies a pre-migration encrypted backup, stages and verifies the new generation, retains rollback, rejects future versions, and recovers injected interruption after pre-backup, staging, and activation.
- Rotation: pre-rotation backup, staged new-key generation, audit continuity, and interruption after pre-backup, staging, and activation all recover deterministically. Old-key retirement rewraps and verifies every retained generation in the data directory and any explicitly supplied backup roots before deleting the old key; interruption before deletion leaves the old key available and retryable.
- Audit: accepted backup, restore, migration, and rotation operations append canonical store events. Accepted/rejected operational outcomes and integrity failures use a separate authenticated, minimal HMAC chain so a corrupt active store is never rewritten merely to record its own failure.
- Tamper checks: ciphertext/tag, nonce, AAD, store identity, schema/envelope version, key version, wrapped DEK, wrong key, audit edit/deletion/insertion/reordering, and wrong audit key fail closed.
- Disaster recovery: a separately located encrypted synthetic generation restored into a new restrictive location, required exact target-bound confirmation, retained rollback, and reproduced the expected store identity, domain counts, versions, and audit continuity.

## Residual boundaries after gate closure

These are explicit operating boundaries, not unresolved Phase 2 blockers:

1. A limited real-data pilot requires a separate plain-language disclosure, a user-selected separately located backup destination, and fresh explicit user approval. Until then the runtime remains synthetic-only.
2. Old keys must not be retired until every retained external backup root is included in the retirement scan or has expired under the reviewed retention policy.
3. The recovery drill used an actual OS-level process `SIGKILL` and fresh runtime startup on the supported host; it did not power-cycle the user's whole machine.
4. Network filesystems, non-Apple-silicon hosts, non-macOS key stores, MCP, imports/exports, ChatGPT channel tooling, Telegram, dashboards, feeds, and automation remain unsupported or Phase 3+ work.
