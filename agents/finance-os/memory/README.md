# Finance OS Memory Namespace

This directory defines the private Finance OS memory namespace. No other agent may read or write live memory stored here.

Phase 1 stores no user data. The committed files here are contracts only:

- [`CONTRACT.md`](CONTRACT.md) defines what may be remembered and its lifecycle.
- [`memory-record.schema.json`](memory-record.schema.json) defines a single future memory record.
- [`SYNTHETIC-EXAMPLES.md`](SYNTHETIC-EXAMPLES.md) demonstrates allowed and rejected records without real data.

Future live state must be encrypted, schema-versioned, atomically written, and ignored by version control. Key material belongs outside this directory, preferably in the operating-system key store. Canonical financial records, audit events, backups, raw conversations, credentials, and decrypted exports are not memory.
