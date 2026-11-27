import { execFileSync, spawn } from 'node:child_process';
import { open, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCommand, listRecords, summarize } from './finance.mjs';
import { initialize, MacKeychainProvider, readStore, updateStore } from './storage.mjs';

const SERVICE = 'finance-os';
const here = fileURLToPath(import.meta.url);
const defaultDataDir = path.join(os.homedir(), 'Library', 'Application Support', 'Finance OS');
const getSecret = account => execFileSync('/usr/bin/security', ['find-generic-password', '-s', SERVICE, '-a', account, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const setSecretPrompt = account => execFileSync('/usr/bin/security', ['add-generic-password', '-U', '-s', SERVICE, '-a', account, '-w'], { stdio: 'inherit' });

const interpretationSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    action: { type: 'string', enum: ['record_income', 'record_expense', 'create_goal', 'allocate_goal', 'create_budget', 'record_investment', 'update_record', 'delete_record', 'set_preference', 'summary', 'list', 'clarify'] },
    record_type: { type: ['string', 'null'] }, id: { type: ['string', 'null'] }, amount: { type: ['string', 'null'] }, currency: { type: ['string', 'null'] },
    date: { type: ['string', 'null'] }, source: { type: ['string', 'null'] }, description: { type: ['string', 'null'] }, category: { type: ['string', 'null'] }, notes: { type: ['string', 'null'] },
    goal_name: { type: ['string', 'null'] }, target_date: { type: ['string', 'null'] }, month: { type: ['string', 'null'] }, investment_action: { type: ['string', 'null'] }, asset: { type: ['string', 'null'] },
    query_kind: { type: ['string', 'null'] }, from: { type: ['string', 'null'] }, to: { type: ['string', 'null'] }, preference_key: { type: ['string', 'null'] }, preference_value: { type: ['string', 'null'] },
    reply: { type: 'string' }
  },
  required: ['action', 'record_type', 'id', 'amount', 'currency', 'date', 'source', 'description', 'category', 'notes', 'goal_name', 'target_date', 'month', 'investment_action', 'asset', 'query_kind', 'from', 'to', 'preference_key', 'preference_value', 'reply']
};

export async function interpretWithOpenAI(text, store, apiKey, fetchImpl = fetch) {
  const recent = [...store.incomes.map(x => ({ type: 'income', ...x })), ...store.expenses.map(x => ({ type: 'expense', ...x })), ...store.goals.map(x => ({ type: 'goal', ...x })), ...store.budgets.map(x => ({ type: 'budget', ...x })), ...store.investments.map(x => ({ type: 'investment', ...x }))].sort((a, b) => (b.updated_at || b.date).localeCompare(a.updated_at || a.date)).slice(0, 20);
  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini', store: false,
      instructions: `Classify one personal-finance request. Today is ${new Intl.DateTimeFormat('en-CA', { timeZone: store.preferences.timezone }).format(new Date())}; timezone ${store.preferences.timezone}; default currency ${store.preferences.currency}. Use YYYY-MM-DD dates. Ask for clarification when a required amount, date, source/object, or correction target is genuinely unresolved. Goal allocations are not expenses. Investment purchases are investments, not expenses. Keep reply concise.`,
      input: `User message: ${text}\nConfirmed preferences and recent records: ${JSON.stringify({ preferences: store.preferences, recent })}`,
      text: { format: { type: 'json_schema', name: 'finance_instruction', strict: true, schema: interpretationSchema } }
    }), signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`OpenAI request failed (${response.status}).`);
  const body = await response.json();
  if (body.status !== 'completed') throw new Error('OpenAI did not complete the request.');
  const output = body.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text;
  if (!output) throw new Error('OpenAI returned no usable instruction.');
  return JSON.parse(output);
}

function toCommand(parsed, updateId) {
  const common = { amount: parsed.amount, currency: parsed.currency, date: parsed.date, notes: parsed.notes || '' };
  let data;
  if (parsed.action === 'record_income') data = { ...common, source: parsed.source, category: parsed.category };
  else if (parsed.action === 'record_expense') data = { ...common, description: parsed.description, category: parsed.category };
  else if (parsed.action === 'create_goal') data = { name: parsed.goal_name, target_amount: parsed.amount, currency: parsed.currency, target_date: parsed.target_date, notes: parsed.notes || '' };
  else if (parsed.action === 'allocate_goal') data = { goal_id: parsed.id, amount: parsed.amount, date: parsed.date, notes: parsed.notes || '' };
  else if (parsed.action === 'create_budget') data = { amount: parsed.amount, currency: parsed.currency, month: parsed.month, category: parsed.category };
  else if (parsed.action === 'record_investment') data = { ...common, action: parsed.investment_action, asset: parsed.asset };
  else if (parsed.action === 'delete_record') data = { record_type: parsed.record_type, id: parsed.id };
  else if (parsed.action === 'update_record') data = { record_type: parsed.record_type, id: parsed.id, changes: Object.fromEntries(Object.entries({ amount: parsed.amount, currency: parsed.currency, date: parsed.date, source: parsed.source, description: parsed.description, category: parsed.category, notes: parsed.notes }).filter(([, value]) => value != null)) };
  else if (parsed.action === 'set_preference') data = { key: parsed.preference_key, value: parsed.preference_value };
  else throw new Error('No write command for this action.');
  return { type: parsed.action, data, idempotency_key: `telegram:${updateId}` };
}

