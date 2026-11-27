# Operations Runbook

This runbook defines the operator experience. Phase 2 has a gate-passed local encrypted core, but there is still no automatically authorized real-data procedure. All examples and drills remain synthetic until the user receives the limited-pilot disclosure and gives fresh explicit approval. Executable commands and boundaries are recorded in [`runtime-phase2.md`](runtime-phase2.md).

## Operating principles

- The user should not edit code, configuration, schemas, or encrypted files.
- Codex or another approved agent performs checks and presents plain-language choices; the user supplies only unavoidable consent, authentication, and destination choices.
- Never ask for a passphrase, bot token, recovery code, bank credential, or plaintext financial file in chat.
- Stop on authentication failure, unsupported versions, store-identity mismatch, failed invariant checks, unsafe permissions, or uncertain recovery state.
- Every state-changing operation returns a receipt and creates a minimal audit event.

## Required lifecycle workflows

### Install and initialize

The implemented synthetic workflow verifies the supported host and runtime, restrictive permissions, random store identity, encrypted empty store, authenticated reopen, and temporary Keychain create/read/delete behavior. A real Keychain-backed initialization and the user's separately located backup destination require the limited-pilot disclosure and approval.

Initialization must be all-or-nothing. On failure, remove only newly created, positively identified artifacts and preserve diagnostic metadata without secrets.

### Start and health check

A health check should report service reachability, supported schema/envelope versions, lock availability, ciphertext authentication, semantic validation, audit-chain verification, last successful encrypted backup age, and pending migration status. It must not print balances, account labels, record descriptions, keys, tokens, or ciphertext/nonces together.

### Normal mutation

Follow the write flow in [`architecture.md`](architecture.md): authenticate, normalize, validate, deduplicate, propose/confirm, lock/reload/version-check, mutate/audit, encrypt/atomic-replace, and return a receipt. A timeout or crash before a receipt may be retried with the same idempotency key.

### Backup

Create a new encrypted generation without overwriting the last known-good generation. Authenticate and validate it after writing, record a non-secret manifest and audit event, apply retention only after the new generation is proven, and verify that at least one generation is separately located.

### Restore

Use the recovery procedure in [`threat-recovery.md`](threat-recovery.md). Never restore over the active store first. The user must see the source generation, store identity, versions, timestamps, record counts, validation result, and rollback option before confirming replacement.

### Upgrade and migration

Check compatibility, create and verify a pre-upgrade backup, stop new writes, apply one explicit version step at a time to a new generation, validate and authenticate, then atomically activate. Preserve rollback until the upgraded store has passed health checks. Never silently downgrade or skip an unknown version.

### Key rotation

Verify a current backup, create the new key version in the platform key store, rewrap or re-encrypt through a crash-safe staged generation, authenticate all outputs, activate atomically, and verify audit-chain continuity. Retire the old key only after the rollback window and backup policy are satisfied. The retirement workflow must include every retained external backup root, rewrap and authenticate each old-key generation, require exact confirmation, and delete the old Keychain entry only after no scanned generation references it.

### Pause, disconnect, and emergency revoke

Provide separate controls to pause mutations, disable an individual channel, revoke channel credentials, and stop the local service. Revoking Telegram or MCP access must not delete the encrypted store. Suspected credential compromise requires immediate channel disablement, credential rotation, audit review, and user-visible status.

For Telegram, pause locally before any external operation and invalidate outstanding channel confirmations. Rotation verifies new versioned token/webhook/route/confirmation secrets before activation and then removes superseded versions. Disconnect deletes only channel secrets and transient adapter state. Emergency revoke requests webhook deletion with pending-update drop; if that network action fails, keep the adapter paused and retain the token only for a controlled retry. Never ask the user to paste a bot token into chat, a repository file, a shell argument, or Finance OS memory. See [`runtime-phase5.md`](runtime-phase5.md).

For Phase 6, revoke local dashboard sessions independently, pause or disable every schedule before maintenance, and disable notifications without touching the encrypted store. Feed outage must surface stale or missing labels and never create a recorded fact. A scheduler retry reuses the deterministic source identity. Notification delivery failures remain isolated and contain no financial values. See [`runtime-phase6.md`](runtime-phase6.md) and [`dashboard-automation-threat-model.md`](dashboard-automation-threat-model.md).

### Export and deletion

Exports follow [`import-export.md`](import-export.md). Purge is a separate privacy workflow: identify exact scope, show consequences and backup implications, require explicit confirmation, create the permitted audit evidence, and verify removal from active data and scheduled retention. Secure deletion cannot be promised on copy-on-write filesystems or remote backups; state this limitation plainly.

## Operational states

| State | Reads | Writes | Required response |
| --- | --- | --- | --- |
| Healthy | Allowed | Allowed | Normal operation |
| Backup overdue | Allowed | Policy-dependent | Warn and offer agent-run backup |
| Migration required | Compatibility-dependent | Blocked | Offer reviewed upgrade |
| Lock contention | Allowed if safe | Retryable block | Preserve idempotency key |
| Authentication/integrity failure | Blocked | Blocked | Isolate file; start recovery triage |
| Audit-chain failure | Blocked by default | Blocked | Preserve evidence; recover from verified generation |
| Key unavailable | Blocked | Blocked | Check approved key store/recovery path; never guess |
| Channel compromise | Local reads may remain | Affected channel blocked | Revoke/rotate channel credential |
| Dashboard/session concern | Other approved channels may remain | Dashboard writes blocked | Revoke sessions; verify loopback/origin and audit |
| Feed outage or poisoning | Recorded facts remain available | Feed-derived actions blocked | Show stale/missing; quarantine cache; retry bounded fetch |
| Automation failure | Manual operation remains | Failed task isolated | Pause schedule; replay same source identity after review |

## Routine cadence

- On every start: authenticate the store, validate versions, check audit continuity, and classify orphaned temporary files without opening unauthenticated content.
- On every mutation: validate, deduplicate, lock, version-check, audit, atomically persist, and return a receipt.
- On backup schedule: create and verify a new encrypted generation, then enforce retention.
- On dependency update: review security notes, run the full synthetic suite, and keep rollback available.
- Periodically: run a synthetic restore drill and review permissions, channel allowlists, key versions, backup age, and redacted logs.

## Support bundle

If diagnostics are needed, generate a user-reviewed bundle containing runtime and platform versions, non-sensitive error codes, schema/envelope versions, redacted timings, and invariant counts. Exclude environment variables, paths containing user names when avoidable, financial values, labels, descriptions, messages, imported rows, ciphertext, nonces, keys, and tokens.
