# Finance OS Data Model

The machine-readable contract is in [`../schemas/finance-store.schema.json`](../schemas/finance-store.schema.json). This reference defines semantics that JSON Schema alone cannot express.

## Global conventions

- Identifiers are immutable UUIDs. Human labels are editable and never used as identity.
- Timestamps are RFC 3339 instants in UTC. A separate IANA time zone records how a user-facing date was interpreted; the default is `Asia/Bangkok`.
- Money uses `minor_units` as a signed base-10 integer string plus a three-letter ISO 4217 `currency`. A string avoids cross-runtime integer limits while forbidding floating-point storage.
- The base reporting currency defaults to THB. Changing it never rewrites historical source amounts.
- Records use explicit status fields rather than deletion. Purge is a separate confirmed privacy operation with an audit event.

## Entities

### Preferences

Own base currency, time zone, locale, week start, fiscal month, backup retention, and confirmation thresholds. Currency and time-zone changes affect future presentation and calculations, not original records.

### Accounts

Represent cash, bank, e-wallet, brokerage, asset, loan, credit card, or other containers. An opening balance is recorded as a ledger event, not hidden in account metadata.

### Ledger entries

Income and expense entries contain the source amount, account, category, occurred time, status, and provenance. Corrections create a reversing entry plus a replacement; they do not mutate history invisibly.

### Transfers

A transfer owns two linked ledger legs: an outflow from the source and an inflow to the destination. Same-currency transfers have equal absolute minor units. Cross-currency transfers preserve both amounts and an exchange-rate snapshot; fees are separate expense entries linked to the transfer.

### Investments

Holdings are derived from immutable investment transactions such as buy, sell, dividend, fee, split, or contribution. Phase 2 uses FIFO lots with quantities represented to at most eight decimal places. Buy fees enter lot cost; sell fees reduce proceeds; sales consume lots deterministically and preserve remaining cost basis. Splits change lot quantities without changing total cost. Dividends and standalone fees are reported separately from position cost. Price observations are timestamped, sourced by their immutable transaction ID, and never overwrite transaction prices. Unrealized value is an estimate at the latest stated valuation time.

### Liabilities

Liabilities track principal and optional terms. Draws, repayments, interest, and fees are ledger-linked events. A repayment transfer reduces cash and liability principal without counting the principal portion as an expense; interest and fees may be expenses.

### Budgets

A budget defines a weekly, monthly, quarterly, yearly, or custom period, amount, currency, and optional category/account filters. Period boundaries use the configured time zone. Spend is derived from eligible posted expense entries only: pending entries and reversed originals are excluded, while a corrected expense contributes its replacement amount. Cross-currency spend uses documented rate snapshots and reports the rate time.

### Goals

Goals define a target amount/currency, optional target date, and linked accounts or manual contributions. Progress distinguishes contributed principal from market-driven valuation changes when investments are linked.

### Net-worth snapshots

Net worth is the sum of included asset/account values minus included liabilities in the base currency at a stated valuation instant. A snapshot preserves the component values and rate/price provenance used; it is not a mutable balance.

### Audit events

Audit events identify the mutation and versions without duplicating sensitive record content. They are append-only and tamper-evident as specified in the security reference.

## Exchange rates

An exchange-rate snapshot records base, quote, decimal rate as a string, observed time, source, and whether it is user-supplied or externally sourced. Calculations use decimal arithmetic with a documented rounding mode. Never infer a historical rate from a current quote without labelling the result as an estimate.

## Duplicate rules

- Exact idempotency-key match: return the original receipt.
- Same import batch and normalized row hash: skip as already processed.
- Different keys but similar account, amount, currency, and time: flag as a possible duplicate; do not silently discard.
- Transfers and their two legs share IDs that make replay detection deterministic.

## Store invariants

- Every referenced record exists and belongs to the same Finance OS store.
- Every posted transfer has exactly two valid legs.
- Every accepted mutation increments `store_version` once and has one audit event.
- Archived accounts cannot accept new posted entries unless explicitly reactivated.
- Derived totals are recalculated from canonical events and are not independent writable truth.