export async function handleTelegramUpdate(update, { authorizedUserId, dataDir, keys, interpret }) {
  const message = update?.message;
  if (!message || message.chat?.type !== 'private' || typeof message.text !== 'string') return { accepted: false, reply: 'Only private text messages are supported.' };
  if (String(message.from?.id) !== String(authorizedUserId)) return { accepted: false, unauthorized: true, reply: 'Unauthorized.' };
  const store = await readStore(dataDir, keys);
  if (store.processed_messages.some(item => item.key === `telegram:${update.update_id}`)) return { accepted: true, reply: 'This message was already processed.' };
  const parsed = await interpret(message.text, store);
  if (parsed.action === 'clarify') return { accepted: true, reply: parsed.reply };
  if (parsed.action === 'summary') return { accepted: true, reply: `${parsed.reply}\n${JSON.stringify(summarize(store, parsed.query_kind || 'overview', { from: parsed.from, to: parsed.to, month: parsed.month }), null, 2)}`.slice(0, 4000) };
  if (parsed.action === 'list') return { accepted: true, reply: `${parsed.reply}\n${JSON.stringify(listRecords(store, parsed.record_type), null, 2)}`.slice(0, 4000) };
  if (parsed.action === 'delete_record') return { accepted: true, reply: 'For safety, delete records through Codex after reviewing the record and explicitly confirming the deletion.' };
  const saved = await updateStore(dataDir, keys, next => applyCommand(next, toCommand(parsed, update.update_id)));
  return { accepted: true, reply: `${parsed.reply || 'Saved.'}\nRecord: ${saved.result.result?.id || saved.result.result?.goal_id || 'updated'}${saved.result.duplicate ? ' (already processed)' : ''}` };
}

async function telegramCall(token, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(40_000) });
  const result = await response.json(); if (!result.ok) throw new Error(`Telegram ${method} failed.`); return result.result;
}

async function run(dataDir) {
  const keys = new MacKeychainProvider(); await initialize(dataDir, keys);
  const token = getSecret('telegram-bot-token'), apiKey = getSecret('openai-api-key'), userId = getSecret('telegram-user-id');
  let offset = 0, stopping = false; process.once('SIGTERM', () => stopping = true); process.once('SIGINT', () => stopping = true);
  while (!stopping) {
    try {
      const updates = await telegramCall(token, 'getUpdates', { offset, timeout: 30, allowed_updates: ['message'] });
      for (const update of updates) {
        offset = Math.max(offset, update.update_id + 1);
        const result = await handleTelegramUpdate(update, { authorizedUserId: userId, dataDir, keys, interpret: (text, store) => interpretWithOpenAI(text, store, apiKey) });
        if (!result.unauthorized && update.message?.chat?.id) await telegramCall(token, 'sendMessage', { chat_id: update.message.chat.id, text: result.reply });
      }
    } catch (error) { process.stderr.write(`${new Date().toISOString()} ${error.message}\n`); await new Promise(resolve => setTimeout(resolve, 2000)); }
  }
}

async function lifecycle() {
  const action = process.argv[2], userIdArg = process.argv[process.argv.indexOf('--user-id') + 1], dataDir = path.resolve(process.env.FINANCE_OS_DATA_DIR || defaultDataDir), pidFile = path.join(dataDir, 'telegram.pid');
  if (action === 'setup') {
    if (!/^\d+$/.test(userIdArg || '')) throw new Error('Setup requires --user-id followed by your numeric Telegram user ID.');
    process.stdout.write('Telegram bot token (input is hidden):\n'); setSecretPrompt('telegram-bot-token');
    process.stdout.write('OpenAI API key (input is hidden):\n'); setSecretPrompt('openai-api-key');
    execFileSync('/usr/bin/security', ['add-generic-password', '-U', '-s', SERVICE, '-a', 'telegram-user-id', '-w', userIdArg], { stdio: 'ignore' });
    return process.stdout.write('Telegram credentials saved in macOS Keychain.\n');
  }
  if (action === 'run') return run(dataDir);
  if (action === 'start') {
    await initialize(dataDir, new MacKeychainProvider());
    try { const pid = Number(await readFile(pidFile, 'utf8')); process.kill(pid, 0); return process.stdout.write('Telegram bot is already running.\n'); } catch {}
    const log = await open(path.join(dataDir, 'telegram.log'), 'a', 0o600);
    const child = spawn(process.execPath, [here, 'run'], { detached: true, stdio: ['ignore', log.fd, log.fd], env: process.env }); child.unref(); await writeFile(pidFile, String(child.pid), { mode: 0o600 }); await log.close();
    return process.stdout.write(`Telegram bot started (PID ${child.pid}).\n`);
  }
  if (action === 'stop') {
    try { const pid = Number(await readFile(pidFile, 'utf8')); process.kill(pid, 'SIGTERM'); await rm(pidFile, { force: true }); return process.stdout.write('Telegram bot stopped.\n'); }
    catch { await rm(pidFile, { force: true }); return process.stdout.write('Telegram bot was not running.\n'); }
  }
  process.stdout.write('Use: setup --user-id ID | start | stop | run\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === here) lifecycle().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
