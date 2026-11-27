# Finance OS instructions

- Scope is limited to income, expenses, goals, budgets, investments, and confirmed preferences.
- Keep the encrypted local store authoritative and this agent independent of other agents.
- Use synthetic data in development and tests. Never commit financial data, credentials, tokens, or keys.
- Preserve integer minor units, source currencies, authenticated encryption, atomic writes, and write locking.
- Require confirmation before record deletion, restore, or external transmission. Never report a save before persistence verifies.
- Keep implementation and documentation small; do not add ledgers, MCP servers, dashboards, registries, migration frameworks, or enterprise accounting.
