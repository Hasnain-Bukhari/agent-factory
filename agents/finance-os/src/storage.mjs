import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const FILE = 'finance.encrypted.json';
const AAD = Buffer.from('finance-os:v1');

export class MemoryKeyProvider {
  constructor(key = Buffer.alloc(32, 7)) { this.key = Buffer.from(key); }
  get() { return Buffer.from(this.key); }
  create() { return this.get(); }
}

export class MacKeychainProvider {
  constructor(service = 'finance-os', account = 'data-key') { this.service = service; this.account = account; }
  get() {
    try {
      const value = execFileSync('/usr/bin/security', ['find-generic-password', '-s', this.service, '-a', this.account, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      const key = Buffer.from(value, 'base64');
      if (key.length !== 32) throw new Error('invalid key');
      return key;
    } catch { throw new Error('Finance OS encryption key is unavailable in macOS Keychain.'); }
  }
  create() {
    const key = randomBytes(32);
    execFileSync('/usr/bin/security', ['add-generic-password', '-U', '-s', this.service, '-a', this.account, '-w', key.toString('base64')], { stdio: 'ignore' });
    return key;
  }
}

export function emptyStore() {
  return {
    version: 1,
    preferences: { currency: 'THB', timezone: 'Asia/Bangkok', category_rules: {} },
    incomes: [], expenses: [], goals: [], budgets: [], investments: [], processed_messages: []
  };
}

function assertKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('A 256-bit encryption key is required.');
}

export function encryptStore(store, key) {
  assertKey(key);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(store), 'utf8'), cipher.final()]);
  return { format: 1, algorithm: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
}

export function decryptStore(envelope, key) {
  assertKey(key);
  try {
    if (envelope?.format !== 1 || envelope.algorithm !== 'aes-256-gcm') throw new Error('unsupported format');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
  } catch { throw new Error('Encrypted Finance OS data could not be authenticated. The key or file is incorrect.'); }
}

async function atomicWrite(file, content) {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, file);
  await chmod(file, 0o600);
}

async function acquireLock(dir, timeoutMs = 5000) {
  const lock = path.join(dir, '.write-lock');
  const started = Date.now();
  while (true) {
    try { await mkdir(lock); return async () => rm(lock, { recursive: true, force: true }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try { if (Date.now() - (await stat(lock)).mtimeMs > 30_000) await rm(lock, { recursive: true, force: true }); } catch {}
      if (Date.now() - started > timeoutMs) throw new Error('Finance OS is busy with another write. Please retry.');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
}

export async function initialize(dir, keys) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, FILE);
  try { await stat(file); return readStore(dir, keys); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  let key;
  try { key = keys.get(); } catch { key = keys.create(); }
  await atomicWrite(file, `${JSON.stringify(encryptStore(emptyStore(), key))}\n`);
  return readStore(dir, keys);
}

export async function readStore(dir, keys) {
  const envelope = JSON.parse(await readFile(path.join(dir, FILE), 'utf8'));
  return decryptStore(envelope, keys.get());
}

export async function updateStore(dir, keys, mutate) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const release = await acquireLock(dir);
  try {
    const store = await readStore(dir, keys);
    const next = structuredClone(store);
    const result = await mutate(next);
    next.version = store.version + 1;
    await atomicWrite(path.join(dir, FILE), `${JSON.stringify(encryptStore(next, keys.get()))}\n`);
    const verified = await readStore(dir, keys);
    if (verified.version !== next.version) throw new Error('Finance OS could not verify the saved record.');
    return { store: verified, result };
  } finally { await release(); }
}

export async function createBackup(dir, backupDir, keys) {
  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  await readStore(dir, keys);
  const name = `finance-os-${new Date().toISOString().replaceAll(':', '-')}.encrypted.json`;
  const destination = path.join(backupDir, name);
  await atomicWrite(destination, await readFile(path.join(dir, FILE), 'utf8'));
  decryptStore(JSON.parse(await readFile(destination, 'utf8')), keys.get());
  return destination;
}

export async function restoreBackup(dir, backupFile, keys) {
  const raw = await readFile(backupFile, 'utf8');
  decryptStore(JSON.parse(raw), keys.get());
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const release = await acquireLock(dir);
  try { await atomicWrite(path.join(dir, FILE), raw.endsWith('\n') ? raw : `${raw}\n`); }
  finally { await release(); }
  return readStore(dir, keys);
}

export const storeFile = dir => path.join(dir, FILE);
