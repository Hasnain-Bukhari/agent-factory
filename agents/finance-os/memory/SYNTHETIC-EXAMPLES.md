# Synthetic Memory Examples

These examples are fictional and are not runtime state.

## Allowed after confirmation

- Preference: base currency `THB`, time zone `Asia/Bangkok`, with the purpose “render future reports consistently.”
- Alias: “daily wallet” points to a synthetic account UUID; the mutable account label is not copied into memory.
- Categorization rule: when a synthetic payee pattern matches, propose category UUID `11111111-1111-4111-8111-111111111111`; a user still reviews the transaction proposal.
- Import mapping: a reviewed column mapping for a fictional bank CSV format, with no imported rows retained.
- Workflow checkpoint: an opaque import-review ID expiring in 24 hours, with no raw row values.

## Reject or route elsewhere

- “Remember my bank password” — reject; credentials never enter Finance OS memory.
- “Remember every message I send” — reject; raw conversations are not memory.
- “Remember that I spent THB 850” — route the confirmed transaction to the canonical encrypted ledger, not memory.
- “The model thinks this is rent, remember that automatically” — reject until the user reviews and confirms a categorization rule.
- Telegram bot token or MCP credential — route to the platform secret store in a later integration phase.
- Current account balance or portfolio value — derive from the canonical store and cited valuations; do not duplicate it in memory.
