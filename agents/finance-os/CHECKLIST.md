# Finance OS Completion Checklist

This is the delivery checklist for a complete, standalone Finance OS agent. It is both a status record and a set of release gates. An item is complete only when its acceptance evidence exists in this agent directory and the relevant automated checks pass.

## Status legend

- `[x]` — evidenced in the repository now.
- `[ ]` — not implemented or not yet evidenced.
- **Design only** — a contract exists, but no production behavior exists yet.
- **Gate** — all listed items must pass before the next stage may handle real data or connect an external channel.

## Current status snapshot

Snapshot date: 2026-11-27.

| Stage | Status | Repository evidence | Real-data status |
| --- | --- | --- | --- |
| Phase 1: foundation | **Design complete** | Instructions, skill, memory namespace, architecture, security, data semantics, roadmap, and JSON Schemas exist | Prohibited |
| Phase 2: local encrypted core | **Security gate passed** | Locked standalone runtime, complete Phase 2 domain core, AEAD persistence, audit/idempotency, recovery controls, and 47 passing host tests; see `references/phase2-gate-report.md` | Synthetic only until separate explicit limited-pilot approval |
| Phase 3: import/export and MCP | **Security gate passed** | Bounded portable import/export, crash-clean plaintext staging, and an authenticated loopback Streamable HTTP MCP server; see `references/phase3-gate-report.md` | Synthetic only; no external ChatGPT connection |
| Phase 4: ChatGPT experience | Not started | Skill behavior is described; no connected tool surface | Prohibited |
| Phase 5: Telegram | Not started | Adapter requirements are designed only | Prohibited |
| Phase 6: dashboard/automation | Deferred | No dashboard, scheduler, feed, or notification runtime | Prohibited |

The current repository is safe for synthetic design and implementation work. It is **not** ready to store personal finance records, accept credentials, expose an MCP server, or connect Telegram.

## Cross-cutting definition of done

A production-capable Finance OS is complete only when all of the following are checked:

- [ ] The user can install, initialize, use, back up, restore, upgrade, and uninstall through agent-driven workflows without writing code.
- [ ] THB and `Asia/Bangkok` defaults work, while multicurrency source amounts and rate provenance are preserved.
- [ ] Income, expenses, accounts, transfers, investments, liabilities, budgets, goals, net worth, and preferences work end to end.
- [ ] Every external input is authenticated where applicable, schema-validated, authorized, bounded, and treated as untrusted.
- [ ] Persistent data and backups use authenticated encryption; keys are separate; writes are locked, atomic, and recoverable.
- [ ] Stable IDs, idempotency receipts, duplicate detection, and append-only tamper-evident audit events survive restart and replay.
- [ ] Migration, corruption, concurrency, backup, restore, rotation, and rollback tests pass on the supported host.
- [ ] Plaintext exports are explicit disclosures with destination confirmation and cleanup guarantees.
- [ ] MCP/ChatGPT and Telegram use the same domain boundary and cannot bypass confirmations or authorization.
- [ ] Operational logs, errors, audit metadata, memory, and channel responses meet data-minimization rules.
- [ ] A signed-off release record identifies supported platforms, schema/envelope versions, dependencies, residual risks, and recovery evidence.

## Phase 1 — Standalone foundation

### Factory and ownership boundary

- [x] The agent lives under `agents/finance-os/` and does not require a shared runtime.
- [x] Local `AGENTS.md` defines product defaults, safety boundaries, and non-negotiable data rules.
- [x] `SKILL.md` routes architecture, security, data-model, schema, and roadmap work.
- [x] `memory/` is a private namespace and states that Phase 1 stores no user data.
- [x] Private memory has a confirmed-write lifecycle, per-profile isolation, allowed/forbidden content rules, retention/purge behavior, and a canonical schema.
- [x] Synthetic memory examples and a valid fixture are checked without storing secrets or canonical financial records.
- [x] Runtime data, key material, plaintext exports, backups, and memory are intended to remain outside version control.
- [ ] Add an automated repository boundary check that rejects cross-agent memory access and committed sensitive artifacts.

