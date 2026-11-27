# Phase 3 Gate Report — 2026-11-27

## Result

**Passed on the supported host; no unresolved Phase 3 blocker.** Bounded portable interchange and the authenticated loopback MCP surface satisfy the synthetic Phase 3 gate. Phase 2 remains green. This report does not authorize real financial data, an external ChatGPT connection, public MCP exposure, Telegram, a dashboard, or Phase 4. No real data, live credential, or external channel was used.

## Environment and dependencies

- Host/runtime: supported Apple-silicon macOS host, Node.js 22.16.0, OpenSSL 3.0.16.
- Direct dependencies: lockfile-pinned Ajv 8.20.0, `@modelcontextprotocol/sdk` 1.32.2, and Zod 4.6.7.
- Direct dependency licenses: MIT for Ajv, the MCP SDK, and Zod; no copyleft or source-disclosure obligation was introduced by the direct dependency set.
- `npm audit --audit-level=low`: 0 vulnerabilities.
- `npm ls --all --omit=optional`: installed required tree matches the lockfile; the SDK's platform-specific `@cfworker/json-schema` remains an unmet optional dependency and is not used on this host.
- Official OpenAI MCP build guidance was rechecked: the implementation uses the official SDK, Streamable HTTP `/mcp`, explicit input/output schemas, structured content, annotations matching behavior, and server-side authentication/authorization.

## Automated evidence

- Full host suite with the temporary macOS Keychain lifecycle enabled: 63 passed, 0 failed, 0 skipped.
- All 47 original Phase 2 tests remain represented and green; Phase 3 adds 16 interchange/MCP tests.
- Six Draft 2020-12 schemas compile under locked Ajv; six positive fixtures pass; the expected duplicate-ID semantic fixture is rejected.
- Independent dependency-light schema/fixture validation passes: 6 schemas, 6 positive fixtures, 1 expected-negative fixture.
- Runtime/module syntax, local Markdown links, credential/private-key signatures, and sensitive-artifact checks pass.
- Agent-driven install, doctor, synthetic initialize, startup recovery, health, stop, current-version upgrade, and confirmed synthetic uninstall complete without leaving the lifecycle directory.

## Import/export closure

- Deterministic UTF-8/BOM and UTF-16LE decoding, delimiter handling, quoted newlines, malformed encoding, schema-invalid rows, byte/field/depth bounds, source/store drift, exact replay, possible duplicates, atomic rollback, reviewed partial selection, and explicit rejection of multiple preferences rows are covered.
- Transfer legs, source amounts, multiple currencies, exchange-rate provenance, stable IDs, inert formula/path/prompt text, and derived balances survive plaintext JSON and encrypted CSV round trips into fresh synthetic stores.
- Plaintext disclosure and recipient-key encrypted exports use exact confirmation, canonical parent path/device/inode plus an open-directory descriptor binding, restrictive atomic writes, non-secret manifests, minimum audit metadata, and spreadsheet neutralization. A parent symlink swap after review fails closed.
- Ordinary success, cancellation, validation failure, and a real operating-system process kill after plaintext staging leave no decrypted temporary artifact after authenticated recovery.

## MCP closure

- The official MCP client initializes the Streamable HTTP endpoint, discovers exactly four focused tools, and verifies strict input/output schemas and annotations.
- Live bearer authentication and owner/scope authorization are enforced on every request. The configured store owner is distinct from credential identity, and a different authenticated owner is denied before reads, proposals, or commits. Expired/missing credentials, hostile Origin/Host values, malformed and over-broad inputs, and wrong callers fail closed.
- Reads return bounded minimum structured output. There are no raw filesystem, datastore, query, key, crypto, import-path, or export-path tools.
- Mutations use typed propose/commit separation. Proposals bind owner, client, stable source event ID, command type, exact hash, expected store version, and expiry. Wrong-hash/caller and expired proposals fail; accepted replay returns the original receipt without a second audit event.
- Prompt-injection text remains inert record content. Body, element, page, proposal-count, rate, execution-time, and output-size limits return privacy-safe bounded errors. Commit timeout applies only before persistence begins: a reported timeout cannot later mutate, while an entered atomic mutation is awaited to its real receipt.

## Residual boundaries

1. Phase 4 has not started; no external ChatGPT connection or public deployment was attempted.
2. MCP credentials are local bearer credentials in an owner-only file. Any future non-loopback/public deployment requires a separately reviewed OAuth 2.1/mTLS architecture and a new gate.
3. Real data still requires the separate limited-pilot disclosure, backup choice, and fresh explicit approval already required by the Phase 2 gate.
4. Portable encrypted export requires a caller-approved recipient-key delivery mechanism; key selection and delivery remain outside the file format and MCP surface.
