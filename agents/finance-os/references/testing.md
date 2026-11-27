# Test and Verification Strategy

All tests use synthetic data until the real-data pilot gate in [`../CHECKLIST.md`](../CHECKLIST.md) passes. Tests should be deterministic except where cryptographic randomness is the subject; secrets and plaintext runtime artifacts must never be committed.

## Required layers

### Static and contract checks

- Parse every JSON and validate every schema as Draft 2020-12.
- Validate `SKILL.md` frontmatter and all local Markdown links.
- Scan committed content for credentials, key material, plaintext stores, exports, backups, and real-looking personal data.
- Enforce the standalone boundary: runtime dependencies and memory remain under `agents/finance-os/` except approved operating-system facilities.
- Check example fixtures against schemas and semantic invariants.

### Unit and property tests

- Money parsing, integer arithmetic, currency exponents, decimal conversion, rounding, sign conventions, and overflow boundaries.
- Date/time interpretation around `Asia/Bangkok` day/month/year boundaries and DST-capable non-default zones.
- Transfer two-leg balance, same/cross-currency rules, fees, reversals, and replay.
- Investment quantities/lots, splits, dividends, fees, realized/unrealized values, and valuation timestamps.
- Liability principal versus interest/fee effects.
- Budget eligibility/period boundaries, goal progress, and net-worth reconciliation.
- Stable normalization/hashing and content-similarity duplicate detection without silent merging.

Use property tests for conservation rules, reversal neutrality, serialization round trips, mutation version increments, and equivalence under duplicate replay.

### Persistence and security tests

- AEAD encrypt/decrypt for each supported envelope version and algorithm.
- Tampered ciphertext, nonce, associated data, store ID, schema version, key version, and wrapped key all fail closed.
- Nonce uniqueness is enforced or structurally guaranteed under repeated and concurrent writes.
- Keys never appear in files, logs, errors, process arguments, fixtures, or support bundles.
- Owner-only permissions are created and unsafe pre-existing permissions are rejected or repaired with consent.
- Lock timeout, stale writer, concurrent writers, process crash, disk-full, short write, failed sync, failed rename, and orphaned temp behavior.
- The old or new complete generation remains usable after each injected failure point.
- Audit deletion, insertion, reorder, edit, truncation, wrong key, and key rotation are detected.

### Migration and recovery tests

- Upgrade each supported schema/envelope version one step at a time.
- Reject unknown future versions and unsupported downgrades without mutation.
- Roll back after failure at every migration activation step.
- Restore a valid separately located generation to a new path, validate it, compare it, confirm activation, and retain rollback.
- Reject wrong-store, wrong-key, corrupted, partial, expired-policy, and invariant-breaking backups.
- Rotate keys with interruption at each stage and verify old/new recovery expectations.

### Import/export tests

Cover UTF-8 and declared encodings, BOMs, delimiters, quoted newlines, locale-specific decimal/date forms, huge fields, deep JSON, invalid rows, unknown columns, formula prefixes, path-like content, prompt-injection text, duplicates, transfers, multicurrency, dry-run drift, atomic rollback, partial mode, cancellation, cleanup, and round trip. See [`import-export.md`](import-export.md).

Phase 3 evidence exercises UTF-8 BOM and malformed encoding, comma/semicolon delimiters, quoted newlines, byte/field/depth limits, schema-invalid rows, formula/path/prompt text as inert data, exact replay and selected partial commit, source/store drift, recipient-key authentication failure, cancellation cleanup, canonical transfer/multicurrency preservation, plaintext JSON plus encrypted CSV round trips, and operating-system process-kill recovery of staged plaintext. Locale-formatted decimal/date mapping is deliberately unsupported in version 1 and is tested by schema rejection rather than normalization.

### Channel contract and end-to-end tests

- MCP: authentication, authorization, input/output schemas, least-data response, replay, over-broad scope, timeout, rate limit, prompt injection, and confirmation binding.

Current MCP evidence uses the official client against the pinned official SDK Streamable HTTP server. It covers initialization/discovery, strict schemas and annotations, bearer expiry, owner/scope authorization, hostile Origin/Host rejection, malformed and over-broad input, inert prompt text, caller/hash/expiry-bound proposals, exact replay, body/rate/time/output limits, and privacy-safe errors.
- ChatGPT: ambiguity, proposal fidelity, stale proposal, confirmation, cancellation, receipt, privacy-safe errors, and recorded-fact versus estimate labeling.
- Telegram: wrong identity/chat, forged webhook, duplicate update, edited/forwarded/group message policy, expired confirmation, token rotation, network retry, rate limit, and emergency revoke.
- End to end: channel request to validated command to encrypted mutation/audit to receipt, followed by restart and identical replay.

## Minimum synthetic scenario set

1. THB salary and categorized expenses across a Bangkok month boundary.
2. THB bank-to-wallet transfer with a fee.
3. USD-to-THB transfer with a sourced rate and explicit rounding.
4. Brokerage buy, dividend, fee, price observation, and net-worth snapshot.
5. Loan draw, principal repayment, interest expense, and debt goal.
6. Monthly budget with pending, posted, reversed, and excluded entries.
7. CSV import containing a duplicate, malformed row, formula cell, transfer pair, and ambiguous date.
8. Crash during a write followed by recovery and idempotent retry.
9. Backup, key rotation, corruption of active generation, and restore.
10. Malicious chat/import text attempting to override policy or exfiltrate data.

## Gate evidence

A gate report records runtime/dependency versions, platform/filesystem, test revision, checks run, pass/fail/skip counts, injected failure points, recovery generation used, security scan result, and unresolved risks. Never attach a real store, keys, tokens, financial payloads, or unredacted logs.

No test is considered passed merely because an implementation path was not exercised. Security-critical skips block the gate.