Acceptance criteria: an agent can be copied with its own instructions, skill, references, schemas, tests, and memory namespace; no required runtime import points outside its directory.

### Domain and schema contracts

- [x] THB base-currency and `Asia/Bangkok` time-zone defaults are documented.
- [x] Money is represented as integer minor units plus ISO 4217 currency; historical source values are preserved.
- [x] Accounts, ledger entries, transfers, investments, liabilities, budgets, goals, net-worth snapshots, preferences, exchange rates, audit events, and idempotency receipts are represented in the store contract.
- [x] Transfers have linked source/destination legs and explicit exchange-rate provenance for cross-currency cases.
- [x] Store, import-batch, encryption-envelope, export-manifest, backup-manifest, and memory-record JSON Schemas exist.
- [x] Schema conformance fixtures cover the store domains, multicurrency transfers, import, envelope, export, backup, and memory.
- [ ] Add invalid fixtures for forbidden floats, broken references, transfer-leg mismatches, unsupported currencies, duplicate IDs, and malformed timestamps.
- [x] A dependency-light validator enforces duplicate-key rejection, unique IDs, references, transfer legs, currency matching, net-worth arithmetic, audit continuity, idempotency, envelope nonce rules, and fixture safety.
- [x] Establish a schema compatibility and migration policy with supported upgrade paths.

Acceptance criteria: schemas pass a Draft 2020-12 validator; every domain invariant has either schema enforcement or an identified semantic validator and test.

### Security and architecture contracts

- [x] Channel, command, application, domain, persistence, audit, and import/export boundaries are documented.
- [x] AEAD encryption, key separation, nonces, associated data, locking, atomic replacement, duplicate prevention, audit chaining, and encrypted backup requirements are documented.
- [x] Trust boundaries and the limitation of file encryption under a compromised unlocked session are explicit.
- [x] Operations, import/export, testing, and threat/recovery runbooks are documented as future implementation contracts.
- [x] Select the Phase 2 runtime language, maintained crypto library, schema validator, file-lock strategy, and platform key-store integration.
- [x] Record supported operating systems and filesystem assumptions.

**Phase 1 gate:** keep using synthetic data. Do not request secrets, initialize a live store, connect MCP, connect Telegram, or build a dashboard.

## Phase 2 — Local encrypted core

Dependencies: Phase 1 contracts; selected runtime and maintained dependencies; a supported local host.

### Reproducible local runtime

- [x] Create a runtime local to `agents/finance-os/` with a locked dependency manifest.
- [x] Provide agent-driven install, health check, initialize, start, stop, upgrade, and uninstall workflows.
- [x] Fail safely when the runtime, key store, filesystem, permissions, schema, or ciphertext is unsupported.
- [x] Print user-facing guidance without exposing internal paths, secrets, balances, or raw records unnecessarily.
- [x] Generate only synthetic stores until the Phase 2 security gate passes.

Acceptance criteria: Codex can set up and operate the local service on a clean supported host without the user editing code or configuration files.

### Domain services

- [x] Implement exact decimal/integer money arithmetic and documented rounding behavior.
- [x] Implement account lifecycle and opening-balance events.
- [x] Implement income, expense, pending/posting, reversal, and correction workflows.
- [x] Implement atomic two-leg transfers, cross-currency amounts, linked rates, and separate fees.
- [x] Implement investment transactions, lots/positions, dividends, fees, splits, and timestamped valuations.
- [x] Implement liability draws, principal, interest, fees, and repayment allocation.
- [x] Implement budget periods and eligible-spend derivation.
- [x] Implement goal contributions and valuation-aware progress.
- [x] Implement net-worth calculation and immutable provenance-rich snapshots.
- [x] Implement preference changes without rewriting historical source data.
- [x] Return proposal, confirmation requirement, receipt, and resulting store version for mutations.

Acceptance criteria: synthetic end-to-end scenarios cover every domain; derived totals reproduce from canonical events; reversals preserve history.

### Encrypted persistence

