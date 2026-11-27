import { randomUUID } from 'node:crypto';
import { canonical, hmac, sha256, safeEqual } from './canonical.mjs';
import { assertCurrency, convertBetweenMinor, money } from './money.mjs';
import { fail } from './errors.mjs';
import { assertSchema } from './schema.mjs';

const now = () => new Date().toISOString();
const meta = (extra = {}) => ({ id: randomUUID(), created_at: now(), updated_at: now(), status: 'active', ...extra });

export function emptyStore(storeId = randomUUID()) {
  return {
    schema_version: '1.0.0', store_id: storeId, store_version: 0,
    preferences: { base_currency: 'THB', time_zone: 'Asia/Bangkok', locale: 'en-TH', week_starts_on: 'monday', fiscal_year_start_month: 1, backup_retention_generations: 7 },
    accounts: [], ledger_entries: [], transfers: [], investments: [], liabilities: [], budgets: [], goals: [], net_worth_snapshots: [], exchange_rates: [], audit_events: [], idempotency_receipts: []
  };
}

export function propose(store, command, { owner = 'default', actor = 'local-user', channel = 'local' } = {}) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) fail('INVALID_COMMAND', 'A typed command object is required.');
  if (!/^[a-z_]{3,80}$/.test(command.type || '')) fail('INVALID_COMMAND', 'The command type is invalid.');
  if (typeof command.idempotency_key !== 'string' || command.idempotency_key.length < 8) fail('INVALID_IDEMPOTENCY_KEY', 'An idempotency key of at least 8 characters is required.');
  const scope = `${owner}:${command.type}:${command.idempotency_key}`;
  const input_hash = sha256({ owner, command });
  const existing = store.idempotency_receipts.find(r => r.scope === scope || r.key === scope);
  if (existing) {
    if (!existing.input_hash || !safeEqual(existing.input_hash, input_hash)) fail('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for a different request.');
    return { status: 'already_applied', proposal_hash: existing.request_hash, receipt: structuredClone(existing) };
  }
  const normalized = normalizeCommand(store, command);
  const request_hash = sha256({ owner, command: normalized });
  const proposal_hash = sha256({ store_id: store.store_id, expected_version: store.store_version, owner, actor, channel, command: normalized });
  const likely_duplicates = findLikelyDuplicates(store, normalized);
  return { status: 'confirmation_required', proposal_hash, input_hash, expected_store_version: store.store_version, owner, actor, channel, command: normalized, summary: summarize(normalized), review: { likely_duplicate: likely_duplicates.length > 0, candidate_ids: likely_duplicates } };
}

function findLikelyDuplicates(store, command) {
  if (!['record_income', 'record_expense'].includes(command.type)) return [];
  const targetType = command.type === 'record_income' ? 'income' : 'expense';
  const at = Date.parse(command.occurred_at);
  return store.ledger_entries.filter(entry => entry.entry_type === targetType && entry.account_id === command.account_id && entry.amount.currency === command.amount.currency && entry.amount.minor_units === command.amount.minor_units && entry.category === command.category && Number.isFinite(at) && Math.abs(Date.parse(entry.occurred_at) - at) <= 72 * 60 * 60 * 1000).map(entry => entry.id);
}

function summarize(c) {
  const rate = c.exchange_rate ? {
    base_currency: c.exchange_rate.base_currency,
    quote_currency: c.exchange_rate.quote_currency,
    rate: c.exchange_rate.rate,
    observed_at: c.exchange_rate.observed_at || c.occurred_at || null,
    source: c.exchange_rate.source || 'user-confirmed',
    label: c.exchange_rate.is_estimate ? 'estimated' : 'recorded'
  } : null;
  return {
    action: c.type,
    amount: c.amount || c.source_amount || c.cash_amount || c.target || null,
    effective_at: c.occurred_at || c.valued_at || null,
    object_id: c.account_id || c.source_account_id || c.entry_id || c.liability_id || c.goal_id || c.id || null,
    destination_object_id: c.destination_account_id || null,
    exchange_rate: rate
  };
}

