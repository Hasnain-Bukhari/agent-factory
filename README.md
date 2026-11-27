# Agent Factory

This repository is a collection of standalone agents. Each agent owns its instructions, skill, domain references, schemas, and private memory namespace so it can be copied or developed without requiring a shared factory runtime.

## Repository layout

```text
agent-factory/
├── AGENTS.md
├── README.md
└── agents/
    └── <agent-name>/
        ├── AGENTS.md
        ├── SKILL.md
        ├── references/
        ├── schemas/
        └── memory/
```

The root defines lightweight conventions only. Agent-specific domain rules belong inside the agent folder. Shared code may be introduced later only when at least two agents need the same stable behavior; an agent must not depend on it merely to start.

## Agents

- [`finance-os`](agents/finance-os/) — Phase 2 gate-passed local encrypted core for a private, multicurrency personal-finance agent. Its [completion checklist](agents/finance-os/CHECKLIST.md) records executable evidence and the still-gated path to a limited real-data pilot, imports/exports, MCP, and external channels. The runtime remains synthetic-only until a separate disclosure and explicit pilot approval.

## Adding an agent

1. Create `agents/<agent-name>/` using lowercase kebab-case.
2. Give it an `AGENTS.md`, a discoverable `SKILL.md`, and its own `memory/` namespace.
3. Keep domain references and schemas local to that agent.
4. Document security boundaries and destructive actions before implementing them.
5. Test with synthetic data. Never commit secrets, credentials, or private user records.

The intended experience is zero manual coding for the user: Codex creates and maintains the files, runs checks, and later guides any required account connection or consent step.
