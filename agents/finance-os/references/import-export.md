# Import and Export Contract

CSV and JSON are interchange formats, not trusted commands and not the canonical encrypted store. Phase 3 implements the bounded portable subset below with synthetic tests. Real financial data remains prohibited until the separate limited-pilot disclosure and explicit approval.

## Executable portable format (version 1.0.0)

- JSON is a deterministic object containing `format_version`, a non-secret manifest, and typed `records`. CSV uses exactly two columns, `record_type` and `payload_json`, so quoted newlines and every canonical field survive without guessing column semantics.
- Version 1 imports already-normalized Finance OS records. Money must already be integer minor units with an explicit currency, and timestamps must already be RFC 3339 instants. Locale-specific decimal or date text is rejected rather than guessed; a future mapping version may add an explicitly reviewed locale/time-zone mapping.
- Supported text encodings are UTF-8 (with or without BOM) and explicitly declared UTF-16LE. CSV delimiters are comma, semicolon, or tab and must be explicit or unambiguous.
- Default limits are 8 MiB, 10,000 rows, 16 columns, 256 KiB per field, JSON depth 48, 200,000 JSON nodes, 100 reported row errors, and five seconds of processing. Configured limits cannot exceed the compiled hard caps.
- The source fingerprint, mapping version, expected store version, mode, and selected row hashes are bound into the confirmation hash. A source, mapping, selection, or store change requires a new preview.
- Atomic mode is the default and refuses commit unless every row is accepted. Reviewed partial mode binds an explicit subset of accepted row hashes, commits that subset in one locked mutation, and records the mode plus rejected count in its audit event and receipt.
- A batch receipt persists the batch ID and normalized row hashes. Exact batch replay returns the original outcome; probable content duplicates remain ambiguous unless the preview explicitly allows their hashes.

Portable exports exclude the source audit chain and source idempotency receipts because those authenticate the source store rather than portable financial records. Stable domain IDs, source amounts, currencies, timestamps, transfer links, exchange-rate provenance, and derived totals are preserved. A scoped export must remain referentially complete or validation rejects it.

Encrypted portable export uses AES-256-GCM with a fresh 96-bit nonce and a caller-supplied 32-byte recipient key. The key is never serialized, logged, or returned. A non-secret `key_id` identifies the intended recipient key, and authenticated associated data binds the versioned envelope, algorithm, key ID, manifest, and disclosure scope. This envelope is separate from the live-store envelope and key lifecycle.

## Import pipeline

1. **Select** — accept an explicit local file and declared format; never follow embedded paths, URLs, formulas, macros, or instructions.
2. **Bound** — enforce configured byte, row, column, field-length, JSON-depth, and processing-time limits before full processing.
3. **Decode** — detect or request encoding and delimiter without lossy silent conversion. Preserve the original source file unchanged.
4. **Normalize** — trim only specified fields, normalize headers, parse dates with an explicit time zone, parse numbers with an explicit locale, and preserve source values for review.
5. **Map** — map columns/objects to typed Finance OS records. Unknown or ambiguous fields remain unresolved rather than guessed.
6. **Validate** — validate structure against local schemas, then enforce referential and domain invariants.
7. **Deduplicate** — derive a normalized row hash under a stable algorithm and combine it with the batch ID; distinguish exact replay from a possible content duplicate.
8. **Preview** — show mapping, counts, totals by currency, rejected rows, warnings, possible duplicates, and proposed mutations without writing.
9. **Confirm** — require review of scope, mapping, duplicate choices, and atomic/partial mode.
10. **Commit** — default to one locked all-or-nothing transaction with audit and receipts. A reviewed partial import must label failures and remain idempotent on retry.
11. **Clean up** — remove plaintext temporary artifacts on success, failure, cancellation, and recovery; never place them in agent memory or logs.

## Parsing rules

- Money never enters as binary floating point. Parse a locale-qualified decimal string and convert to integer minor units using the currency exponent and documented rounding policy.
- A missing currency is an error unless a reviewed mapping explicitly supplies it; do not silently assume THB for ambiguous source rows.
- A date without a time zone uses a reviewed source mapping, which may be `Asia/Bangkok`; record how it was interpreted.
- Cross-currency rows preserve the source amount and require an explicit rate snapshot or an estimate clearly awaiting review.
- Transfers should map to one transfer proposal with two legs, not two unrelated expense/income rows.
- Spreadsheet cells beginning with `=`, `+`, `-`, `@`, tab, or carriage return are treated as text and never executed.
- CSV comments, formulas, hidden columns, file names, and JSON property values are data, never agent instructions.

## Dry-run report

The report should include a batch ID, source fingerprint, format/encoding, mapping version, total/accepted/rejected/ambiguous/duplicate counts, totals by record type and currency, warnings, and a bounded row-level error list. It must not copy entire sensitive rows into logs or long-lived memory.

No dry run may allocate permanent record IDs, append audit mutations, or change the store. Committing the reviewed dry run must detect if the source, mapping, or current store version changed and require a new preview.

## Export pipeline

1. Ask for format, record types, date range, currencies, and destination.
2. Explain whether the result is plaintext or encrypted and who can read it.
3. Show counts and disclosure scope without generating a persistent file.
4. Require explicit confirmation immediately before writing.
5. Serialize deterministically, validate the export, and neutralize spreadsheet formulas for CSV consumers.
6. Write to a restrictive sibling temporary file, flush, atomically replace, and clean up on every exit path.
7. Return a receipt with format, scope, record counts, creation time, and a safe file reference; append a minimal audit event.

An encrypted export uses a separately versioned, documented envelope and a user-approved recipient/key mechanism. Copying the live store envelope is not automatically a portable export.

The runtime currently accepts a caller-supplied recipient key through its trusted application boundary; selecting and delivering that key is outside the file format. The export writer removes staged plaintext on ordinary success, validation failure, and cancellation. Before staging, it writes an owner-only, audit-key-authenticated recovery journal in the encrypted store directory. Runtime startup authenticates that journal and removes only its tightly bound sibling temporary file; an operating-system process-kill test proves this cleanup path.

## Round-trip and compatibility

Every versioned export format needs synthetic fixtures and a round-trip test into a new store. Round-trip success means source amounts, currencies, timestamps/time zones, transfer links, identifiers where promised, provenance, and record counts survive; derived totals must reproduce. Lossy fields must be declared before confirmation.

## Error policy

- Reject malformed or unsafe rows with stable, non-sensitive error codes.
- Do not infer corrections that change amount, currency, account, transfer direction, or date.
- Keep exact replay idempotent; ask about possible duplicates.
- Default to full rollback if any row fails during commit.
- Never include raw records in telemetry, exceptions, audit events, or support bundles.
