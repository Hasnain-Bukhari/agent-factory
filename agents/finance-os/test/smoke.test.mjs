import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyCommand, summarize } from '../src/finance.mjs';
import { createBackup, initialize, MemoryKeyProvider, readStore, restoreBackup, updateStore } from '../src/storage.mjs';
import { handleTelegramUpdate, interpretWithOpenAI } from '../src/telegram.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'finance-os-')); t.after(() => rm(root, { recursive: true, force: true }));
  const dataDir = path.join(root, 'data'), keys = new MemoryKeyProvider(); await initialize(dataDir, keys); return { root, dataDir, keys };
}
const save = (dataDir, keys, command) => updateStore(dataDir, keys, store => applyCommand(store, command));

test('five capabilities persist, calculate correctly, and support correction', async t => {
  const { dataDir, keys } = await fixture(t);
  const income = await save(dataDir, keys, { type: 'record_income', data: { amount: '50000', currency: 'THB', date: '2026-11-01', source: 'Salary', category: 'salary' } });
  const expense = await save(dataDir, keys, { type: 'record_expense', data: { amount: '85', date: '2026-11-02', description: 'Coffee' } });
  assert.equal(expense.result.result.category, 'dining');
  await save(dataDir, keys, { type: 'update_record', data: { record_type: 'expense', id: expense.result.result.id, changes: { amount: '95', category: 'food' } } });
  const goal = await save(dataDir, keys, { type: 'create_goal', data: { name: 'Emergency fund', target_amount: '300000', date: '2026-11-02' } });
  await save(dataDir, keys, { type: 'allocate_goal', data: { goal_id: goal.result.result.id, amount: '10000', date: '2026-11-03' } });
  await save(dataDir, keys, { type: 'create_budget', data: { amount: '2000', month: '2026-11', category: 'food' } });
  await save(dataDir, keys, { type: 'record_investment', data: { action: 'contribution', asset: 'Index fund', amount: '20000', date: '2026-11-04' } });
  await save(dataDir, keys, { type: 'record_investment', data: { action: 'valuation', asset: 'Index fund', amount: '21500', date: '2026-11-20' } });
  const restarted = await readStore(dataDir, keys);
  assert.equal(summarize(restarted, 'income').totals.THB.amount, '50000.00');
  assert.equal(summarize(restarted, 'expenses').totals.THB.amount, '95.00');
  assert.equal(summarize(restarted, 'expenses').by_week['2026-W45'].THB.amount, '95.00');
  assert.equal(summarize(restarted, 'goals').goals[0].allocated, '10000.00');
  assert.equal(summarize(restarted, 'budgets', { month: '2026-11' }).budgets[0].remaining, '1905.00');
  assert.equal(summarize(restarted, 'investments').assets[0].profit_loss, '1500.00');
  assert.equal(income.result.saved, true);
});

test('encryption rejects an incorrect key and backup restores', async t => {
  const { root, dataDir, keys } = await fixture(t);
  await save(dataDir, keys, { type: 'record_expense', data: { amount: '500', date: '2026-11-01', description: 'Groceries' } });
  await assert.rejects(readStore(dataDir, new MemoryKeyProvider(Buffer.alloc(32, 8))), /could not be authenticated/);
  const backup = await createBackup(dataDir, path.join(root, 'backups'), keys);
  await save(dataDir, keys, { type: 'record_expense', data: { amount: '100', date: '2026-11-02', description: 'Taxi' } });
  await restoreBackup(dataDir, backup, keys);
  assert.equal((await readStore(dataDir, keys)).expenses.length, 1);
});

test('concurrent writes are serialized and idempotency prevents duplicates', async t => {
  const { dataDir, keys } = await fixture(t);
  await Promise.all(Array.from({ length: 12 }, (_, index) => save(dataDir, keys, { type: 'record_expense', data: { amount: '1', date: '2026-11-01', description: `item ${index}` }, idempotency_key: `item:${index}` })));
  await save(dataDir, keys, { type: 'record_expense', data: { amount: '1', date: '2026-11-01', description: 'duplicate' }, idempotency_key: 'item:0' });
  assert.equal((await readStore(dataDir, keys)).expenses.length, 12);
});

test('unauthorized Telegram messages are rejected before interpretation', async t => {
  const { dataDir, keys } = await fixture(t); let calls = 0;
  const result = await handleTelegramUpdate({ update_id: 1, message: { text: 'I spent 85 baht', from: { id: 99 }, chat: { id: 99, type: 'private' } } }, { authorizedUserId: 42, dataDir, keys, interpret: async () => { calls++; } });
  assert.equal(result.unauthorized, true); assert.equal(calls, 0); assert.equal((await readStore(dataDir, keys)).expenses.length, 0);
});

test('authorized Telegram writes use the shared store and ignore replay', async t => {
  const { dataDir, keys } = await fixture(t); let calls = 0;
  const update = { update_id: 7, message: { text: 'I spent 85 baht on coffee', from: { id: 42 }, chat: { id: 42, type: 'private' } } };
  const interpret = async () => { calls++; return { action: 'record_expense', amount: '85', currency: 'THB', date: '2026-11-27', description: 'coffee', category: null, notes: '', reply: 'Saved coffee.' }; };
  await handleTelegramUpdate(update, { authorizedUserId: 42, dataDir, keys, interpret });
  await handleTelegramUpdate(update, { authorizedUserId: 42, dataDir, keys, interpret });
  assert.equal((await readStore(dataDir, keys)).expenses.length, 1); assert.equal(calls, 1);
});

test('Telegram interpreter uses schema-constrained, non-stored API responses', async t => {
  const { dataDir, keys } = await fixture(t), store = await readStore(dataDir, keys); let request;
  const parsed = await interpretWithOpenAI('I spent 85 baht on coffee', store, 'synthetic-key', async (url, options) => {
    request = { url, body: JSON.parse(options.body) };
    return { ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ action: 'record_expense', record_type: null, id: null, amount: '85', currency: 'THB', date: '2026-11-28', source: null, description: 'coffee', category: null, notes: null, goal_name: null, target_date: null, month: null, investment_action: null, asset: null, query_kind: null, from: null, to: null, preference_key: null, preference_value: null, reply: 'Saved.' }) }] }] }) };
  });
  assert.equal(parsed.action, 'record_expense'); assert.equal(request.url, 'https://api.openai.com/v1/responses'); assert.equal(request.body.model, 'gpt-4o-mini'); assert.equal(request.body.store, false); assert.equal(request.body.text.format.strict, true);
});