function normalizeCommand(store, c) {
  const out = structuredClone(c);
  out.occurred_at ??= now();
  const account = id => { const a = store.accounts.find(x => x.id === id && x.status === 'active'); if (!a) fail('ACCOUNT_NOT_FOUND', 'The active account was not found.'); return a; };
  const checkAmount = (v, currency) => { if (!v || typeof v.minor_units !== 'string') fail('INVALID_MONEY', 'An integer minor-unit amount is required.'); return money(v.minor_units, currency || v.currency); };
  switch (c.type) {
    case 'create_account': assertCurrency(c.currency); if (!c.name) fail('INVALID_ACCOUNT', 'Account name is required.'); if (c.opening_balance) out.opening_balance = checkAmount(c.opening_balance, c.currency); break;
    case 'archive_account': case 'reactivate_account': if(!store.accounts.some(x=>x.id===c.account_id))fail('ACCOUNT_NOT_FOUND','The account was not found.');break;
    case 'record_income': case 'record_expense': { const a = account(c.account_id); out.amount = checkAmount(c.amount, a.currency); const n = BigInt(out.amount.minor_units); if ((c.type === 'record_income' && n <= 0n) || (c.type === 'record_expense' && n >= 0n)) fail('INVALID_SIGN', 'The amount sign does not match the transaction type.'); out.posting_status ??= 'posted'; break; }
    case 'post_entry': case 'reverse_entry': case 'correct_entry': if (!store.ledger_entries.some(x => x.id === c.entry_id)) fail('ENTRY_NOT_FOUND', 'The ledger entry was not found.'); if (c.type === 'correct_entry') out.amount = checkAmount(c.amount, store.ledger_entries.find(x => x.id === c.entry_id).amount.currency); break;
    case 'create_transfer': { const from = account(c.source_account_id); const to = account(c.destination_account_id); if (from.id === to.id) fail('INVALID_TRANSFER', 'Transfer accounts must differ.'); out.source_amount = checkAmount(c.source_amount, from.currency); out.destination_amount = checkAmount(c.destination_amount, to.currency); if (BigInt(out.source_amount.minor_units) <= 0n || BigInt(out.destination_amount.minor_units) <= 0n) fail('INVALID_SIGN', 'Transfer amounts must be positive.'); if(from.currency===to.currency&&out.source_amount.minor_units!==out.destination_amount.minor_units)fail('UNBALANCED_TRANSFER','Same-currency transfer legs must match.'); if (from.currency !== to.currency) { if(!c.exchange_rate)fail('RATE_REQUIRED', 'A rate snapshot is required for a cross-currency transfer.'); if(c.exchange_rate.base_currency!==to.currency||c.exchange_rate.quote_currency!==from.currency)fail('RATE_DIRECTION','The rate direction must convert destination currency to source currency.'); const expected=convertBetweenMinor(out.destination_amount.minor_units,to.currency,from.currency,c.exchange_rate.rate);if(expected!==out.source_amount.minor_units)fail('RATE_MISMATCH','Transfer amounts do not match the confirmed rate and rounding rule.'); } if (c.fee) out.fee = checkAmount(c.fee, from.currency); break; }
    case 'record_investment': {
      const a = account(c.account_id); out.cash_amount = checkAmount(c.cash_amount, a.currency);
      if (!['buy','sell','dividend','fee','split','contribution','withdrawal','valuation'].includes(c.transaction_type)) fail('INVALID_INVESTMENT', 'Unsupported investment transaction.');
      if (!c.instrument_id || typeof c.instrument_id !== 'string') fail('INVALID_INVESTMENT', 'An instrument identifier is required.');
      if (c.quantity !== undefined) { decimalUnits(c.quantity); if (decimalUnits(c.quantity) <= 0n) fail('INVALID_QUANTITY', 'Investment quantity must be positive.'); }
      if (c.unit_price) { out.unit_price = checkAmount(c.unit_price, a.currency); if (BigInt(out.unit_price.minor_units) <= 0n) fail('INVALID_VALUATION', 'Unit price must be positive.'); }
      if (c.fee_amount) { out.fee_amount = checkAmount(c.fee_amount, a.currency); if (BigInt(out.fee_amount.minor_units) < 0n) fail('INVALID_INVESTMENT_FEE', 'Investment fee must be a non-negative amount.'); }
      const cash = BigInt(out.cash_amount.minor_units);
      if (['buy','sell'].includes(c.transaction_type) && (!c.quantity || !c.unit_price)) fail('INVALID_INVESTMENT', 'Buy and sell transactions require quantity and unit price.');
      if (c.transaction_type === 'buy' && cash >= 0n) fail('INVALID_SIGN', 'Investment buy cash must be negative.');
      if (['sell','dividend'].includes(c.transaction_type) && cash <= 0n) fail('INVALID_SIGN', 'Investment sale and dividend cash must be positive.');
      if (c.transaction_type === 'fee' && cash >= 0n) fail('INVALID_SIGN', 'Investment fee cash must be negative.');
      if (c.transaction_type === 'split' && (!c.quantity || cash !== 0n)) fail('INVALID_SPLIT', 'A split ratio and zero cash amount are required.');
      if (c.transaction_type === 'valuation' && (!c.unit_price || cash !== 0n)) fail('INVALID_VALUATION', 'A timestamped unit price and zero cash amount are required.');
      out.lot_method = 'fifo';
      break;
    }
    case 'create_liability': assertCurrency(c.currency); break;
    case 'record_liability_event': { const l = store.liabilities.find(x => x.id === c.liability_id && x.status === 'active'); if (!l) fail('LIABILITY_NOT_FOUND', 'The liability was not found.'); const a = account(c.account_id); if (a.currency !== l.currency) fail('CURRENCY_MISMATCH', 'Liability and account currencies differ.'); out.amount = checkAmount(c.amount, l.currency); if (!['draw','principal','interest','fee'].includes(c.event_type)) fail('INVALID_LIABILITY_EVENT', 'Unsupported liability event.'); break; }
    case 'repay_liability': { const l=store.liabilities.find(x=>x.id===c.liability_id&&x.status==='active');if(!l)fail('LIABILITY_NOT_FOUND','The liability was not found.');const a=account(c.account_id);if(a.currency!==l.currency)fail('CURRENCY_MISMATCH','Liability and account currencies differ.');out.amount=checkAmount(c.amount,l.currency);if(!c.allocation)fail('INVALID_ALLOCATION','Repayment allocation is required.');for(const k of ['principal','interest','fee'])out.allocation[k]=checkAmount(c.allocation[k],l.currency);const total=Object.values(out.allocation).reduce((n,x)=>n+BigInt(x.minor_units),0n);if(total!==BigInt(out.amount.minor_units))fail('INVALID_ALLOCATION','Repayment allocation must equal the payment.');break; }
    case 'create_budget': {
      out.limit = checkAmount(c.limit, c.limit?.currency);
      if (BigInt(out.limit.minor_units) <= 0n) fail('INVALID_BUDGET', 'Budget limit must be positive.');
      out.period ??= 'monthly'; out.categories ??= []; out.account_ids ??= [];
      if (!['weekly','monthly','quarterly','yearly','custom'].includes(out.period) || !/^\d{4}-\d{2}-\d{2}$/.test(c.starts_on || '')) fail('INVALID_BUDGET', 'Budget period and start date are required.');
      if (out.period === 'custom' && !/^\d{4}-\d{2}-\d{2}$/.test(c.ends_on || '')) fail('INVALID_BUDGET', 'A custom budget requires an end date.');
      if (c.ends_on && c.ends_on < c.starts_on) fail('INVALID_BUDGET', 'Budget end must not precede its start.');
      for (const id of out.account_ids) { const a = account(id); if (a.currency !== out.limit.currency) fail('CURRENCY_MISMATCH', 'Budget account and limit currencies differ.'); }
      break;
    }
    case 'create_goal': out.target = checkAmount(c.target, c.target?.currency); break;
    case 'record_goal_contribution': { const g=store.goals.find(x=>x.id===c.goal_id&&x.status==='active');if(!g)fail('GOAL_NOT_FOUND','The goal was not found.');const a=account(c.account_id);out.amount=checkAmount(c.amount,a.currency);break; }
    case 'create_net_worth_snapshot': if (!Array.isArray(c.components)) fail('INVALID_SNAPSHOT', 'Snapshot components are required.'); break;
    case 'update_preferences': if (c.changes?.base_currency) assertCurrency(c.changes.base_currency); break;
    default: fail('UNSUPPORTED_COMMAND', 'This command is not supported.');
  }
  return out;
}

