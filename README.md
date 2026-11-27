# Agent Factory

Agent Factory is a repository for small, independent personal agents. Each agent is treated as its own product: it owns its instructions, implementation, configuration, tests, integrations, and private data boundary.

The repository currently contains **Finance OS**, an encrypted personal-finance agent that can be used from Codex on a Mac or through a private Telegram bot.

## Project principles

- Keep each agent independent under `agents/<agent-name>/`.
- Keep setup simple and automate everything except unavoidable account consent.
- Store secrets and private runtime data outside Git.
- Validate messages and imports before using them.
- Require explicit confirmation for destructive or externally visible actions.
- Use synthetic fixtures in development and tests.
- Add shared infrastructure only after two agents demonstrate the same stable need.

## Repository structure

```text
agent-factory/
├── AGENTS.md                 # Repository-wide engineering and safety rules
├── README.md                 # This project guide
└── agents/
    └── finance-os/
        ├── AGENTS.md         # Finance OS-specific implementation rules
        ├── SKILL.md          # Instructions Codex uses to operate Finance OS
        ├── README.md         # Complete user and operator guide
        ├── config.json       # Non-secret defaults
        ├── finance.mjs       # Command-line entry point
        ├── package.json
        ├── src/              # Finance, storage, and Telegram implementation
        ├── test/             # Synthetic automated tests
        └── memory/           # Private namespace; runtime contents are ignored
```

## Available agents

### Finance OS

[Finance OS](agents/finance-os/) is a local, single-user finance assistant with five focused capabilities:

- Income tracking
- Expense tracking and categorization
- Financial goals and allocations
- Monthly budgets
- Investment activity and valuations

It also supports summaries, corrections, preferences, encrypted backups, and an optional Telegram interface. Financial records are encrypted locally with AES-256-GCM, while the encryption key and Telegram credentials are held in macOS Keychain.

See the [Finance OS guide](agents/finance-os/README.md) for installation, Telegram setup, example requests, backups, deletion, troubleshooting, and limitations.

## Quick start

Requirements for the current agent:

- macOS
- Node.js 22 or later
- Codex or the ChatGPT desktop app with Codex enabled
- A ChatGPT/Codex login
- Telegram only if the optional bot interface is wanted

Initialize and test Finance OS:

```sh
cd agents/finance-os
node finance.mjs init
npm test
```

Open the repository in Codex and ask naturally, for example:

```text
Record an expense of 85 THB for coffee today.
Show my expenses this month by category.
Create an emergency-fund goal of 300,000 THB.
```

For Telegram usage, follow the [Telegram setup section](agents/finance-os/README.md#telegram-setup).

## Security and private data

Never commit any of the following:

- Telegram bot tokens
- OpenAI credentials or login files
- Encryption keys or recovery codes
- Decrypted exports or plaintext financial records
- Runtime data or private backups

The checked-in configuration contains only non-secret defaults. Finance OS runtime data is stored outside the repository by default at:

```text
~/Library/Application Support/Finance OS
```

The source can be kept in a private GitHub repository, but GitHub is not the runtime database and GitHub Actions is not a permanent host for the Telegram bot.

## Developing an existing agent

Before changing an agent:

1. Read the repository `AGENTS.md` and the agent's nested `AGENTS.md`.
2. Keep changes inside the owning agent directory.
3. Preserve unrelated work and existing private-data boundaries.
4. Use synthetic data for tests.
5. Run the agent's checks before considering the change complete.

For Finance OS:

```sh
cd agents/finance-os
npm test
```

## Adding another agent

1. Create `agents/<agent-name>/` using lowercase kebab-case.
2. Add a focused `SKILL.md`, an agent-specific `AGENTS.md`, and a practical `README.md`.
3. Keep its source, schemas, references, tests, integrations, and memory namespace inside its directory.
4. Define where its private runtime data and secrets live.
5. Add synthetic tests for its core behavior and safety boundaries.
6. Add it to the available-agents section in this README.

Do not introduce a central registry, shared runtime, orchestration layer, or scaffolding framework until real reuse across at least two agents makes it necessary.
