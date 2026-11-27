# Finance OS

Finance OS is a private, single-user personal-finance agent. It understands natural-language requests through Codex, stores records in one encrypted local data file, and can optionally receive requests through a Telegram bot.

It is intentionally focused on everyday personal finance rather than bookkeeping, tax accounting, or bank automation.

## Features

### Income

- Record income with amount, currency, date, source, category, and notes.
- Summarize income by month, year, source, or category.
- Keep different currencies separate.

Example requests:

```text
I received 50,000 THB salary today.
Show my income this year by source.
```

### Expenses

- Record an expense with amount, currency, date, description, category, payment method, and notes.
- Automatically categorize common expenses such as dining, groceries, transport, housing, health, utilities, entertainment, and shopping.
- Apply personal category rules stored in preferences.
- Summarize expenses by day, week, month, year, or category.
- Correct records by stable record ID.
- Delete individual records after review and confirmation.
- Delete all expenses through a separate exact-confirmation flow for a fresh start.

Example requests:

```text
Coffee was 85 baht today.
Show this month's expenses by category.
Change that coffee expense to 95 baht.
```

### Goals

- Create savings goals with a target amount, currency, optional target date, and notes.
- Record allocations toward a goal.
- Show allocated amount, remaining amount, and progress percentage.
- Keep goal allocations separate from income and expenses.

Example requests:

```text
Create an emergency-fund goal of 300,000 THB.
Allocate 10,000 THB to my emergency fund today.
Show progress on my goals.
```

### Budgets

- Create or update an overall monthly budget.
- Create category-specific monthly budgets.
- Compare actual expenses with the budget.
- Show spent, remaining, and utilization percentage.

Example requests:

```text
Set my December 2026 dining budget to 5,000 THB.
How much remains in this month's dining budget?
```

### Investments

- Record contributions, purchases, sales, withdrawals, dividends, valuations, and targets.
- Group activity by asset and currency.
- Calculate profit or loss only when both a cost basis and current valuation are available.
- Keep investment activity separate from ordinary living expenses.

Example requests:

```text
Record a 20,000 THB contribution to my index fund today.
The index fund is now valued at 21,500 THB.
Show my investment summary.
```

### Privacy and reliability

- AES-256-GCM authenticated encryption for the complete local store.
- Encryption keys and Telegram credentials stored in macOS Keychain.
- Atomic writes and a write lock to prevent partial or overlapping updates.
- Save verification before reporting success.
- Encrypted backup and restore support.
- Telegram access restricted to one numeric Telegram user ID.
- Duplicate Telegram update protection.
- No public webhook or inbound server port.

## How it works

```text
Codex desktop or Telegram message
                │
                ▼
      Codex interprets the request
                │
                ▼
   Finance OS validates a typed command
                │
                ▼
 Encrypted local store with verified writes
```

For Telegram, natural-language interpretation runs through `codex exec` using the existing ChatGPT/Codex login. No OpenAI API key is required. Each interpretation run is ephemeral, read-only, and constrained by `telegram-output.schema.json`.

## Requirements

- macOS
- Node.js 22 or later
- ChatGPT desktop with Codex, or a compatible Codex CLI installation
- An active ChatGPT/Codex login
- Internet access for Codex and Telegram
- A Telegram account and bot only when using the optional Telegram interface

Finance OS has no npm package dependencies.

The current storage implementation uses macOS Keychain, so Linux and cloud deployment are not supported without first adding a secure Linux secret-storage provider.

## Initial setup

From the repository root:

```sh
cd agents/finance-os
node finance.mjs init
npm test
```

Initialization creates the encrypted store and its encryption key. By default, runtime files are stored at:

```text
~/Library/Application Support/Finance OS
```

Use `FINANCE_OS_DATA_DIR` only for tests or an intentionally separate profile.

## Using Finance OS from Codex

Open the `agent-factory` repository in Codex. Finance OS is described by `SKILL.md`, which tells Codex how to translate natural-language finance requests into validated commands.