export function commit(store, proposal, confirmationHash, auditKey) {
  if (proposal.status !== 'confirmation_required' || !safeEqual(proposal.proposal_hash, confirmationHash || '')) fail('CONFIRMATION_REQUIRED', 'Fresh confirmation of the exact proposal is required.');
  const scope=`${proposal.owner}:${proposal.command.type}:${proposal.command.idempotency_key}`; const prior=store.idempotency_receipts.find(r=>r.scope===scope||r.key===scope);
  if(prior){if(!proposal.input_hash||!prior.input_hash||!safeEqual(proposal.input_hash,prior.input_hash))fail('IDEMPOTENCY_CONFLICT','This idempotency key was already used for a different request.');return{store,receipt:structuredClone(prior),replayed:true};}
  if (proposal.expected_store_version !== store.store_version) fail('STALE_PROPOSAL', 'The store changed; review a new proposal.');
  const replay = propose(store, proposal.command, proposal);
  if (replay.status === 'already_applied') return { store, receipt: replay.receipt, replayed: true };
  if (!safeEqual(replay.proposal_hash, proposal.proposal_hash)) fail('STALE_PROPOSAL', 'The proposal no longer matches.');
  const beforeBalances = derive(store).account_balances;
  const next = structuredClone(store); const ids = apply(next, proposal.command);
  const oldVersion = next.store_version; next.store_version += 1;
  const at = now();
  const event = { id: randomUUID(), occurred_at: at, actor_ref: proposal.actor, channel: proposal.channel, action: proposal.command.type, target_ids: [...new Set(ids)], previous_store_version: oldVersion, new_store_version: next.store_version, idempotency_key: scope, outcome: 'accepted', previous_event_auth: auditPrevious(next.audit_events, auditKey), auth_algorithm: 'HMAC-SHA-256', key_version: 1 };
  event.event_auth = hmac(auditKey, auditPayload(event)); next.audit_events.push(event);
  const afterBalances = derive(next).account_balances;
  const balance_effects = next.accounts.flatMap(account => {
    const before = BigInt(beforeBalances[account.id] || '0'), after = BigInt(afterBalances[account.id] || '0');
    return before === after ? [] : [{ account_id: account.id, currency: account.currency, delta_minor_units: (after - before).toString() }];
  });
  const receipt = { key: scope, scope, command_type: proposal.command.type, accepted_at: at, result_ids: [...new Set(ids)], store_version: next.store_version, request_hash: sha256({ owner: proposal.owner, command: proposal.command }), input_hash: proposal.input_hash, status: 'accepted', audit_id: event.id, balance_effects };
  next.idempotency_receipts.push(receipt);
  assertSchema('store', next);
  return { store: next, receipt, replayed: false };
}

