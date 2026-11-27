# Finance OS Open Issues

This file is the persistent handoff and blocker tracker for sequential completion of Phases 2–6. Update it whenever a blocker is opened, resolved, or reclassified. Do not mark an issue resolved without executable evidence.

Last reconciled: 2026-11-27 (Asia/Bangkok).

## Current phase

Phase 6 optional gate closure is complete. The local dashboard gateway, bounded feed client, least-privilege scheduler, and privacy-minimal notifier are executable through injected interfaces using synthetic data and offline doubles only. No public listener, feed provider, notification service, credential, or real financial data was used. Real data and live external connections still require separate disclosure, deployment review, and explicit approval.

## Phase 2 blockers

- [x] Repair the interrupted runtime/test/storage.test.mjs syntax failure and restore a green full test run.
- [x] Complete investment lots, positions, cost basis, splits, dividends, fees, and timestamped valuation semantics.
- [x] Complete budget-period and account-filter eligible-spend semantics.
- [x] Add probable-content duplicate review without silently rejecting legitimate repeated transactions.
- [x] Prove high-volume nonce uniqueness under the supported key lifecycle.
- [x] Append canonical audit outcomes for backup, restore, migration, rotation, and integrity failures.
- [x] Enforce safe backup retention without deleting the sole known-good generation.
- [x] Implement persistent staged migrations with pre-backup, activation, rollback, and injected-failure tests.
- [x] Implement crash-interrupted key rotation recovery and old-key retirement policy.
- [x] Run exhaustive Draft 2020-12 validation against canonical schemas.
- [x] Harden restore-target binding and stale-lock recovery.
- [x] Run temporary synthetic macOS Keychain lifecycle and cleanup.
- [x] Run host-process SIGKILL/restart recovery drill on the supported local filesystem.
- [x] Update references/phase2-gate-report.md and CHECKLIST.md from fresh evidence.

## Phase 3 blockers

- [x] Phase 2 prerequisite passed; Phase 3 synthetic implementation is authorized.
- [x] Implement executable dry-run plus atomic and explicitly reviewed partial CSV/JSON import.
- [x] Complete safe plaintext/encrypted export, including killed-process recovery of a staged plaintext sibling temporary file.
- [x] Implement and gate a narrow authenticated MCP/tool surface with read/propose/confirm separation.
- [x] Close independent review findings for late timeout mutation, cross-owner store access, export parent swaps, and multiple preferences ambiguity with regression tests.

## Phase 4 blockers

- [x] Phase 3 MCP prerequisite passed; Phase 4 synthetic implementation was authorized.
- [x] Connect the Finance OS skill to the authenticated tool surface.
- [x] Validate proposal, ambiguity, confirmation, receipt, privacy, replay, and prompt-injection journeys.
- [x] Record the Phase 4 gate in `references/phase4-gate-report.md` from fresh executable evidence.

## Phase 5 blockers

- [x] Phase 4 interaction gate passed; Phase 5 synthetic implementation was authorized.
- [x] Implement the Telegram adapter, authentication/allowlist, replay protection, short-lived confirmations, rate limits, and emergency revoke.
- [x] Use only synthetic credentials, synthetic records, injected network substitutes, and loopback MCP for the Phase 5 gate.
- [x] Complete adversarial review and repair unsafe webhook/route secret grammar, concurrent duplicate-delivery recovery, and collision-resistant audit event IDs.
- [ ] Before any live connection, select and review the host, TLS edge, DNS/certificate lifecycle, production secret-store adapter, egress policy, monitoring retention, and incident contact; then obtain explicit approval.

## Phase 6 blockers

- [x] Encrypted core and channel gates passed; Phase 6 synthetic implementation was authorized.
- [x] Implement the optional local dashboard, feeds, schedules, and privacy-minimal notifications through the same application boundary.
- [x] Validate authorization, CSRF, exact confirmation, stale/missing/estimated/converted labels, feed poisoning/limits/outage, scheduler overlap/replay/failure, notification privacy/quiet hours, prompt injection, and failure isolation.
- [x] Complete an independent adversarial pass and repair missing login throttling/browser headers, separator-ambiguous scheduler names, and cross-file test contention before gate closure.
- [ ] Before live use, select and review a loopback HTTP wrapper and credential store, durable scheduler state, feed provider/egress policy, notification transport/retention/revocation, and incident owner; then obtain explicit approval.

## Global release blockers

- [ ] All applicable CHECKLIST.md items have executable evidence.
- [ ] No real data, live credentials, or external channel mutation is used before its gate and explicit approval.
- [ ] Full test, recovery, dependency, schema, privacy, and credential scans pass.
- [ ] Repository changes are reviewed; no commit is created unless the user asks.
