# Phase 3 Interchange and MCP Runtime

## Scope and boundary

Phase 3 adds bounded portable CSV/JSON import and export plus a local MCP application boundary over the gate-passed encrypted core. It is synthetic-only. It does not connect ChatGPT, expose a public endpoint, authorize real data, or start Phase 4.

## Portable import and export

Portable format `1.0.0` accepts UTF-8 (with optional BOM) and declared UTF-16LE. JSON contains typed records; CSV has only `record_type` and `payload_json`, preserving canonical fields without locale guessing. Compiled byte, row, column, field, depth, node, error, and processing-time ceilings bound parsing. Structural and semantic validation precede a dry-run report. Confirmation binds source fingerprint, mapping version, expected store version, mode, selected row hashes, duplicate decisions, encoding, delimiter, and format. More than one preferences record is rejected explicitly; there is no last-row-wins merge.

Atomic commit is the default. Reviewed partial commit accepts only the exact selected hashes from the reviewed preview. Batch IDs and normalized row hashes make exact replay idempotent; probable content duplicates remain reviewable. Formula, prompt, URL, and path-like values stay inert data.

Exports require exact format, scope, destination, encryption choice, and fresh confirmation. Confirmation also binds the canonical parent path, device, and inode. Commit holds and rechecks a directory descriptor and rejects a parent symlink or directory-identity swap before writing or disclosure. CSV cells are spreadsheet-neutralized without changing canonical records. Plaintext and recipient-key AES-256-GCM outputs use restrictive sibling staging, file sync, atomic rename, directory sync, a non-secret manifest, and a minimal audit event. An owner-only, audit-key-authenticated cleanup journal is durable before plaintext staging. Startup authenticates the journal and removes only its bound sibling temporary artifact after a crash.

## MCP surface

The runtime uses lockfile-pinned `@modelcontextprotocol/sdk` 1.32.2 and Zod 4.6.7. It serves stateless JSON-response Streamable HTTP at `/mcp`, binds only `127.0.0.1`, rejects non-loopback Host and Origin values, and requires a live bearer credential on every request. Credentials come from an owner-only local file with a top-level `owner` store binding; each credential separately binds owner, client ID, scopes, and expiry. A credential for another owner is denied before MCP dispatch.

Four focused tools are exposed:

- `finance_get_overview` — bounded read-only counts and currency totals;
- `finance_list_accounts` — bounded page of minimal account metadata;
- `finance_propose_command` — validates a typed command and creates a short-lived, caller-bound proposal;
- `finance_commit_proposal` — commits only the exact confirmed proposal and returns the original receipt on replay.

There are no filesystem, raw store/query, key, encryption, import-path, or export-path tools. Strict input/output schemas and accurate annotations are advertised. Mutation idempotency derives from owner, client, stable source event ID, and command type. Proposal confirmation binds caller, hash, store version, and expiry. Body, input-element, page, proposal-count, request-rate, execution-time, and output-size limits fail closed with privacy-safe error codes. Tool work is cooperatively cancelled before side effects; commit stops timing out once atomic persistence begins, so a `TOOL_TIMEOUT` response can never be followed by a late mutation.

## Start boundary

`bin/finance-os-mcp.mjs` requires explicit `--data-dir` and `--credential-file` arguments and optionally accepts `--port`. It refuses unsupported hosts through the Phase 2 platform gate and never prints credentials or financial payloads. Phase 3 evidence uses only synthetic credentials and stores; no external ChatGPT connection was attempted.

See [`phase3-gate-report.md`](phase3-gate-report.md) for executable evidence and [`import-export.md`](import-export.md) for the interchange contract.
