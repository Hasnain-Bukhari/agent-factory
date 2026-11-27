import { randomUUID } from 'node:crypto';

const COLLECTIONS = { income: 'incomes', expense: 'expenses', goal: 'goals', budget: 'budgets', investment: 'investments' };
const EXPENSE_KEYWORDS = {
  housing: ['rent', 'mortgage'], groceries: ['grocery', 'groceries', 'supermarket'], dining: ['coffee', 'cafe', 'restaurant', 'lunch', 'dinner'],
  transport: ['taxi', 'grab', 'fuel', 'petrol', 'train', 'bus'], health: ['doctor', 'hospital', 'medicine', 'pharmacy'],
  utilities: ['electric', 'water', 'internet', 'phone'], entertainment: ['movie', 'game', 'concert'], shopping: ['clothes', 'equipment', 'shopping']
};

const now = () => new Date().toISOString();
const dateOnly = value => {
  const text = String(value || '').slice(0, 10);
  const parsed = new Date(`${text}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== text) throw new Error('A valid date in YYYY-MM-DD format is required.');
  return text;
};
const currency = value => {
  const text = String(value || '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(text)) throw new Error('A three-letter currency code is required.');
  return text;
};
const exponent = code => ['JPY', 'KRW', 'VND'].includes(code) ? 0 : ['BHD', 'KWD', 'OMR'].includes(code) ? 3 : 2;

export function toMinor(value, code) {
  const places = exponent(currency(code));
  const text = String(value).trim().replaceAll(',', '');
  const match = text.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match || (match[3]?.length || 0) > places) throw new Error(`Amount must have at most ${places} decimal places for ${code}.`);
  const fraction = (match[3] || '').padEnd(places, '0');
  return `${match[1]}${BigInt(match[2]) * (10n ** BigInt(places)) + BigInt(fraction || '0')}`;
}

export function fromMinor(value, code) {
  const places = exponent(code), n = BigInt(value), sign = n < 0n ? '-' : '', abs = n < 0n ? -n : n, factor = 10n ** BigInt(places);
  return places ? `${sign}${abs / factor}.${(abs % factor).toString().padStart(places, '0')}` : `${sign}${abs}`;
}

function positiveAmount(data, fallbackCurrency) {
  const code = currency(data.currency || fallbackCurrency), amount_minor = toMinor(data.amount, code);
  if (BigInt(amount_minor) <= 0n) throw new Error('Amount must be greater than zero.');
  return { amount_minor, currency: code };
}
function metadata() { const at = now(); return { id: randomUUID(), created_at: at, updated_at: at }; }
function required(value, name) { const text = String(value || '').trim(); if (!text) throw new Error(`${name} is required.`); return text; }

export function categorizeExpense(description, preferences = {}) {
  const text = String(description || '').toLowerCase();
  for (const [needle, category] of Object.entries(preferences.category_rules || {})) if (text.includes(needle.toLowerCase())) return category;
  for (const [category, words] of Object.entries(EXPENSE_KEYWORDS)) if (words.some(word => text.includes(word))) return category;
  return 'other';
}

function recordIncome(store, data) {
  const money = positiveAmount(data, store.preferences.currency);
  const record = { ...metadata(), ...money, date: dateOnly(data.date), source: required(data.source, 'Income source'), category: data.category || 'other', notes: data.notes || '' };
  store.incomes.push(record); return record;
}
function recordExpense(store, data) {
  const money = positiveAmount(data, store.preferences.currency), description = required(data.description || data.merchant, 'Expense description');
  const record = { ...metadata(), ...money, date: dateOnly(data.date), description, category: data.category || categorizeExpense(description, store.preferences), payment_method: data.payment_method || '', notes: data.notes || '' };
  store.expenses.push(record); return record;
}
function createGoal(store, data) {
  const code = currency(data.currency || store.preferences.currency), target_minor = toMinor(data.target_amount, code);
  if (BigInt(target_minor) <= 0n) throw new Error('Goal target must be greater than zero.');
  const record = { ...metadata(), name: required(data.name, 'Goal name'), target_minor, currency: code, target_date: data.target_date ? dateOnly(data.target_date) : null, allocations: [], notes: data.notes || '' };
  store.goals.push(record); return record;
}
function allocateGoal(store, data) {
  const goal = store.goals.find(item => item.id === data.goal_id); if (!goal) throw new Error('Goal not found.');
  const amount_minor = toMinor(data.amount, goal.currency); if (BigInt(amount_minor) <= 0n) throw new Error('Allocation must be greater than zero.');
  const allocation = { id: randomUUID(), amount_minor, date: dateOnly(data.date), notes: data.notes || '' };
  goal.allocations.push(allocation); goal.updated_at = now(); return { goal_id: goal.id, ...allocation };
}
function createBudget(store, data) {
  const money = positiveAmount(data, store.preferences.currency), month = String(data.month || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Budget month must use YYYY-MM.');
  const category = data.category || null;
  const existing = store.budgets.find(item => item.month === month && item.category === category && item.currency === money.currency);
  if (existing) { existing.limit_minor = money.amount_minor; existing.updated_at = now(); return existing; }
  const record = { ...metadata(), month, category, limit_minor: money.amount_minor, currency: money.currency };
  store.budgets.push(record); return record;
}
function recordInvestment(store, data) {
  const allowed = ['contribution', 'purchase', 'sale', 'withdrawal', 'dividend', 'valuation', 'target'];
  if (!allowed.includes(data.action)) throw new Error(`Investment action must be one of: ${allowed.join(', ')}.`);
  const money = positiveAmount(data, store.preferences.currency);
  const record = { ...metadata(), ...money, date: dateOnly(data.date), action: data.action, asset: required(data.asset, 'Investment asset'), quantity: data.quantity == null ? null : String(data.quantity), notes: data.notes || '' };
  store.investments.push(record); return record;
}

export function applyCommand(store, command) {
  if (!command || typeof command !== 'object') throw new Error('A Finance OS command is required.');
  if (command.idempotency_key) {
    const previous = store.processed_messages.find(item => item.key === command.idempotency_key);
    if (previous) return { ...previous.receipt, duplicate: true };
  }
  let result;
  switch (command.type) {
    case 'record_income': result = recordIncome(store, command.data || {}); break;
    case 'record_expense': result = recordExpense(store, command.data || {}); break;
    case 'create_goal': result = createGoal(store, command.data || {}); break;
    case 'allocate_goal': result = allocateGoal(store, command.data || {}); break;
    case 'create_budget': result = createBudget(store, command.data || {}); break;
    case 'record_investment': result = recordInvestment(store, command.data || {}); break;
    case 'set_preference': {
      const key = required(command.data?.key, 'Preference key');
      if (!['currency', 'timezone', 'category_rules'].includes(key)) throw new Error('Unsupported preference.');
      let value = command.data.value;
      if (key === 'currency') value = currency(value);
      if (key === 'timezone') { try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); } catch { throw new Error('A valid IANA timezone is required.'); } }
      if (key === 'category_rules' && (!value || typeof value !== 'object' || Array.isArray(value))) throw new Error('Category rules must be an object mapping text to category names.');
      store.preferences[key] = value; result = { key, value }; break;
    }
    case 'update_record': result = updateRecord(store, command.data || {}); break;
    case 'delete_record': result = deleteRecord(store, command.data || {}); break;
    case 'delete_all_expenses': {
      const deleted = store.expenses.length;
      store.expenses = [];
      result = { deleted, record_type: 'expense' };
      break;
    }
    default: throw new Error('Unsupported Finance OS command.');
  }
  const receipt = { saved: true, type: command.type, result };
  if (command.idempotency_key) {
    store.processed_messages.push({ key: command.idempotency_key, receipt, processed_at: now() });
    if (store.processed_messages.length > 1000) store.processed_messages.splice(0, store.processed_messages.length - 1000);
  }
  return receipt;
}

function collection(store, type) { const name = COLLECTIONS[type]; if (!name) throw new Error('Unknown record type.'); return store[name]; }
function updateRecord(store, data) {
  const list = collection(store, data.record_type), record = list.find(item => item.id === data.id); if (!record) throw new Error('Record not found.');
  const changes = { ...(data.changes || {}) }; delete changes.id; delete changes.created_at;
  const allowed = {
    income: ['amount', 'currency', 'date', 'source', 'category', 'notes'], expense: ['amount', 'currency', 'date', 'description', 'category', 'payment_method', 'notes'],
    goal: ['name', 'target_amount', 'currency', 'target_date', 'notes'], budget: ['limit', 'currency', 'month', 'category'],
    investment: ['amount', 'currency', 'date', 'action', 'asset', 'quantity', 'notes']
  }[data.record_type];
  for (const key of Object.keys(changes)) if (!allowed.includes(key)) throw new Error(`Field ${key} cannot be changed on this record.`);
  if ('currency' in changes && !('amount' in changes || 'target_amount' in changes || 'limit' in changes)) throw new Error('Changing currency also requires a replacement amount.');
  if ('currency' in changes) changes.currency = currency(changes.currency);
  if ('date' in changes) changes.date = dateOnly(changes.date);
  if ('target_date' in changes && changes.target_date) changes.target_date = dateOnly(changes.target_date);
  if ('month' in changes && !/^\d{4}-(0[1-9]|1[0-2])$/.test(changes.month)) throw new Error('Budget month must use YYYY-MM.');
  if ('amount' in changes) { changes.amount_minor = toMinor(changes.amount, changes.currency || record.currency); if (BigInt(changes.amount_minor) <= 0n) throw new Error('Amount must be greater than zero.'); delete changes.amount; }
  if ('target_amount' in changes) { changes.target_minor = toMinor(changes.target_amount, changes.currency || record.currency); if (BigInt(changes.target_minor) <= 0n) throw new Error('Goal target must be greater than zero.'); delete changes.target_amount; }
  if ('limit' in changes) { changes.limit_minor = toMinor(changes.limit, changes.currency || record.currency); if (BigInt(changes.limit_minor) <= 0n) throw new Error('Budget limit must be greater than zero.'); delete changes.limit; }
  if ('action' in changes && !['contribution', 'purchase', 'sale', 'withdrawal', 'dividend', 'valuation', 'target'].includes(changes.action)) throw new Error('Invalid investment action.');
  Object.assign(record, changes, { updated_at: now() }); return record;
}
function deleteRecord(store, data) {
  const list = collection(store, data.record_type), index = list.findIndex(item => item.id === data.id); if (index < 0) throw new Error('Record not found.');
  const [removed] = list.splice(index, 1); return { id: removed.id, deleted: true };
}

const inRange = (date, from, to) => (!from || date >= from) && (!to || date <= to);
const totals = (records, field = 'amount_minor') => Object.fromEntries([...records.reduce((map, item) => map.set(item.currency, (map.get(item.currency) || 0n) + BigInt(item[field])), new Map())].map(([code, value]) => [code, { amount_minor: value.toString(), amount: fromMinor(value, code) }]));

export function summarize(store, kind = 'overview', options = {}) {
  const from = options.from ? dateOnly(options.from) : null, to = options.to ? dateOnly(options.to) : null;
  if (kind === 'income') {
    const records = store.incomes.filter(item => inRange(item.date, from, to)); return { kind, totals: totals(records), records, by_month: periodTotals(records, 7), by_year: periodTotals(records, 4), by_source: groupTotals(records, 'source'), by_category: groupTotals(records, 'category') };
  }
  if (kind === 'expenses') {
    const records = store.expenses.filter(item => inRange(item.date, from, to)); return { kind, totals: totals(records), records, by_day: periodTotals(records, 10), by_week: periodTotals(records, isoWeek), by_month: periodTotals(records, 7), by_year: periodTotals(records, 4), by_category: groupTotals(records, 'category') };
  }
  if (kind === 'goals') return { kind, goals: store.goals.map(goal => { const allocated = goal.allocations.reduce((sum, item) => sum + BigInt(item.amount_minor), 0n); return { ...goal, allocated_minor: allocated.toString(), allocated: fromMinor(allocated, goal.currency), remaining_minor: (BigInt(goal.target_minor) - allocated).toString(), remaining: fromMinor(BigInt(goal.target_minor) - allocated, goal.currency), utilization: Number(allocated * 10000n / BigInt(goal.target_minor)) / 100 }; }) };
  if (kind === 'budgets') return budgetSummary(store, options.month);
  if (kind === 'investments') return investmentSummary(store);
  if (kind === 'preferences') return { kind, preferences: store.preferences };
  return { kind: 'overview', income: totals(store.incomes.filter(item => inRange(item.date, from, to))), expenses: totals(store.expenses.filter(item => inRange(item.date, from, to))), goals: summarize(store, 'goals').goals, budgets: budgetSummary(store, options.month).budgets, investments: investmentSummary(store).assets };
}

function groupTotals(records, key) {
  const groups = {};
  for (const item of records) { const label = item[key] || 'other'; groups[label] ||= {}; groups[label][item.currency] = (BigInt(groups[label][item.currency]?.amount_minor || 0) + BigInt(item.amount_minor)).toString(); }
  for (const values of Object.values(groups)) for (const [code, amount_minor] of Object.entries(values)) values[code] = { amount_minor, amount: fromMinor(amount_minor, code) };
  return groups;
}
function periodTotals(records, length) {
  const copy = records.map(item => ({ ...item, period: typeof length === 'function' ? length(item.date) : item.date.slice(0, length) }));
  return groupTotals(copy, 'period');
}
function isoWeek(date) {
  const value = new Date(`${date}T00:00:00Z`), day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const year = value.getUTCFullYear(), first = new Date(Date.UTC(year, 0, 1));
  return `${year}-W${String(Math.ceil((((value - first) / 86400000) + 1) / 7)).padStart(2, '0')}`;
}
function budgetSummary(store, requestedMonth) {
  const month = requestedMonth || (() => { const parts = new Intl.DateTimeFormat('en', { timeZone: store.preferences.timezone, year: 'numeric', month: '2-digit' }).formatToParts(new Date()); return `${parts.find(item => item.type === 'year').value}-${parts.find(item => item.type === 'month').value}`; })();
  const budgets = store.budgets.filter(item => item.month === month).map(budget => {
    const spent = store.expenses.filter(item => item.date.startsWith(month) && item.currency === budget.currency && (!budget.category || item.category === budget.category)).reduce((sum, item) => sum + BigInt(item.amount_minor), 0n);
    const limit = BigInt(budget.limit_minor); return { ...budget, spent_minor: spent.toString(), spent: fromMinor(spent, budget.currency), remaining_minor: (limit - spent).toString(), remaining: fromMinor(limit - spent, budget.currency), utilization: Number(spent * 10000n / limit) / 100 };
  });
  return { kind: 'budgets', month, budgets };
}
function investmentSummary(store) {
  const names = [...new Set(store.investments.map(item => `${item.asset}\0${item.currency}`))];
  const assets = names.map(key => {
    const [asset, code] = key.split('\0'), records = store.investments.filter(item => item.asset === asset && item.currency === code);
    const sum = action => records.filter(item => item.action === action).reduce((n, item) => n + BigInt(item.amount_minor), 0n);
    const contributions = sum('contribution'), purchases = sum('purchase'), sales = sum('sale'), withdrawals = sum('withdrawal'), dividends = sum('dividend');
    const valuationRecord = records.filter(item => item.action === 'valuation').sort((a, b) => b.date.localeCompare(a.date))[0];
    const targetRecord = records.filter(item => item.action === 'target').sort((a, b) => b.date.localeCompare(a.date))[0];
    const invested = contributions || purchases, valuation = valuationRecord ? BigInt(valuationRecord.amount_minor) : null;
    const profit = valuation === null || invested === 0n ? null : valuation + sales + withdrawals + dividends - invested;
    return { asset, currency: code, contributions: fromMinor(contributions, code), purchases: fromMinor(purchases, code), sales: fromMinor(sales, code), withdrawals: fromMinor(withdrawals, code), dividends: fromMinor(dividends, code), current_value: valuation === null ? null : fromMinor(valuation, code), target: targetRecord ? fromMinor(targetRecord.amount_minor, code) : null, profit_loss: profit === null ? null : fromMinor(profit, code), profit_basis: profit === null ? 'insufficient data' : contributions ? 'current value + returns - contributions' : 'current value + returns - purchases' };
  });
  return { kind: 'investments', assets, note: 'Profit/loss is only shown when a current valuation and contribution or purchase basis exist.' };
}

export function listRecords(store, type) { return collection(store, type).map(item => ({ ...item })); }