- [x] Use a maintained AES-256-GCM or XChaCha20-Poly1305 implementation; add no custom cryptography.
- [x] Generate DEKs securely and keep the KEK outside the data directory in the platform key store.
- [x] If passphrase mode is offered, use versioned Argon2id parameters and never persist the passphrase. (No passphrase mode is offered.)
- [x] Authenticate envelope metadata, store identity, and schema/envelope versions as associated data.
- [x] Guarantee unique nonces under each key and test nonce handling.
- [x] Use owner-only permissions for the data directory, encrypted files, locks, temporary files, and backups.
- [x] Hold one exclusive bounded lock across reload, version check, mutation, audit, encryption, and replacement.
- [x] Write through a sibling temporary file, flush/sync, authenticate, atomically replace, and sync the directory where supported.
- [x] Retain a recoverable last-known-good generation and safely classify orphaned temporary files.
- [x] Treat authentication failure, store-identity mismatch, and unsupported versions as hard stops.

Acceptance criteria: no committed or runtime-adjacent plaintext/key artifacts; crash/fault injection never makes the only valid generation unavailable.

### Idempotency and audit

- [x] Scope every mutation idempotency key by owner and command type.
- [x] Persist receipt and mutation atomically; exact replay returns the original receipt without a new mutation.
- [x] Flag likely content duplicates for review without silently dropping legitimate repeated transactions.
- [x] Append one minimal audit event for Phase 2 mutations, migrations, backups, restores, rotations, and integrity failures. (Import/export remain Phase 3.)
- [x] Make the audit chain tamper-evident with a distinct purpose key and preserve verification across rotation.
- [x] Provide an audit verification operation that reveals no sensitive payloads.

Acceptance criteria: replay, restart, concurrent delivery, audit deletion/reordering/editing, and rotation tests pass.

### Backup, restore, migration, and rotation

- [x] Create encrypted, authenticated, generation-addressed backups before external storage.
- [x] Never overwrite the only known-good generation; enforce configured retention safely.
- [x] Restore into a new location, authenticate, validate identity/schema/invariants, and show a comparison before replacement.
- [x] Require explicit confirmation immediately before replacing an active store.
- [x] Implement rollback-safe, version-stepped migrations with pre-migration backup.
- [x] Implement KEK/DEK rotation with crash recovery, old-key retirement controls, and post-rotation verification.
- [x] Test disaster recovery from a separately located synthetic backup.

**Phase 2 security gate: passed 2026-11-26.** All security-critical Phase 2 tests in [`references/testing.md`](references/testing.md) pass; the recovery drill in [`references/threat-recovery.md`](references/threat-recovery.md) succeeds; the dependency and platform review records no unresolved critical risk. This does not itself authorize real data: the user must still receive the disclosure below and explicitly approve a limited secure local pilot.

## Phase 3 — CSV/JSON import, export, and MCP surface

Dependencies: Phase 2 security gate; import/export policy in [`references/import-export.md`](references/import-export.md).

### Import

- [x] Accept only supported CSV/JSON files within configured byte, row, field, and nesting limits.
- [x] Decode deterministically, normalize headers/values, and reject malformed encodings or ambiguous mappings.
- [x] Map source fields to typed records without allowing paths, formulas, or source content to become instructions. (Portable v1 accepts already-normalized typed records; locale/date mapping is deliberately rejected rather than guessed.)
- [x] Validate every row against schemas and semantic invariants.
- [x] Reject multiple preferences rows explicitly; never apply an implicit last-row-wins policy.
- [x] Produce a dry-run report with accepted, rejected, duplicate, and ambiguous rows before mutation.
- [x] Require reviewed confirmation of mapping, scope, mode, and duplicate choices.
- [x] Commit all-or-nothing by default; label and audit any explicitly selected partial mode.
- [x] Persist batch ID plus normalized row hashes so retry is idempotent.
- [x] Prove temporary plaintext cleanup on success, cancellation, crash, and validation failure.

Acceptance criteria: the import test corpus covers encoding, delimiter, locale/date, formula, oversized, malformed, duplicate, transfer, multicurrency, and rollback cases.

