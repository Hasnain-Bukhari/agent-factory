# Finance OS Roadmap

Detailed work items, dependencies, security gates, and current evidence are tracked in [`../CHECKLIST.md`](../CHECKLIST.md). Operational contracts are in [`operations.md`](operations.md), [`import-export.md`](import-export.md), [`testing.md`](testing.md), and [`threat-recovery.md`](threat-recovery.md).

## Phase 1 — Foundation (complete)

Deliver the standalone agent contract: root factory conventions, Finance OS instructions and skill, memory namespace, architecture, security design, domain semantics, and versioned JSON Schemas. Validate with synthetic examples only.

Exit criteria:

- required domains are represented;
- THB/Asia-Bangkok defaults and multicurrency semantics are explicit;
- encryption, key separation, atomic writes, locking, deduplication, audit, backup, import, and export behaviors are designed;
- no secrets or real finance data exist in the repository;
- no dashboard or Telegram integration exists.

Phase 1 completion means the design contract is present. It does not authorize real data or imply that encryption, backups, imports, or integrations are executable.

## Phase 2 — Local encrypted core (implemented, gate passed)

The standalone Node.js core, typed domain workflow, authenticated encrypted storage, idempotency/audit, backup retention, staged restore, migration, key rotation/retirement, and crash recovery are executable and evidenced with synthetic data. The passing evidence and operating boundaries are recorded in [`phase2-gate-report.md`](phase2-gate-report.md). Phase 3 is also gate-passed, and real data still requires a separate limited-pilot disclosure and fresh explicit approval.

## Phase 3 — Import/export and MCP surface (implemented, gate passed)

Bounded dry-run CSV/JSON mapping, formula-injection protection, reviewed commit, safe plaintext/recipient-key export with crash cleanup, and a narrow authenticated loopback MCP/tool interface are executable and evidenced. Use cases rather than raw file access are exposed. Continue using synthetic data until the user explicitly approves a secure local test with their own records.

## Phase 4 — ChatGPT experience (implemented, gate passed)

The portable secret-free plugin and synthetic ChatGPT-to-MCP harness validate proposal/confirmation/receipt interactions, bounded reports, permissions, injection resistance, and privacy-minimal retention. A live external ChatGPT connection remains separately gated.

## Phase 5 — Telegram adapter (implemented, gate passed)

The standalone webhook-only adapter verifies HTTPS, route and secret-header authenticity, one private user/chat allowlist, replay/idempotency, bounded commands, exact short-lived confirmation, rate/concurrency/timeout limits, pseudonymous audit events, secret rotation, pause/disconnect, and emergency revoke. The gate used injected synthetic secrets and network substitutes only; no Telegram endpoint was contacted.

## Phase 6 — Optional dashboard and automation (implemented, gate passed)

The local-only gateway uses signed expiring sessions, route authorization, CSRF controls, strict input validation, and exact mutation confirmation over the narrow application boundary. Bounded injected synthetic feeds label provenance, age, estimates, and conversions. Least-privilege schedules prevent overlap and replay; opt-in offline notifications enforce minimal content and quiet hours. No live feed, responder, public listener, credential, or real data is connected.

## Deferred decisions

- whether a future version should move from encrypted snapshots to an encrypted embedded database;
- public MCP hosting and external user authentication beyond the gate-passed loopback-only bearer model;
- live Telegram hosting provider, DNS, certificate, and reverse-proxy implementation after the webhook-only self-hosted model selected for Phase 5 is explicitly approved;
- user-selected backup destination and retention.

Choose these in Phase 2 or later based on the actual host and deployment constraints, not by locking the foundation to speculative dependencies.
