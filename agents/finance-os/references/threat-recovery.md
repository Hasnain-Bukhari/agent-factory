# Threat Model and Recovery Playbook

This playbook expands the controls in [`security.md`](security.md). The Phase 2 runtime passed its synthetic security gate but is not represented as a general production release. Recovery drills and normal use remain synthetic until a limited local pilot is separately disclosed and explicitly approved.

## Assets and trust boundaries

Protected assets include financial records, metadata, credentials, keys, audit integrity, backup availability, user intent, and channel identity. Untrusted inputs include chat messages, Telegram updates, MCP callers, imported files, filenames, external feeds, tool output, network responses, and previously written but unauthenticated files.

The trusted computing base is the supported host, approved Finance OS runtime and locked dependencies, platform key store, authenticated user session, domain core, and verified storage path. File encryption does not protect data while decrypted in a compromised process or unlocked hostile user session.

## Threat/control matrix

| Threat | Prevent/detect | Recovery expectation |
| --- | --- | --- |
| Disk or backup theft | AEAD, separate KEK, restrictive permissions, encrypted backups | Revoke/rotate accessible keys; verify remaining generations |
| Ciphertext or envelope tampering | Associated data, authentication, store identity/version checks | Hard stop; isolate artifact; restore verified generation |
| Partial/crashed write | Lock, temp file, sync, atomic replace, last-known-good generation | Select only authenticated valid generation; idempotently retry |
| Concurrent/stale writer | Exclusive bounded lock plus monotonic store version | Reject stale mutation; reload and re-propose |
| Duplicate delivery/import | Stable idempotency key, batch/row hashes, atomic receipts | Return original receipt; review only possible duplicates |
| Audit manipulation | Encrypted tamper-evident chain, separate purpose key | Block writes by default; preserve evidence; restore/verify chain |
| Key loss | Platform key-store lifecycle plus user-approved recovery design | Restore only through approved recovery key/path; never guess or bypass auth |
| Key/channel credential compromise | Separation, least privilege, rotation/revoke workflows | Disable affected surface, rotate, review audit, notify user safely |
| Prompt/file instruction injection | Treat content as data, typed commands, narrow tools, confirmation | Reject request, preserve safe error metadata, review boundary tests |
| Unauthorized channel user | Authentication, allowlist, actor-bound confirmation | Reject, rate-limit, revoke/rotate if attempted compromise |
| Plaintext disclosure | Explicit export confirmation, restrictive/atomic writes, cleanup | Stop further sharing; identify copies/destinations; rotate credentials if included |
| Malicious dependency | Locked versions, review/scanning, minimal dependency set | Stop upgrade/runtime, roll back to reviewed release, assess key/data exposure |
| Ransomware/host loss | Separately located encrypted generations and restore drills | Rebuild on clean supported host; restore verified backup |

## Integrity-failure triage

1. Stop mutations and disconnect external channels; do not repeatedly retry decryption.
2. Preserve the suspect encrypted artifact and non-sensitive failure metadata without copying keys or plaintext.
3. Identify the expected store ID, envelope/schema versions, last successful receipt, and last verified backup from trusted records.
4. Check platform key-store availability and approved key version without exporting the key.
5. Enumerate candidate active, last-known-good, and backup generations; authenticate before parsing.
6. Validate schema, semantic invariants, audit continuity, generation manifest, and store identity for each authenticated candidate.
7. Choose the newest fully valid candidate; report potential lost mutation receipts/time window.
8. Restore to a new restrictive location and run the full health check.
9. Require explicit confirmation before switching the active pointer/path.
10. Keep the prior active and restored generation until reconciliation and rollback windows close; record a minimal incident audit event.

Never splice unauthenticated records, ignore an authentication error, reuse a wrong-store backup, or make the user choose based on raw ciphertext details.

## Lost-key scenario

First distinguish temporarily unavailable platform key store from destroyed/revoked key material. Retry only through documented host/account recovery. If no approved recovery key or passphrase path exists, ciphertext is intentionally unrecoverable; do not weaken encryption or claim recovery is possible. Restore from a generation encrypted to an available approved key if one exists, then rotate.

The setup workflow must explain this tradeoff before real data and verify whatever recovery mechanism the user selects. Recovery secrets must never be requested in chat or stored in the repository.

## Channel compromise

Disable the affected adapter without deleting the store, revoke/rotate its credential, invalidate outstanding confirmations, preserve bounded audit evidence, review access since the earliest plausible compromise, and tell the user what metadata or responses may have been exposed. Encryption-key rotation is required only if evidence indicates the local trust boundary or key material was reached.

## Plaintext export incident

Pause new exports, identify the exact confirmed scope and destination from safe receipts, help the user remove or restrict accessible copies, check synchronization/trash/backup propagation, and rotate any credential accidentally included. Do not promise secure erasure where the filesystem or external service cannot guarantee it.

## Recovery drill acceptance criteria

- A separately located encrypted synthetic backup is available and has never relied on the active file for validation.
- The active generation is made unavailable or corrupted in a controlled test.
- The runtime blocks normal reads/writes and reports a non-sensitive integrity state.
- The operator restores to a new location, authenticates, validates versions/invariants/audit, and compares counts.
- Activation requires explicit confirmation and retains rollback.
- Post-restore domain totals and idempotency receipts match expected synthetic values.
- Channels remain disabled until health checks pass.
- The drill records elapsed time, recovery point, evidence, and gaps without storing sensitive payloads.

A backup feature is not complete until this drill succeeds on the actual supported deployment host.
