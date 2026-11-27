# Finance OS

A local, single-user personal finance agent for income, expenses, goals, monthly budgets, and investments. Records are kept in one AES-256-GCM encrypted file; its key and integration credentials live in macOS Keychain.

## Codex

Ask Codex naturally, for example: “I spent 85 baht on coffee,” “save 300,000 baht for an emergency fund,” or “show this month’s expenses by category.” Codex follows [`SKILL.md`](SKILL.md) and uses `finance.mjs` against the local encrypted store.

The store defaults to `~/Library/Application Support/Finance OS`. Set `FINANCE_OS_DATA_DIR` only for tests or an intentional alternate profile.

## Backups

Create an encrypted backup with:

```sh
node finance.mjs backup --destination /path/to/backup-folder
```

Restore only after checking the target and explicitly confirming:

```sh
node finance.mjs restore --file /path/to/finance-os-....encrypted.json --confirm RESTORE-FINANCE-OS
```

The backup remains encrypted and requires the same Keychain key. Keep a separate Mac backup of the Keychain; losing the key makes the data unrecoverable.

## Telegram

Create a bot with BotFather and obtain your numeric Telegram user ID. Then run:

```sh
npm run telegram:setup -- --user-id YOUR_NUMERIC_ID
npm run telegram:start
npm run telegram:stop
```

Setup prompts securely for the bot token and an OpenAI API key and saves both in Keychain. Telegram uses long polling, so there is no public server or webhook. It sends message text plus a small set of relevant preferences/recent records to the OpenAI Responses API with storage disabled; this requires separate API billing and is not included with ChatGPT Plus. No API call is made until you complete setup and start the bot. The bot only accepts the configured Telegram user ID and records Telegram update IDs to prevent duplicate writes.

The bot does not respond while the Mac is asleep, offline, or stopped. Voice notes, receipt photos, bank feeds, brokerage feeds, tax accounting, and automatic market prices are not included.

## Maintenance

Requires Node.js 22 or later and has no package dependencies. Run `npm test` after changes.