You can ask naturally:

```text
Record 250 THB for groceries today.
Show my expenses for November 2026.
Set my default currency to THB.
List my expense records.
Correct expense <record-id> to 275 THB.
```

Codex retrieves fresh data before answering. A write is successful only when Finance OS returns `"saved": true`.

## Telegram setup

### 1. Create a bot

In Telegram, open the official `@BotFather` account:

1. Send `/newbot`.
2. Choose a display name and a username ending in `bot`.
3. Copy the complete bot token supplied by BotFather.

The token resembles:

```text
1234567890:AAExampleLongSecretToken
```

Use the complete value without adding the word `bot`, quotes, or spaces. Never share or commit the real token.

### 2. Get your numeric Telegram user ID

1. Open the newly created bot and send it a message.
2. Retrieve the bot's pending updates from the Telegram Bot API.
3. Find `message.from.id` in the response. That number is the authorized user ID.

Treat the bot token in any Bot API URL or command as a secret. Do not save it in project files or share the response publicly.

### 3. Save credentials

Run:

```sh
npm run telegram:setup -- --user-id YOUR_NUMERIC_TELEGRAM_USER_ID
```

When macOS displays:

```text
password data for new item:
retype password for new item:
```

enter the Telegram bot token both times. This prompt is asking for the bot token, not the Mac login password.

Successful setup reports:

```text
Telegram credentials saved in macOS Keychain. Codex CLI login is ready.
```

To replace a previously saved bot token, add `--replace-token`:

```sh
npm run telegram:setup -- --user-id YOUR_NUMERIC_TELEGRAM_USER_ID --replace-token
```

### 4. Start and stop the bot

```sh
npm run telegram:start
npm run telegram:stop
```

After starting, send a clear message such as:

```text
Coffee 85 baht today
```

The bot replies with a confirmation and record ID after the encrypted write succeeds. Starting the process itself does not send a Telegram message.

The phone and Mac do not need to be on the same Wi-Fi network. Telegram relays messages through its cloud. The Mac must remain powered on, awake, online, signed into Codex, and within available Codex usage limits.

The bot does not currently start automatically after a reboot.

## Telegram examples

```text
I received 50,000 baht salary today.
Coffee cost 85 baht today.
Create a 300,000 baht emergency fund goal.
Allocate 10,000 baht to my emergency fund.
Set my food budget for this month to 8,000 baht.
Record a 20,000 baht index-fund contribution.
Show this month's expenses.
List my expenses.
```

If required information is missing, the bot asks a concise follow-up question rather than inventing it.

## Starting fresh with expenses

Bulk deletion has a dedicated confirmation flow:

1. Send `Delete all expenses` to the Telegram bot.
2. Review the number of expense records reported by the bot.
3. Send the exact confirmation phrase displayed by the bot:

```text
CONFIRM DELETE ALL EXPENSES
```

Finance OS creates an encrypted recovery backup and then deletes all expense records. Income, goals, budgets, investments, and preferences remain unchanged.

For an individual deletion, list expenses first, identify the stable record ID, and request deletion through Codex. Finance OS requires explicit confirmation immediately before deletion.

## Command-line reference

Run all commands from `agents/finance-os`.

### Initialize or verify access

```sh
node finance.mjs init
```

### List records

```sh
node finance.mjs list --type income
node finance.mjs list --type expense
node finance.mjs list --type goal
node finance.mjs list --type budget
node finance.mjs list --type investment
```

### Generate summaries

```sh
node finance.mjs summary --kind overview
node finance.mjs summary --kind income
node finance.mjs summary --kind expenses
node finance.mjs summary --kind goals
node finance.mjs summary --kind budgets --month 2026-11
node finance.mjs summary --kind investments
node finance.mjs summary --kind preferences
```

Income and expense summaries can be filtered with `--from YYYY-MM-DD` and `--to YYYY-MM-DD`.

