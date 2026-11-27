---
name: finance-os
description: Design and evolve the private Finance OS agent for personal-finance records, calculations, imports, reports, security, or channel adapters. Use for Finance OS work; not for regulated financial advice or unrelated bookkeeping systems.
---

# Finance OS

Build a zero-code-for-the-user personal finance system whose domain core is independent of chat channels and storage formats.

## Current phase

Phase 6 adds local-only dashboard, synthetic feed, least-privilege scheduling, and offline notification interfaces over the same narrow application boundary. Phases 2–6 are gate-passed with synthetic records and injected substitutes only. Live ChatGPT, Telegram, feed, or notification connections still require separate consent and deployment review. Continue using synthetic records until the limited-pilot disclosure and fresh explicit approval. Do not request secrets, contact external services during tests, or expose the service publicly.

## Defaults and invariants

- Use THB as the base currency and Asia/Bangkok for user-facing time unless the user changes a preference.
- Store money as integer minor units with an ISO 4217 currency code.
- Preserve source currency and exchange-rate provenance.
- Cover income, expenses, accounts, linked transfers, investments, liabilities, budgets, goals, net-worth snapshots, and preferences.
- Validate before mutation, use stable IDs and idempotency keys, and produce an audit event for every accepted mutation.
- Do not expose secrets or sensitive financial values in logs, errors, or audit metadata.

## Route by task

- For components, boundaries, or future integrations, read [`references/architecture.md`](references/architecture.md).
- Before any persistence, encryption, key, backup, export, or recovery work, read [`references/security.md`](references/security.md).
- For entity semantics, calculations, identifiers, transfers, or currencies, read [`references/data-model.md`](references/data-model.md) and the relevant file in [`schemas/`](schemas/).
- For memory capture, retrieval, retention, or deletion, read [`memory/CONTRACT.md`](memory/CONTRACT.md) and validate against [`memory/memory-record.schema.json`](memory/memory-record.schema.json).
- For sequencing or scope decisions, read [`CHECKLIST.md`](CHECKLIST.md) for current evidence and [`references/roadmap.md`](references/roadmap.md) for phase intent.
- For the supported runtime, lifecycle commands, dependency boundary, and current limitations, read [`references/runtime-phase2.md`](references/runtime-phase2.md).
- For Phase 3 import/export, MCP hosting, authentication, limits, and gate evidence, read [`references/runtime-phase3.md`](references/runtime-phase3.md) and [`references/phase3-gate-report.md`](references/phase3-gate-report.md).
- For the packaged ChatGPT skill/MCP workflow, local connection operations, evaluation coverage, and external connection boundary, read [`references/runtime-phase4.md`](references/runtime-phase4.md) and [`references/phase4-gate-report.md`](references/phase4-gate-report.md).
- For Telegram hosting, authentication, allowlisting, replay/confirmation controls, lifecycle, and gate evidence, read [`references/runtime-phase5.md`](references/runtime-phase5.md), [`references/telegram-threat-model.md`](references/telegram-threat-model.md), and [`references/phase5-gate-report.md`](references/phase5-gate-report.md).
- For the local dashboard, synthetic feeds, scheduler, notifications, incident handling, and gate evidence, read [`references/runtime-phase6.md`](references/runtime-phase6.md), [`references/dashboard-automation-threat-model.md`](references/dashboard-automation-threat-model.md), and [`references/phase6-gate-report.md`](references/phase6-gate-report.md).

## Interaction behavior

For reads, return the minimum relevant result and distinguish recorded facts from estimates. For writes, show a normalized proposal and require explicit confirmation immediately before mutation. Never guess unresolved fields. After acceptance, return a concise receipt with stable IDs, status, store version, timestamp, and balance effects. A duplicate idempotency key returns the original receipt without another write.

Channel adapters may authenticate, normalize, confirm, and render requests. Keep domain rules, storage access, credentials, and private memory out of channel code.

Finance OS records and organizes information; it does not guarantee financial outcomes or substitute for a licensed tax, legal, or investment professional.