### Export

- [x] Require explicit format, record scope, date range, destination, and plaintext/encrypted choice.
- [x] Warn that plaintext CSV/JSON is a disclosure and require confirmation immediately before writing.
- [x] Neutralize spreadsheet formula execution in CSV while preserving canonical values in the store.
- [x] Write atomically with restrictive permissions and leave no decrypted temporary file, including authenticated startup cleanup after a killed process.
- [x] Bind confirmation to the destination's canonical parent identity and reject parent symlink/directory swaps.
- [x] Include a non-secret manifest with export version, scope, creation time, record counts, and integrity metadata where appropriate.
- [x] Audit the disclosure without recording exported content or sensitive destination details.

Acceptance criteria: an export can be imported into a new synthetic store without silent loss; disclosure, cancellation, and cleanup tests pass.

### Narrow MCP/tool surface

- [x] Expose typed use cases, never arbitrary filesystem access, raw datastore queries, key access, or encryption primitives.
- [x] Authenticate and authorize the local caller; bind every tool call to an owner and channel identity.
- [x] Bind the MCP service to one configured store owner and deny a different authenticated owner before tool dispatch.
- [x] Validate tool input and output; cap response sizes and return minimum necessary fields.
- [x] Separate read tools from mutation proposal/confirmation/commit tools.
- [x] Carry stable source event IDs into idempotency keys.
- [x] Redact errors and add rate, timeout, body, page, proposal, and output limits.
- [x] Ensure a reported timeout cannot later commit; await any atomic mutation once persistence begins.
- [x] Threat-model prompt injection, confused deputy behavior, replay, excessive scope, DNS rebinding, and data exfiltration.

Acceptance criteria: unauthorized, malformed, replayed, over-broad, and prompt-injected calls cannot read or mutate data; tool contract tests pass.

**Phase 3 security gate: passed 2026-11-27.** All Phase 2 regressions and Phase 3 interchange/MCP tests pass with no skips; dependency, schema/fixture, link, credential, lifecycle, and crash-recovery checks are recorded in [`references/phase3-gate-report.md`](references/phase3-gate-report.md). This does not authorize Phase 4, real data, public exposure, or an external ChatGPT connection.

## Phase 4 — ChatGPT experience

Dependencies: Phase 3 MCP gate; explicit user connection/consent.

- [ ] Connect `SKILL.md` to the authenticated MCP tools without embedding secrets in the skill or memory.
- [ ] Normalize natural-language requests into a visible structured proposal.
- [ ] Ask a targeted question for ambiguity and require confirmation for deletion, overwrite, external disclosure, or material financial effect.
- [ ] Return concise receipts with stable IDs, versions, and balance effects after accepted writes.
- [ ] Clearly distinguish recorded facts, derived values, estimates, stale prices/rates, and professional-advice boundaries.
- [ ] Minimize conversational and memory retention; never copy the financial store into agent memory.
- [ ] Provide zero-code connection, disconnect, health, and recovery guidance.
- [ ] Test prompt injection and malicious imported text through the full ChatGPT-to-domain path.

Acceptance criteria: representative user journeys work without code, and the chat channel cannot bypass domain validation, confirmation, idempotency, or audit.

## Phase 5 — Telegram adapter

Dependencies: Phase 3 MCP/domain surface; completed network threat model; selected hosting model; explicit user approval.

- [ ] Keep Telegram code and credentials in a channel adapter, separate from domain/storage logic.
- [ ] Store the bot token in a secret store and document rotation/revocation without ever placing it in files, logs, messages, or agent memory.
- [ ] Verify webhook authenticity/secret path as applicable and require TLS.
- [ ] Allowlist the intended Telegram user and chat; reject group, forwarded, edited, or unexpected context unless explicitly supported.
- [ ] Bind update IDs to replay-resistant idempotency keys and handle redelivery safely.
- [ ] Apply request size, attachment type/size, rate, concurrency, and timeout limits.
- [ ] Render proposed mutations and require a short-lived confirmation bound to actor, chat, exact mutation hash, and expiry.
- [ ] Minimize reply contents and Telegram-side persistence; warn that chat transport retains messages outside Finance OS control.
- [ ] Provide agent-driven connect, verify, rotate, pause, disconnect, and emergency revoke workflows.
- [ ] Audit channel actions using pseudonymous actor identifiers without message text.