function auditPayload(e) { const x = structuredClone(e); delete x.event_auth; return x; }
function auditPrevious(events, key) { return events.length ? hmac(key, auditPayload(events.at(-1))) : 'GENESIS'; }
export function verifyAudit(store, auditKey) {
  if (store.audit_events.length !== store.store_version) return false;
  let previous = 'GENESIS';
  for (const e of store.audit_events) {
    if (e.previous_event_auth !== previous || !e.event_auth || !safeEqual(e.event_auth, hmac(auditKey, auditPayload(e)))) return false;
    previous = e.event_auth;
  }
  return true;
}

function apply(s, c) {
  const ids = []; let entrySequence=0; const mkEntry = e => { const x = meta({ posting_status: 'posted', source: 'system', ...e, idempotency_key: `${c.idempotency_key}:${e.entry_type}:${entrySequence++}` }); s.ledger_entries.push(x); ids.push(x.id); return x; };
  switch (c.type) {
    case 'create_account': { const a = meta({ name: c.name, account_type: c.account_type || 'bank', currency: c.currency, include_in_net_worth: c.include_in_net_worth !== false }); s.accounts.push(a); ids.push(a.id); if (c.opening_balance && BigInt(c.opening_balance.minor_units) !== 0n) mkEntry({ entry_type: 'adjustment', account_id: a.id, amount: c.opening_balance, category: 'Opening balance', occurred_at: c.occurred_at }); break; }
    case 'archive_account': case 'reactivate_account': { const a=s.accounts.find(x=>x.id===c.account_id);a.status=c.type==='archive_account'?'archived':'active';a.updated_at=now();ids.push(a.id);break; }
    case 'record_income': case 'record_expense': mkEntry({ entry_type: c.type === 'record_income' ? 'income' : 'expense', account_id: c.account_id, amount: c.amount, occurred_at: c.occurred_at, posting_status: c.posting_status, category: c.category, description: c.description }); break;
    case 'post_entry': { const e = s.ledger_entries.find(x => x.id === c.entry_id); if (e.posting_status !== 'pending') fail('INVALID_STATE', 'Only a pending entry can be posted.'); e.posting_status = 'posted'; e.updated_at = now(); ids.push(e.id); break; }
    case 'reverse_entry': { const old = s.ledger_entries.find(x => x.id === c.entry_id); if (s.ledger_entries.some(x => x.reverses_entry_id === old.id)) fail('ALREADY_REVERSED', 'The entry is already reversed.'); mkEntry({ entry_type: 'reversal', account_id: old.account_id, amount: money((-BigInt(old.amount.minor_units)).toString(), old.amount.currency), occurred_at: c.occurred_at, reverses_entry_id: old.id, category: old.category }); break; }
    case 'correct_entry': { const old = s.ledger_entries.find(x => x.id === c.entry_id); if (!s.ledger_entries.some(x => x.reverses_entry_id === old.id)) mkEntry({ entry_type: 'reversal', account_id: old.account_id, amount: money((-BigInt(old.amount.minor_units)).toString(), old.amount.currency), occurred_at: c.occurred_at, reverses_entry_id: old.id }); mkEntry({ entry_type: ['income','expense'].includes(old.entry_type) ? old.entry_type : 'adjustment', account_id: old.account_id, amount: c.amount, occurred_at: c.occurred_at, category: c.category || old.category }); break; }
    case 'create_transfer': { const t = meta({ source_account_id: c.source_account_id, destination_account_id: c.destination_account_id, source_amount: c.source_amount, destination_amount: c.destination_amount, occurred_at: c.occurred_at }); const out = mkEntry({ entry_type: 'transfer_out', account_id: c.source_account_id, amount: money((-BigInt(c.source_amount.minor_units)).toString(), c.source_amount.currency), occurred_at: c.occurred_at, transfer_id: t.id }); const into = mkEntry({ entry_type: 'transfer_in', account_id: c.destination_account_id, amount: c.destination_amount, occurred_at: c.occurred_at, transfer_id: t.id }); t.out_entry_id = out.id; t.in_entry_id = into.id; if (c.exchange_rate) { const r = { id: randomUUID(), base_currency: c.exchange_rate.base_currency, quote_currency: c.exchange_rate.quote_currency, rate: c.exchange_rate.rate, observed_at: c.exchange_rate.observed_at || c.occurred_at, source: c.exchange_rate.source || 'user-confirmed', is_estimate: !!c.exchange_rate.is_estimate }; s.exchange_rates.push(r); t.exchange_rate_id = r.id; } s.transfers.push(t); ids.push(t.id); if (c.fee && BigInt(c.fee.minor_units) > 0n) mkEntry({ entry_type: 'expense', account_id: c.source_account_id, amount: money((-BigInt(c.fee.minor_units)).toString(), c.fee.currency), occurred_at: c.occurred_at, category: 'Transfer fee' }); break; }
    case 'record_investment': { const x = meta({ account_id: c.account_id, instrument_id: c.instrument_id, transaction_type: c.transaction_type, quantity: c.quantity, cash_amount: c.cash_amount, unit_price: c.unit_price, fee_amount: c.fee_amount, lot_method: c.lot_method, occurred_at: c.occurred_at, idempotency_key: c.idempotency_key }); for (const key of Object.keys(x)) if (x[key] === undefined) delete x[key]; s.investments.push(x); ids.push(x.id); break; }
    case 'create_liability': { const x = meta({ name: c.name, liability_type: c.liability_type || 'other', currency: c.currency, include_in_net_worth: c.include_in_net_worth !== false, annual_interest_rate: c.annual_interest_rate, due_day: c.due_day }); s.liabilities.push(x); ids.push(x.id); break; }
    case 'record_liability_event': { const type = c.event_type === 'draw' ? 'liability_draw' : c.event_type === 'principal' ? 'liability_principal' : 'expense'; mkEntry({ entry_type: type, account_id: c.account_id, amount: c.amount, liability_id: c.liability_id, occurred_at: c.occurred_at, category: `Liability ${c.event_type}` }); break; }
    case 'repay_liability': for(const k of ['principal','interest','fee'])if(BigInt(c.allocation[k].minor_units)!==0n)mkEntry({entry_type:k==='principal'?'liability_principal':'expense',account_id:c.account_id,amount:c.allocation[k],liability_id:c.liability_id,occurred_at:c.occurred_at,category:`Liability ${k}`});break;
    case 'create_budget': { const x = meta({ name: c.name, period: c.period, limit: c.limit, starts_on: c.starts_on, ends_on: c.ends_on, categories: c.categories, account_ids: c.account_ids }); if (!x.ends_on) delete x.ends_on; s.budgets.push(x); ids.push(x.id); break; }
    case 'create_goal': { const x = meta({ name: c.name, goal_type: c.goal_type || 'savings', target: c.target, target_date: c.target_date, linked_account_ids: c.linked_account_ids || [], linked_liability_ids: c.linked_liability_ids || [] }); s.goals.push(x); ids.push(x.id); break; }
    case 'record_goal_contribution': mkEntry({entry_type:'adjustment',account_id:c.account_id,amount:c.amount,occurred_at:c.occurred_at,category:'Goal contribution',goal_id:c.goal_id});break;
    case 'create_net_worth_snapshot': { const base = s.preferences.base_currency; let assets = 0n, liabilities = 0n; for (const p of c.components) { const n = BigInt(p.base_value.minor_units); if (p.source_type === 'liability') liabilities += n; else assets += n; } const x = { id: randomUUID(), valued_at: c.valued_at || c.occurred_at, base_currency: base, assets: money(assets.toString(), base), liabilities: money(liabilities.toString(), base), net_worth: money((assets - liabilities).toString(), base), components: c.components }; s.net_worth_snapshots.push(x); ids.push(x.id); break; }
    case 'update_preferences': Object.assign(s.preferences, c.changes); ids.push(s.store_id); break;
  }
  return ids;
}

