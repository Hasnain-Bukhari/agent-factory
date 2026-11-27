# Finance OS Architecture

## Architectural goal

Finance OS is one standalone agent inside Agent Factory. Its financial rules, storage adapter, schemas, and memory stay local to `agents/finance-os/`. The root repository supplies conventions, not a runtime dependency.

The implementation sequence and release gates are tracked in [`../CHECKLIST.md`](../CHECKLIST.md). Future operator behavior is specified in [`operations.md`](operations.md).

## Component boundaries

```text
ChatGPT / MCP ──────────┐
Telegram webhook ───────┼─> Channel/local client -> Command boundary -> Application services
Local dashboard/jobs ───┘                                             |
                                                              v
                                                     Finance domain core
                                                              |
                                      ┌───────────────────────┼───────────────────────┐
                                      v                       v                       v
                               Encrypted store          Audit journal          Import/export
                               (future runtime)         (append-only)          (CSV/JSON)
```

### Channel adapters

Adapters and local clients authenticate a caller, normalize channel-specific input, and render responses. They must not contain balance, budget, transfer, or valuation rules. The Phase 3 MCP adapter uses the shared command boundary and domain services; the Phase 4 ChatGPT harness, Phase 5 Telegram adapter, and Phase 6 dashboard/scheduler are clients of that narrow boundary and have no storage or key access. Feeds remain untrusted non-canonical observations and notifications receive only minimal event codes.

### Command boundary

The boundary accepts schema-validated commands, assigns or verifies an idempotency key, resolves user preferences, and returns a proposed mutation. Ambiguous or destructive changes pause for explicit confirmation.

### Application services

Services coordinate use cases such as recording an expense, transferring funds, importing records, valuing holdings, closing a budget period, or producing a net-worth snapshot. They depend on interfaces rather than a specific file format.

### Domain core

The core owns money arithmetic, double-entry effects, transfer pairing, currency conversion provenance, category and budget rules, liability balances, investment lots/valuations, goals, and net-worth calculations. It has no Telegram, ChatGPT, MCP, filesystem, or encryption knowledge.

### Persistence boundary

The store exposes transactional load/validate/mutate/audit/save behavior. A future local implementation may use encrypted JSON as the canonical snapshot plus encrypted append-only audit records. CSV and JSON are import/export formats, not necessarily the internal truth.

## Write flow

1. Authenticate the caller and validate the channel envelope.
2. Normalize the request into a typed command.
3. Validate schema and domain invariants.
4. Check the idempotency index; return the original receipt for a duplicate.
5. Produce and, when required, confirm the proposed mutation.
6. Acquire the process/file lock, reload the current version, and check optimistic version.
7. Apply the mutation and append its audit event in one logical transaction.
8. Encrypt, write to a sibling temporary file, sync, atomically replace, and sync the directory where supported.
9. Release the lock and return a receipt with record IDs and the new store version.

## Read flow

Authenticate, load and authenticate ciphertext, migrate only through an explicit supported schema path, calculate derived views in memory, and return the minimum data needed by the channel.

## Deployment shape

Phase 2 implements one local command service with one encrypted data directory and one owner boundary. This keeps locking, backups, recovery, and trust boundaries understandable. Split services only when a measured need justifies the added security and consistency cost. See [`runtime-phase2.md`](runtime-phase2.md) for the supported host and gate limits.

## Trust boundaries

- Messages, imported files, tool output, filenames, and exchange-rate feeds are untrusted.
- Decrypted records exist only inside the trusted Finance OS process and only as long as needed.
- Channel credentials and encryption keys are separate secrets with separate rotation paths.
- Exports are deliberate disclosures and require an explicit destination and confirmation.