### Apply a validated command

`finance.mjs apply` accepts one JSON command on standard input or through an input file:

```sh
node finance.mjs apply --input /path/to/command.json
```

The supported command shapes are documented in `SKILL.md`. Normal users should prefer natural-language requests through Codex or Telegram.

## Backups and recovery

Create an encrypted backup:

```sh
node finance.mjs backup --destination /path/to/backup-folder
```

Review the exact backup file and destination before restoring. Restore requires the explicit confirmation value:

```sh
node finance.mjs restore \
  --file /path/to/finance-os-....encrypted.json \
  --confirm RESTORE-FINANCE-OS
```

Backups remain encrypted and require the same Keychain encryption key. Keep a separate secure Mac backup that includes the Keychain. Losing the encryption key makes the encrypted store and backups unrecoverable.

## Data and security model

- Default currency: `THB`
- Default timezone: `Asia/Bangkok`
- Data file: `~/Library/Application Support/Finance OS/finance.encrypted.json`
- Telegram log: `~/Library/Application Support/Finance OS/telegram.log`
- Telegram process ID: `~/Library/Application Support/Finance OS/telegram.pid`
- Automatic deletion backups: `~/Library/Application Support/Finance OS/backups/`
- Encryption: AES-256-GCM with authenticated metadata
- Key storage: macOS Keychain service `finance-os`
- Telegram transport: outbound long polling

Finance OS never needs a public inbound port. Messages and imported text are treated as untrusted input. Only the configured numeric Telegram user ID is accepted.

Do not commit the runtime directory, encrypted backups, Telegram tokens, Codex login state, or decrypted financial exports.

## Troubleshooting

### The bot starts but does not reply

Check that:

- The Mac is awake and online.
- The bot was started after the latest code change.
- The Telegram message was sent from the configured user ID.
- Codex is signed in and has available usage.
- The bot token is current.

Restart the process:

```sh
npm run telegram:stop
npm run telegram:start
```

Then inspect the local log without sharing secrets:

```sh
tail -n 50 "$HOME/Library/Application Support/Finance OS/telegram.log"
```

### `spawnSync codex ENOENT`

The process could not locate Codex. The current implementation first checks the Codex executable bundled with the macOS ChatGPT app and otherwise uses `codex` from `PATH`. Ensure ChatGPT with Codex is installed or install a compatible Codex CLI and sign in.

### `Codex CLI is not logged in`

Open Codex and sign into ChatGPT, then run setup again:

```sh
npm run telegram:setup -- --user-id YOUR_NUMERIC_TELEGRAM_USER_ID
```

### `Finance OS encryption key is unavailable`

The encrypted store's key is missing from macOS Keychain or is inaccessible to the current user. Do not delete or replace the encrypted data file. Restore Keychain access or the original Keychain backup first.

### Telegram returns `result: []`

Send a new private text message to the bot and request updates again. Confirm that the token belongs to the same bot and that no other process is consuming its updates.

## Current limitations

Finance OS does not currently include:

- Bank or credit-card feeds
- Brokerage integrations or live market prices
- Receipt images, OCR, or voice messages
- Shared or multi-user accounts
- Tax preparation or double-entry accounting
- Currency conversion or exchange-rate lookup
- A graphical dashboard
- Automatic startup after a Mac reboot
- Native Linux or cloud secret storage

It is a personal tracking tool, not regulated financial, tax, legal, or investment advice.

## Development and verification

Run the test suite:

```sh
npm test
```

Tests use synthetic temporary data and cover:

- The five finance capabilities
- Encryption and incorrect-key rejection
- Backup and restore
- Concurrent write serialization
- Idempotent Telegram processing
- Unauthorized Telegram rejection
- Codex structured interpretation
- Confirmed bulk expense deletion with recovery backup

Keep all changes inside `agents/finance-os`, preserve encryption and locking invariants, and never use real financial records or credentials as development fixtures.
