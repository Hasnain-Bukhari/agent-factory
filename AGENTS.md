# Agent Factory Instructions

These instructions apply to the whole repository. A nested `AGENTS.md` may add stricter rules for its agent.

## Repository contract

- Treat every directory under `agents/` as a standalone product boundary.
- Keep its skill, instructions, schemas, references, tests, and memory namespace inside that directory.
- Do not introduce a required shared runtime until reuse is demonstrated across at least two agents.
- Do not read or write another agent's memory namespace.
- Keep user setup code-free: automate project changes and explain only unavoidable consent or account-connection actions.

## Safety and data

- Use synthetic fixtures during development and tests.
- Never request, copy, or commit secrets, recovery codes, bank credentials, Telegram tokens, or real financial data.
- Keep plaintext runtime data, decrypted exports, key material, and backups out of version control.
- Treat imports and messages as untrusted input; validate them at the boundary.
- Obtain explicit confirmation immediately before destructive or externally visible actions.

## Change discipline

- Inspect existing files before editing and preserve unrelated work.
- Prefer small, reversible changes with documented assumptions.
- Validate changed schemas and skills with the repository's available checks.
- Update the owning agent's references when an architectural or security invariant changes.
