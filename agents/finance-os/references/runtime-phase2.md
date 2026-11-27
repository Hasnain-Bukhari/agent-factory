# Phase 2 Local Runtime

## Supported host and dependency record

- Platform: Apple-silicon macOS (`darwin-arm64`).
- Runtime: Node.js 22; gate run used 22.16.0.
- Cryptography: Node `crypto`, backed by OpenSSL 3; gate run used 3.0.16.
- Phase 2 dependency: Ajv 8.20.0 provides exhaustive Draft 2020-12 validation. The current runtime lock also contains the Phase 3 official MCP SDK and Zod dependencies described in [`runtime-phase3.md`](runtime-phase3.md). Cryptography and filesystem persistence use Node built-ins.
- Filesystem: a local filesystem with owner-mode permissions, exclusive file creation, same-directory atomic rename, and file/directory `fsync`. Network filesystems are unsupported.
- Production key provider: macOS Keychain generic-password entries, accessed by fixed-argument `/usr/bin/security` calls. The KEK and audit key never enter the data directory. Tests inject a deterministic synthetic provider that is forbidden for real data.

The platform adapter and temporary synthetic Keychain lifecycle are tested. This release deliberately does not initialize a real Keychain-backed store without a separate limited-pilot disclosure and explicit approval.

## Cryptographic format

Each write generates a random 256-bit DEK and 96-bit nonce. AES-256-GCM encrypts the canonical JSON store. A macOS-Keychain KEK wraps the DEK with a separate AES-256-GCM operation and nonce. Canonical associated data binds purpose, envelope version, store identity, schema version, algorithm, key identifier, and key version. Ciphertext and wrapped-key authentication failures, metadata mismatch, and unknown versions are hard stops.

The audit chain uses a distinct 256-bit audit key and HMAC-SHA-256 over canonical event fields. Every event stores its own authenticator and the preceding authenticator; the verifier also requires the event count to equal the monotonic store version.

## Zero-code lifecycle

From `agents/finance-os/runtime/`, the agent runs:

```text
node bin/finance-os.mjs install
node bin/finance-os.mjs doctor
node bin/finance-os.mjs init --synthetic --data-dir <agent-selected-path>
node bin/finance-os.mjs start --data-dir <path>
node bin/finance-os.mjs health --data-dir <path>
node bin/finance-os.mjs stop --data-dir <path>
node bin/finance-os.mjs upgrade --data-dir <path>
node bin/finance-os.mjs uninstall --data-dir <path> --confirm REMOVE-SYNTHETIC-RUNTIME
```

Proposal/commit, backup, staged restore, audit verification, summary, key rotation, and explicitly confirmed old-key retirement are also typed commands. The CLI prints only non-sensitive status, identifiers, versions, counts, and receipts. It never accepts a passphrase or secret through chat.

## Persistence behavior

An exclusive bounded lock covers reload, expected-version check, domain mutation, audit/receipt creation, encryption, atomic replacement, and post-write authentication. Runtime files are mode `0600`; directories are `0700`. The active encrypted generation is copied to a last-known-good encrypted generation before replacement. Sibling temporary files are never promoted automatically, and health reports their count without opening unauthenticated content. A dead lock is recovered only after its owner PID is absent and its age exceeds policy; a live PID is never stolen.

Backups are authenticated before retention runs, and retention always keeps at least one authenticated generation. Restore confirmation binds the store/version, staged-envelope hash, requested activation path, and canonical activation path. Migration and rotation use persistent state plus staged encrypted generations so startup can finish activation or roll back. Old-key retirement first rewraps and authenticates every retained encrypted generation in the data directory and every explicitly supplied external backup root; only then may the Keychain entry be deleted.

## Schema compatibility and gate status

Runtime boundaries compile and enforce the canonical Draft 2020-12 schemas with lockfile-pinned Ajv 8.20.0, followed by semantic validation for references, transfers, audit continuity, receipts, and arithmetic. Store schema `1.0.0` is current. The only supported upgrade source is `0.9.0`, applied as one explicit staged step with a verified pre-migration backup. Unknown future versions, skipped steps, and downgrades fail closed.

The Phase 2 security gate passed on 2026-11-26 with 47 host tests passing and no skips; see [`phase2-gate-report.md`](phase2-gate-report.md). Phase 3 interchange and loopback MCP were subsequently implemented and gated; see [`phase3-gate-report.md`](phase3-gate-report.md). Neither gate authorizes network filesystems, other hosts, real data, or an external channel connection.