Acceptance criteria: wrong-user/chat, replay, forged webhook, expired confirmation, token rotation, rate-limit, network failure, and duplicate-delivery tests pass.

## Phase 6 — Optional dashboard, feeds, and automation

Dependencies: stable Phase 2 recovery path; channel security; separate product approval. These capabilities are not required for the core agent.

- [ ] Define a local-only dashboard threat model and session authentication before implementation.
- [ ] Make the dashboard a client of the same narrow application boundary; no direct file or key access.
- [ ] Protect state-changing actions with authorization, CSRF controls, validation, and the same confirmation policy.
- [ ] Label stale, missing, estimated, and converted values with observation times and provenance.
- [ ] Treat exchange-rate and price feeds as untrusted, bounded inputs with retry, timeout, cache, stale-data, and outage behavior.
- [ ] Run scheduled work under least privilege with overlap prevention and idempotency.
- [ ] Make notifications opt-in, content-minimal, quiet-hour aware, and free of sensitive values by default.
- [ ] Provide pause/disable controls and audit configuration changes.

Acceptance criteria: dashboard and automation failures cannot corrupt the store, bypass confirmations, leak secrets, or silently convert stale estimates into recorded facts.

## Release and operational gates

### Before any real-data pilot

- [x] Phase 2 security gate is signed off with test evidence.
- [x] Supported host, key-store behavior, and local filesystem semantics are verified; the separately located backup destination remains a user choice before a real-data pilot.
- [x] A synthetic backup/restore drill and rollback drill pass on the supported local host.
- [ ] The user receives a plain-language disclosure of storage location, encryption/key behavior, backup responsibility, exports, and residual risks.
- [ ] The user explicitly opts in; the pilot begins with the minimum necessary records and can be erased safely.

### Before each channel release

- [ ] Authentication, authorization, replay, confirmation, rate-limit, privacy, and disconnect tests pass for that channel.
- [ ] The channel has no direct persistence, filesystem, key-store, or unrestricted query capability.
- [ ] Emergency pause/revoke is tested and documented in [`references/operations.md`](references/operations.md).

### Before a production release

- [ ] All applicable checklist items and acceptance criteria are evidenced.
- [ ] Automated unit, property, contract, integration, end-to-end, fault-injection, and recovery checks pass.
- [ ] Dependency, license, vulnerability, and cryptographic-library reviews are recorded.
- [ ] Schema/envelope compatibility and migration/rollback paths are documented and tested.
- [ ] Backups and retention are configured; a restore has been proven, not merely created.
- [ ] Operational metrics and logs are privacy-reviewed and contain no financial payloads or secrets.
- [ ] Residual risks and deferred features are listed; no deferred item is silently treated as implemented.

## Intentionally deferred decisions

- [x] Runtime language and maintained libraries — Node.js 22, Node crypto/filesystem primitives, and locked Ajv 8.20.0.
- [x] Platform key-store implementation — macOS Keychain generic-password entries on the supported host.
- [x] Encrypted snapshot/journal versus encrypted embedded database — authenticated encrypted snapshots with staged operation journals and last-known-good generations.
- [x] MCP hosting and owner authentication — official SDK Streamable HTTP, stateless JSON response mode, loopback-only binding, owner/client-bound scoped bearer credentials from an owner-only file.
- [ ] Telegram webhook/polling and hosting exposure — decide before Phase 5.
- [ ] Backup destination and retention — user choice before real data.
- [ ] Dashboard, feeds, and notifications — optional after recovery is stable.

Deferral does not waive a gate. If a decision affects confidentiality, integrity, authorization, or recovery, real data remains prohibited until the decision is made and tested.
