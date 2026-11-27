# Finance OS Agent Instructions

These instructions apply inside `agents/finance-os/`.

## Product defaults

- Base currency: THB.
- Time zone: Asia/Bangkok.
- Support multiple currencies without rewriting historical source amounts.
- Cover income, expenses, accounts, transfers, investments, liabilities, budgets, goals, net worth, and preferences.
- Keep the interaction channel separate from financial logic so ChatGPT/MCP and Telegram can be adapters later.

## Current implementation boundary

Phase 3 has a gate-passed synthetic import/export runtime and loopback-only authenticated MCP surface. Passing the gate does not authorize real financial data, an external ChatGPT connection, or production claims: a limited pilot still requires a separate disclosure and fresh explicit user approval. Do not request secrets, start Phase 4, implement a dashboard, or connect an external channel unless separately authorized after its own gate.

## User experience contract

- Assume the user does not write or edit code. Make safe repository changes, run checks, and explain outcomes in plain language; ask only for unavoidable consent, account connection, or product choices.
- For a future live runtime, turn a user request into a structured proposal before any financial write. Include the action, normalized amount/currency, effective date in `Asia/Bangkok`, affected account or object, and any estimate or exchange-rate source.
- Read-only queries do not need confirmation. Require a fresh explicit confirmation immediately before a create, correction, archive, purge, import commit, restore, plaintext export, external transmission, or other state change. Never treat silence, a vague acknowledgement, or an earlier broad approval as confirmation.
- If a request is ambiguous, show the unresolved fields and do not guess. If a repeated idempotency key already succeeded, return the original receipt instead of proposing another write.
- After an accepted mutation, return a receipt containing the stable record ID, action, status, store version, timestamp, balance effects, and any linked audit ID. Clearly label estimates and pending actions.
- Until a limited local pilot is separately disclosed and explicitly approved, execute this flow only against synthetic stores.

## Non-negotiable data rules

- Represent money as integer minor units plus an ISO 4217 currency code; never use binary floating point for stored amounts.
- Preserve original amounts and record explicit exchange-rate snapshots for conversions.
- Model a transfer as two linked ledger legs with one stable transfer identifier.
- Require stable identifiers and idempotency keys at write boundaries to prevent duplicate ingestion.
- Append audit events for accepted mutations; never put secrets or unnecessary sensitive values in the audit log.
- Validate all import, message, and tool input against local schemas before it reaches domain logic.

## Security rules

- Follow [`references/security.md`](references/security.md) before implementing storage or export.
- Use authenticated encryption through a maintained cryptographic library; never design custom cryptography.
- Keep keys separate from ciphertext, prefer the operating-system key store, and never log key material or plaintext records.
- Use file locking for concurrency and authenticated encryption for confidentiality; do not confuse the two.
- Use atomic replacement and recoverable backups for persistent mutations.

## Memory rules

- Follow [`memory/CONTRACT.md`](memory/CONTRACT.md) before designing or implementing memory behavior.
- Memory is private continuity state, not the canonical ledger, audit trail, backup, secret store, or raw chat history.
- Namespace memory by Finance OS profile and never read or write another agent's namespace.
- Persist only explicitly confirmed, purpose-limited items that validate against the local memory schema. Encrypt live memory at rest and keep key material outside this directory.
- Retrieve the minimum relevant memory for a request, surface conflicts instead of silently overwriting, and produce a receipt for memory changes.

## Channel boundary

- ChatGPT/MCP and Telegram are future adapters. They may authenticate, normalize, confirm, and render; they must not own financial rules or direct file access.
- A channel event identifier may seed an idempotency key but never replaces Finance OS validation, authorization, or confirmation.
- Never place Telegram tokens, MCP credentials, raw messages, or channel session data in Finance OS memory.

## Working method

Read only the references needed for the task, as routed by `SKILL.md`. Keep runtime code and dependencies local to this agent unless a proven cross-agent abstraction is explicitly approved. Update schemas and references together when domain contracts change. Run relevant checks yourself and report the files changed, validations performed, assumptions, and remaining gaps.
