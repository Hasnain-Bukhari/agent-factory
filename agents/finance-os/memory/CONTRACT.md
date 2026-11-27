# Finance OS Private Memory Contract

Memory helps Finance OS maintain user-approved continuity. It is not a second financial database.

## Namespace and ownership

- Scope every record to one immutable Finance OS `profile_id`; never share records across profiles or agents.
- The Finance OS runtime is the only writer. Channel adapters request operations through the command boundary and never access memory files directly.
- Use a separate encrypted memory store per profile. Keep encryption keys in the platform key store, not in this directory or a channel session.

## Allowed memory

Only remember information that the user explicitly confirms and that has a clear future use:

- `preference`: display, locale, time-zone, base-currency, week-start, and confirmation preferences;
- `alias`: user-approved shorthand for a non-secret account, category, goal, or payee identifier;
- `categorization_rule`: a user-approved rule that proposes a category for later review;
- `import_mapping`: a reviewed mapping from a named import format to canonical fields;
- `workflow_checkpoint`: a non-sensitive pointer needed to resume an incomplete Finance OS workflow.

THB and `Asia/Bangkok` are defaults, not inferred personal facts. A user-confirmed preference may override them without rewriting historical source records.

## Never memory

Do not store canonical transactions, balances, investment lots, liabilities, audit events, full reports, raw imported rows, raw messages, authentication data, tokens, passwords, recovery codes, encryption keys, bank credentials, government identifiers, payment-card data, or unreviewed model inferences. Do not copy a fact into memory merely because it appeared in conversation.

Canonical finance data belongs in the encrypted Finance OS store. Secrets belong in a secret or platform key store. Short-lived calculation results and caches remain ephemeral.

## Capture and update lifecycle

1. Identify the purpose, record type, fields, source, and optional expiry.
2. Show a minimal structured proposal. Label inferred or suggested values; do not persist them.
3. Obtain explicit confirmation immediately before the write.
4. Validate against [`memory-record.schema.json`](memory-record.schema.json), enforce namespace and allowed-type rules, and check the idempotency key.
5. Under the Finance OS write lock, encrypt and atomically commit the record with the memory index and audit event.
6. Return a receipt with `memory_id`, type, status, version, and timestamp, without echoing sensitive values.

Updates create a new record version and preserve `created_at`. When a proposed update conflicts with an existing value, show both values and ask; do not silently pick the newest. Replayed idempotency keys return the original receipt.

## Retrieval and use

- Retrieve only active records relevant to the current request and authorized profile.
- Treat remembered aliases and rules as aids, not authority to perform a financial mutation.
- A categorization rule may create a proposal but never silently commit a transaction.
- Show when memory affected a material interpretation, and let the user correct or forget it.
- Do not send memory to ChatGPT/MCP, Telegram, or another external destination unless the user explicitly confirms the exact disclosure.

## Retention and deletion

- Use `expires_at` for workflow checkpoints and other temporary continuity. Expired records are not retrieved and are removed by a confirmed or configured retention operation.
- Review durable rules and mappings when they repeatedly fail or when the referenced object is archived.
- Archive disables normal retrieval but preserves a minimal tombstone needed for replay and audit integrity.
- Forget/purge requires a preview of the affected records and fresh explicit confirmation. Remove ciphertext and indexes where supported, append a privacy-safe audit event, and explain that separately retained encrypted backups expire according to their retention policy.

## Storage invariants

- Encrypt memory using the Finance OS security contract; use authenticated encryption, restrictive permissions, locking, atomic replacement, backups, and integrity checks.
- Keep memory schema/version migrations explicit and reversible. Authentication or schema failure is a hard stop.
- Store stable IDs and references, not mutable labels, wherever the canonical store owns the object.
- Never log memory values. Operational logs may contain pseudonymous record IDs, action, outcome, duration, and redacted error codes.
- Phase 1 contains contracts and synthetic examples only; it has no live memory runtime.