export function derive(store, { asOf = now() } = {}) {
  const accountBalances = Object.fromEntries(store.accounts.map(a => [a.id, store.ledger_entries.filter(e => e.account_id === a.id && e.posting_status === 'posted').reduce((n,e) => n + BigInt(e.amount.minor_units), 0n).toString()]));
  const localDate = dateInZone(asOf, store.preferences.time_zone);
  const budgets = store.budgets.map(b => {
    const range = budgetRange(b, localDate);
    const reversedIds = new Set(store.ledger_entries.filter(e => e.entry_type === 'reversal' && e.posting_status === 'posted').map(e => e.reverses_entry_id));
    const entries = range ? store.ledger_entries.filter(e => e.entry_type === 'expense' && e.posting_status === 'posted' && !reversedIds.has(e.id) && e.amount.currency === b.limit.currency && dateInZone(e.occurred_at, store.preferences.time_zone) >= range.start && dateInZone(e.occurred_at, store.preferences.time_zone) <= range.end && (!(b.categories || []).length || b.categories.includes(e.category)) && (!(b.account_ids || []).length || b.account_ids.includes(e.account_id))) : [];
    const spent = -entries.reduce((n,e) => n + BigInt(e.amount.minor_units), 0n);
    return { id: b.id, period_start: range?.start || null, period_end: range?.end || null, spent_minor_units: spent.toString(), remaining_minor_units: (BigInt(b.limit.minor_units) - spent).toString(), currency: b.limit.currency, eligible_entry_ids: entries.map(e => e.id) };
  });
  const goals = store.goals.map(g => ({ id: g.id, contributed_minor_units:store.ledger_entries.filter(e=>e.goal_id===g.id&&e.posting_status==='posted').reduce((n,e)=>n+BigInt(e.amount.minor_units),0n).toString(), valuation_progress_minor_units:(g.linked_account_ids||[]).reduce((n,id)=>n+BigInt(accountBalances[id]||0),0n).toString(),currency:g.target.currency }));
  const investment_positions = deriveInvestments(store);
  return { account_balances: accountBalances, budgets, goals, positions: Object.fromEntries(investment_positions.map(p => [`${p.account_id}:${p.instrument_id}`, p.quantity_units])), investment_positions };
}

