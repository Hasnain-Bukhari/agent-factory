---
name: finance-os
description: Use for personal income, expenses, financial goals, monthly budgets, investments, or Finance OS preferences. The local encrypted store is authoritative; do not use it for unrelated accounting or regulated financial advice.
---

# Finance OS

Use the local Finance OS for five capabilities only: income, expenses, goals, budgets, and investments. Defaults are THB and Asia/Bangkok. Other currencies remain separate; never add unlike currencies together.

## Work with the store

Run commands from this directory with `node finance.mjs`. Initialize or verify access with `node finance.mjs init`. For a write, construct one JSON command, start `node finance.mjs apply`, send the JSON on standard input, and close standard input. Report success only when the command returns `"saved": true`.

Command shapes:

- Income: `{"type":"record_income","data":{"amount":"50000","currency":"THB","date":"2026-11-27","source":"Salary","category":"salary","notes":""}}`
- Expense: `{"type":"record_expense","data":{"amount":"85","currency":"THB","date":"2026-11-27","description":"Coffee","category":null,"payment_method":"","notes":""}}`
- Goal: `{"type":"create_goal","data":{"name":"Emergency fund","target_amount":"300000","currency":"THB","target_date":null}}`
- Goal progress: `{"type":"allocate_goal","data":{"goal_id":"...","amount":"10000","date":"2026-11-27"}}`
- Budget: `{"type":"create_budget","data":{"amount":"20000","currency":"THB","month":"2026-11","category":null}}`
- Investment: `{"type":"record_investment","data":{"action":"contribution|purchase|sale|withdrawal|dividend|valuation|target","asset":"Index fund","amount":"20000","currency":"THB","date":"2026-11-27"}}`
- Correct: `{"type":"update_record","data":{"record_type":"expense","id":"...","changes":{"amount":"95","category":"dining"}}}`
- Delete: `{"type":"delete_record","data":{"record_type":"expense","id":"..."}}`
- Preference: `{"type":"set_preference","data":{"key":"currency|timezone|category_rules","value":"..."}}`

Use `node finance.mjs list --type income|expense|goal|budget|investment` to find record IDs. Use `node finance.mjs summary --kind overview|income|expenses|goals|budgets|investments|preferences`, optionally with `--from`, `--to`, or `--month`.

## Interpret requests

- Classify ordinary earnings as income and ordinary consumption as expenses. Expense category rules in preferences take priority; otherwise use the built-in simple classifier.
- Goal allocations are progress, never income or expenses.
- Investment purchases, sales, contributions, withdrawals, dividends, valuations, and targets are investment records, not living expenses. Do not invent profit when valuation or basis is missing.
- Ask only when a required amount, date, source/object, currency, or correction target cannot be resolved. Use the confirmed defaults otherwise.
- For corrections, retrieve the record first and update by stable ID. Ask for explicit confirmation immediately before deletion, backup restoration, or any externally visible action.
- Remember only confirmed currency, timezone, or category rules as preferences. Conversation history is not authoritative memory.

## Summaries and charts

Retrieve fresh data before answering. Label the period and currency, show tables when useful, and generate an on-demand chart from returned summary data when the interface supports it. Never combine different currencies without an explicitly supplied conversion rate.

If storage, validation, authentication, or locking fails, say the record was not saved and show the concise error. Do not work around encryption or write plaintext financial data.
