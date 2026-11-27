#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { applyCommand, listRecords, summarize } from './src/finance.mjs';
import { createBackup, initialize, MacKeychainProvider, readStore, restoreBackup, updateStore } from './src/storage.mjs';

const dataDir = path.resolve(process.env.FINANCE_OS_DATA_DIR || path.join(os.homedir(), 'Library', 'Application Support', 'Finance OS'));
const keys = new MacKeychainProvider();
const command = process.argv[2] || 'help';
const arg = name => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const output = value => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

async function readJsonInput() {
  const file = arg('--input');
  const text = file ? await readFile(path.resolve(file), 'utf8') : await new Promise((resolve, reject) => {
    let value = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', chunk => value += chunk); process.stdin.on('end', () => resolve(value)); process.stdin.on('error', reject);
  });
  return JSON.parse(text);
}

async function main() {
  if (command === 'init') return output({ ready: true, data_dir: dataDir, version: (await initialize(dataDir, keys)).version });
  await initialize(dataDir, keys);
  if (command === 'apply') {
    const financeCommand = await readJsonInput();
    const saved = await updateStore(dataDir, keys, store => applyCommand(store, financeCommand));
    return output({ ...saved.result, store_version: saved.store.version });
  }
  if (command === 'summary') return output(summarize(await readStore(dataDir, keys), arg('--kind') || 'overview', { from: arg('--from'), to: arg('--to'), month: arg('--month') }));
  if (command === 'list') return output(listRecords(await readStore(dataDir, keys), arg('--type')));
  if (command === 'backup') return output({ saved: true, file: await createBackup(dataDir, path.resolve(arg('--destination')), keys) });
  if (command === 'restore') {
    if (arg('--confirm') !== 'RESTORE-FINANCE-OS') throw new Error('Restore requires --confirm RESTORE-FINANCE-OS.');
    const store = await restoreBackup(dataDir, path.resolve(arg('--file')), keys); return output({ restored: true, store_version: store.version });
  }
  output({ commands: ['init', 'apply [--input file; otherwise JSON from stdin]', 'summary --kind overview|income|expenses|goals|budgets|investments|preferences', 'list --type income|expense|goal|budget|investment', 'backup --destination DIR', 'restore --file FILE --confirm RESTORE-FINANCE-OS'] });
}

main().catch(error => { process.stderr.write(`${JSON.stringify({ saved: false, error: error.message })}\n`); process.exitCode = 1; });