const decimalUnits = text => { if (!/^-?\d+(?:\.\d{1,8})?$/.test(text)) fail('INVALID_QUANTITY', 'Quantity must use at most eight decimal places.'); const neg=text.startsWith('-'); const [w,f='']=(neg?text.slice(1):text).split('.'); const n=BigInt(w)*100000000n+BigInt((f+'00000000').slice(0,8)); return neg?-n:n; };

function roundedRatio(numerator, denominator) {
  if (denominator <= 0n) fail('INVALID_QUANTITY', 'Quantity divisor must be positive.');
  const quotient = numerator / denominator, remainder = numerator % denominator;
  return quotient + (remainder * 2n >= denominator ? 1n : 0n);
}

function deriveInvestments(store) {
  const groups = new Map();
  const sorted = [...store.investments].sort((a,b) => a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id));
  for (const tx of sorted) {
    const key = `${tx.account_id}:${tx.instrument_id}`;
    if (!groups.has(key)) groups.set(key, { account_id: tx.account_id, instrument_id: tx.instrument_id, currency: tx.cash_amount.currency, lots: [], realized: 0n, dividends: 0n, fees: 0n, valuation: null });
    const position = groups.get(key), cash = BigInt(tx.cash_amount.minor_units), fee = BigInt(tx.fee_amount?.minor_units || '0');
    if (tx.transaction_type === 'buy') position.lots.push({ acquired_at: tx.occurred_at, source_transaction_id: tx.id, quantity: decimalUnits(tx.quantity), cost: -cash + fee });
    if (tx.transaction_type === 'sell') {
      let remaining = decimalUnits(tx.quantity), saleQuantity = remaining, cost = 0n;
      const proceeds = cash - fee;
      for (const lot of position.lots) {
        if (remaining === 0n) break;
        const take = remaining < lot.quantity ? remaining : lot.quantity;
        const consumed = take === lot.quantity ? lot.cost : roundedRatio(lot.cost * take, lot.quantity);
        lot.quantity -= take; lot.cost -= consumed; remaining -= take; cost += consumed;
      }
      if (remaining !== 0n) fail('INSUFFICIENT_POSITION', `Sell ${tx.id} exceeds the available position.`);
      position.realized += proceeds - cost;
      if (saleQuantity === 0n) fail('INVALID_QUANTITY', 'Sell quantity must be positive.');
    }
    if (tx.transaction_type === 'split') { const ratio = decimalUnits(tx.quantity); for (const lot of position.lots) lot.quantity = roundedRatio(lot.quantity * ratio, 100000000n); }
    if (tx.transaction_type === 'dividend') position.dividends += cash;
    if (tx.transaction_type === 'fee') position.fees += -cash;
    if (tx.transaction_type === 'valuation') position.valuation = { unit_price: BigInt(tx.unit_price.minor_units), observed_at: tx.occurred_at, transaction_id: tx.id };
  }
  return [...groups.values()].map(position => {
    const quantity = position.lots.reduce((n,lot) => n + lot.quantity, 0n);
    const cost = position.lots.reduce((n,lot) => n + lot.cost, 0n);
    const market = position.valuation ? roundedRatio(quantity * position.valuation.unit_price, 100000000n) : null;
    return { account_id: position.account_id, instrument_id: position.instrument_id, currency: position.currency, lot_method: 'fifo', quantity_units: quantity.toString(), cost_basis_minor_units: cost.toString(), realized_gain_minor_units: position.realized.toString(), dividends_minor_units: position.dividends.toString(), fees_minor_units: position.fees.toString(), valuation: position.valuation ? { unit_price_minor_units: position.valuation.unit_price.toString(), observed_at: position.valuation.observed_at, source_transaction_id: position.valuation.transaction_id, market_value_minor_units: market.toString(), unrealized_gain_minor_units: (market - cost).toString() } : null, lots: position.lots.filter(lot => lot.quantity > 0n).map(lot => ({ acquired_at: lot.acquired_at, source_transaction_id: lot.source_transaction_id, quantity_units: lot.quantity.toString(), remaining_cost_minor_units: lot.cost.toString() })) };
  });
}

const dateText = date => date.toISOString().slice(0, 10);
function dateInZone(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date(instant));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
const parseDate = text => { const [y,m,d] = text.split('-').map(Number); return new Date(Date.UTC(y,m-1,d)); };
const addDays = (text, days) => { const date=parseDate(text); date.setUTCDate(date.getUTCDate()+days); return dateText(date); };
function addMonths(text, months) { const source=parseDate(text), day=source.getUTCDate(); const first=new Date(Date.UTC(source.getUTCFullYear(),source.getUTCMonth()+months,1)); const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate(); first.setUTCDate(Math.min(day,last)); return dateText(first); }
function budgetRange(budget, localDate) {
  if (localDate < budget.starts_on) return null;
  if (budget.period === 'custom') return localDate <= budget.ends_on ? { start:budget.starts_on,end:budget.ends_on } : null;
  const step = budget.period === 'weekly' ? x => addDays(x,7) : budget.period === 'monthly' ? x => addMonths(x,1) : budget.period === 'quarterly' ? x => addMonths(x,3) : x => addMonths(x,12);
  let start=budget.starts_on, next=step(start);
  while (localDate >= next) { start=next; next=step(start); }
  return { start, end:addDays(next,-1) };
}
