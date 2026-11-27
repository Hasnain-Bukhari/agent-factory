# Agent Factory

This repository is a collection of independent local agents. Each agent owns its skill, implementation, configuration, tests, integrations, and private memory.

## Repository layout

```text
agent-factory/
├── AGENTS.md
├── README.md
└── agents/
    └── <agent-name>/
        ├── AGENTS.md
        ├── SKILL.md
        ├── README.md
        ├── src/
        └── memory/
```

The root defines lightweight conventions only. Agent-specific domain rules belong inside the agent folder. Shared code may be introduced later only when at least two agents need the same stable behavior; an agent must not depend on it merely to start.

## Agents

- [`finance-os`](agents/finance-os/) — a local encrypted personal-finance agent for income, expenses, goals, budgets, and investments, with optional Telegram long polling.

## Adding an agent

1. Create `agents/<agent-name>/` using lowercase kebab-case.
2. Give it a discoverable `SKILL.md`, short `README.md`, and its own `memory/` namespace.
3. Keep its implementation, configuration, integrations, and tests inside that directory.
4. Test with synthetic data. Never commit secrets, credentials, or private user records.

Do not add shared runtimes, registries, orchestration, or scaffolding until real reuse requires them.
