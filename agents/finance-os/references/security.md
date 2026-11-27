# Security and Persistence Design

This is the implementation contract for persistence. Phase 2 implements the gate-passed local encrypted subset described in [`runtime-phase2.md`](runtime-phase2.md). The gate does not itself authorize a real store or secrets; those require a separate limited-pilot disclosure and fresh explicit approval.

Test requirements are in [`testing.md`](testing.md), incident and restore procedures are in [`threat-recovery.md`](threat-recovery.md), and import/export details are in [`import-export.md`](import-export.md).

## Threat model

Protect against casual disk inspection, stolen backups, accidental commits, partial writes, concurrent writers, duplicate message delivery, tampering, and overly revealing logs. Full compromise of an unlocked user session or the running Finance OS process is outside file encryption's protection and must be addressed with host security and least privilege.

## Encryption envelope

- Use authenticated encryption (AEAD) from a maintained library: AES-256-GCM or XChaCha20-Poly1305.
- Generate a fresh random data-encryption key (DEK) for the store or backup generation.
- Wrap the DEK with a key-encryption key (KEK) held separately from the ciphertext.
- Prefer a platform key store for the KEK. If the user explicitly chooses a passphrase, derive a KEK with Argon2id using a unique random salt and stored, versioned cost parameters.
- Use a unique nonce for every encryption under a key. Store the nonce, algorithm identifier, key version, schema version, and authenticated non-secret metadata in a versioned envelope.
- Bind the store identifier, schema version, and envelope version as associated data so they cannot be silently swapped.
- Never invent cryptography, reuse a nonce, serialize raw keys, log plaintext, or put the key beside encrypted data.

Authentication failure is a hard stop. Do not attempt partial recovery from unauthenticated plaintext.

## Files and locking

Encryption protects confidentiality and integrity. A file lock only coordinates cooperating processes; it does not secure the file from other users. Use both:

- restrictive owner-only permissions for data, locks, and backups;
- one exclusive lock covering version check, mutation, audit append, encryption, and replacement;
- a bounded lock wait with a clear retryable error;
- an optimistic monotonic `store_version` to detect stale writers;
- no network filesystem assumption unless its locking and atomic-replace guarantees are explicitly verified.

## Atomic writes

1. Serialize and validate the complete next snapshot in memory.
2. Encrypt it into a sibling temporary file with restrictive permissions.
3. Flush and sync the temporary file.
4. Re-read and authenticate it when the storage library allows a cheap verification pass.
5. Atomically rename it over the current snapshot.
6. Sync the containing directory where supported.

Keep the last known-good generation until the new generation is durable. On startup, ignore orphaned temporary files unless an explicit recovery routine authenticates and validates them.

## Duplicate prevention

Every mutation carries a stable `idempotency_key` scoped to the user and command type. Channel adapters should derive it from a stable source event ID when available; imports derive it from the import batch ID plus normalized row hash. Persist the key and resulting receipt atomically. A repeated key returns the original outcome and does not append another financial mutation.

Content fingerprints may flag likely duplicates but must not silently merge legitimate repeated purchases. Ask the user when the idempotency key differs but a high-confidence fingerprint matches.

## Audit trail

Append one audit event for each accepted mutation, import, export, key rotation, backup, restore, migration, and failed integrity check. Events include timestamp, actor/channel pseudonym, action, target IDs, prior/new store versions, idempotency key, and outcome. Exclude secrets, raw messages, full descriptions, and unnecessary monetary details.

Make tampering evident by chaining events with a keyed MAC or by including the previous authenticated event hash inside each encrypted event. Audit data is sensitive and is encrypted under a distinct purpose-derived key. Rotation must preserve verifiability.

## Backups and recovery

- Backups are encrypted before leaving the trusted process and use generation IDs plus authenticated manifests.
- Keep at least one offline or separately located generation; retention is a user preference.
- Never overwrite the only known-good backup.
- Verify authentication, schema compatibility, and store identity before restore.
- Restore to a new location first, validate counts and invariants, then require explicit confirmation before replacing the active store.
- Periodically test restore with synthetic data; an untested backup is not a recovery plan.

## Import and export

CSV/JSON imports are untrusted: impose size and row limits, reject path traversal and spreadsheet formula injection, normalize encodings, validate every row, and produce a dry-run report before commit. A batch either commits fully or not at all unless the user explicitly chooses a reviewed partial import.

Exports are plaintext disclosures unless the user selects encrypted export. Require an explicit format, scope, destination, and confirmation. Write atomically, warn about the destination's privacy, and never leave decrypted temporary files behind. Prefix risky CSV cells when targeting spreadsheet software, while preserving the original value in the canonical store.

## Logging and privacy

Use structured logs with record IDs, event types, timings, and redacted errors. Do not log balances, descriptions, account labels, imported rows, tokens, keys, nonces with ciphertext, or decrypted payloads. Minimize data returned to channel adapters and apply configurable retention to operational logs.
