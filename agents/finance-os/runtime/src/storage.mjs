import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { open, readFile, writeFile, mkdir, chmod, copyFile, rename, rm, readdir, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { canonical, hmac, sha256, safeEqual } from './canonical.mjs';
import { emptyStore, verifyAudit } from './domain.mjs';
import { fail } from './errors.mjs';
import { assertSchema } from './schema.mjs';

export const ENVELOPE_VERSION = '1';
export const SCHEMA_VERSION = '1.0.0';
const ACTIVE = 'store.encrypted.json';
const LKG = 'store.last-known-good.encrypted.json';
const OPERATION_AUDIT = 'operations.audit.json';
const ROTATION_STATE = '.rotation-state.json';
const ROTATION_STAGE = '.rotation-stage.encrypted.json';
const MIGRATION_STATE = '.migration-state.json';
const MIGRATION_STAGE = '.migration-stage.encrypted.json';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const inject = point => { if (process.env.FINANCE_OS_FAULT === point) fail('INJECTED_FAULT', 'A synthetic write fault was injected.'); };
const operationInject = (kind, point) => { if (process.env[`FINANCE_OS_${kind}_FAULT`] === point) fail('INJECTED_FAULT', `A synthetic ${kind.toLowerCase()} fault was injected.`); };

function aadFields({ store_id, store_schema_version, key_id, key_version }) {
  return { purpose: 'finance-os-store', envelope_version: ENVELOPE_VERSION, store_id, store_schema_version, algorithm: 'AES-256-GCM', key_id, key_version };
}
function seal(key, nonce, plaintext, aad) {
  const c = createCipheriv('aes-256-gcm', key, nonce); c.setAAD(aad);
  return Buffer.concat([c.update(plaintext), c.final(), c.getAuthTag()]);
}
function openAead(key, nonce, sealed, aad) {
  if (sealed.length < 17) fail('AUTHENTICATION_FAILED', 'Encrypted data authentication failed.');
  try { const tag = sealed.subarray(-16), body = sealed.subarray(0,-16); const d = createDecipheriv('aes-256-gcm', key, nonce); d.setAAD(aad); d.setAuthTag(tag); return Buffer.concat([d.update(body), d.final()]); }
  catch { fail('AUTHENTICATION_FAILED', 'Encrypted data authentication failed.'); }
}

export function encryptStore(store, keys, keyVersion = 1) {
  const kek = keys.get('store', keyVersion); const dek = randomBytes(32); const nonce = randomBytes(12); const wrapNonce = randomBytes(12);
  const key_id = 'finance-os-store'; const fields = aadFields({ store_id: store.store_id, store_schema_version: store.schema_version, key_id, key_version: keyVersion });
  const aad = Buffer.from(canonical(fields));
  const ciphertext = seal(dek, nonce, Buffer.from(canonical(store)), aad);
  const wrapped = Buffer.concat([wrapNonce, seal(kek, wrapNonce, dek, Buffer.from(`finance-os-dek|${store.store_id}|${keyVersion}`))]);
  return assertSchema('envelope', { envelope_version: ENVELOPE_VERSION, store_id: store.store_id, store_schema_version: store.schema_version, algorithm: 'AES-256-GCM', key_id, key_version: keyVersion, nonce_b64: nonce.toString('base64'), aad_b64: aad.toString('base64'), ciphertext_b64: ciphertext.toString('base64'), wrapped_dek_b64: wrapped.toString('base64'), created_at: new Date().toISOString() });
}

export function decryptStore(envelope, keys, expectedStoreId, { allowedSchemaVersions = [SCHEMA_VERSION], validate = true } = {}) {
  assertSchema('envelope', envelope);
  if (envelope.envelope_version !== ENVELOPE_VERSION || envelope.algorithm !== 'AES-256-GCM') fail('UNSUPPORTED_ENVELOPE', 'The encrypted store version or algorithm is unsupported.');
  if (!allowedSchemaVersions.includes(envelope.store_schema_version)) fail('UNSUPPORTED_SCHEMA', 'The store schema version is unsupported.');
  if (expectedStoreId && envelope.store_id !== expectedStoreId) fail('STORE_ID_MISMATCH', 'The encrypted store identity does not match.');
  const fields = aadFields(envelope); const expectedAad = Buffer.from(canonical(fields)); const actualAad = Buffer.from(envelope.aad_b64 || '', 'base64');
  if (!actualAad.equals(expectedAad)) fail('AAD_MISMATCH', 'Encrypted metadata authentication failed.');
  const wrapped = Buffer.from(envelope.wrapped_dek_b64 || '', 'base64'); if (wrapped.length < 45) fail('AUTHENTICATION_FAILED', 'Encrypted key authentication failed.');
  const kek = keys.get('store', envelope.key_version); const wrapNonce = wrapped.subarray(0,12); const dek = openAead(kek, wrapNonce, wrapped.subarray(12), Buffer.from(`finance-os-dek|${envelope.store_id}|${envelope.key_version}`));
  const plain = openAead(dek, Buffer.from(envelope.nonce_b64, 'base64'), Buffer.from(envelope.ciphertext_b64, 'base64'), expectedAad);
  let store; try { store = JSON.parse(plain.toString('utf8')); } catch { fail('INVALID_STORE', 'Decrypted store validation failed.'); }
  if (store.store_id !== envelope.store_id || store.schema_version !== envelope.store_schema_version) fail('STORE_ID_MISMATCH', 'The encrypted store identity does not match.');
  if (validate) validateStore(store); return store;
}

export function validateStore(s) {
  assertSchema('store', s);
  const arrays = ['accounts','ledger_entries','transfers','investments','liabilities','budgets','goals','net_worth_snapshots','exchange_rates','audit_events','idempotency_receipts'];
  if (!s || s.schema_version !== SCHEMA_VERSION || typeof s.store_version !== 'number' || !Number.isSafeInteger(s.store_version)) fail('INVALID_STORE', 'The store failed structural validation.');
  for (const k of arrays) if (!Array.isArray(s[k])) fail('INVALID_STORE', 'The store failed structural validation.');
  const ids = new Set(); for (const k of arrays.slice(0,-2)) for (const x of s[k]) { if (x.id && ids.has(x.id)) fail('DUPLICATE_ID', 'The store contains duplicate identifiers.'); if (x.id) ids.add(x.id); }
  const accounts=new Map(s.accounts.map(x=>[x.id,x])); const liabilities=new Set(s.liabilities.map(x=>x.id)); const entryIds=new Set(s.ledger_entries.map(x=>x.id)); const transferIds=new Set(s.transfers.map(x=>x.id));
  const moneyOk=m=>m&&typeof m.minor_units==='string'&&/^-?(?:0|[1-9]\d*)$/.test(m.minor_units)&&typeof m.currency==='string'&&/^[A-Z]{3}$/.test(m.currency);
  const idem=new Set(); for(const e of s.ledger_entries){if(!accounts.has(e.account_id)||!moneyOk(e.amount)||e.amount.currency!==accounts.get(e.account_id).currency)fail('INVALID_STORE','A ledger reference or amount is invalid.');if(idem.has(e.idempotency_key))fail('INVALID_STORE','A ledger idempotency key is duplicated.');idem.add(e.idempotency_key);if(e.transfer_id&&!transferIds.has(e.transfer_id))fail('INVALID_STORE','A transfer reference is invalid.');if(e.liability_id&&!liabilities.has(e.liability_id))fail('INVALID_STORE','A liability reference is invalid.');if(e.reverses_entry_id&&!entryIds.has(e.reverses_entry_id))fail('INVALID_STORE','A reversal reference is invalid.');}
  for(const t of s.transfers){if(!accounts.has(t.source_account_id)||!accounts.has(t.destination_account_id)||!entryIds.has(t.out_entry_id)||!entryIds.has(t.in_entry_id)||!moneyOk(t.source_amount)||!moneyOk(t.destination_amount))fail('INVALID_STORE','A transfer invariant is invalid.');}
  for(const n of s.net_worth_snapshots){if(!moneyOk(n.assets)||!moneyOk(n.liabilities)||!moneyOk(n.net_worth)||BigInt(n.assets.minor_units)-BigInt(n.liabilities.minor_units)!==BigInt(n.net_worth.minor_units))fail('INVALID_STORE','A net-worth invariant is invalid.');}
  for(const r of s.idempotency_receipts){if(!r.scope||!r.request_hash||!r.input_hash||!r.audit_id)fail('INVALID_STORE','A receipt security field is missing.');}
}

async function ensureDir(dir) { await mkdir(dir, { recursive: true, mode: 0o700 }); const st = await stat(dir); if ((st.mode & 0o077) !== 0) { await chmod(dir, 0o700); const after = await stat(dir); if ((after.mode & 0o077) !== 0) fail('UNSAFE_PERMISSIONS', 'The data directory permissions are unsafe.'); } }

function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

async function recoverStaleLock(file, staleLockMs) {
  let record; let age = Infinity;
  try { const s = await stat(file); age = Date.now() - s.mtimeMs; record = JSON.parse(await readFile(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return false; }
  const created = Number(record?.created_at); if (Number.isFinite(created)) age = Math.max(age, Date.now() - created);
  if (age < staleLockMs || processAlive(Number(record?.pid))) return false;
  const quarantine = `${file}.stale-${randomUUID()}`;
  try { await rename(file, quarantine); await rm(quarantine, { force: true }); return true; }
  catch (e) { if (e.code === 'ENOENT') return false; throw e; }
}

async function acquireLock(dir, timeoutMs = 3000, staleLockMs = 30_000) {
  const file = path.join(dir, '.write.lock'); const start = Date.now();
  while (true) {
    try { const h = await open(file, 'wx', 0o600); await h.writeFile(JSON.stringify({ pid: process.pid, created_at: Date.now() })); await h.sync(); return async () => { await h.close(); await rm(file, { force: true }); }; }
    catch (e) { if (e.code !== 'EEXIST') throw e; if (await recoverStaleLock(file, staleLockMs)) continue; if (Date.now() - start >= timeoutMs) fail('LOCK_TIMEOUT', 'Another local operation is still running.'); await sleep(25); }
  }
}

async function fsyncDir(dir) { try { const h = await open(dir, 'r'); await h.sync(); await h.close(); } catch (e) { if (process.platform !== 'darwin') throw e; } }
async function atomicWrite(file, data) {
  const dir = path.dirname(file); const temp = path.join(dir, `.${path.basename(file)}.${randomUUID()}.tmp`); inject('before_temp');
  const h = await open(temp, 'wx', 0o600);
  try { inject('after_temp'); await h.writeFile(data); inject('after_write'); if (process.env.FINANCE_OS_PAUSE_POINT === 'after_write') { if (process.env.FINANCE_OS_PAUSE_MARKER) await writeFile(process.env.FINANCE_OS_PAUSE_MARKER, 'paused', { mode: 0o600 }); await new Promise(() => { setInterval(() => {}, 1000); }); } await h.sync(); inject('after_fsync'); }
  finally { await h.close(); }
  await chmod(temp, 0o600); inject('before_rename'); await rename(temp, file); inject('after_rename'); await fsyncDir(dir); inject('after_dirsync');
}

function appendStoreAudit(store, keys, action, outcome = 'accepted', targetIds = []) {
  const key = keys.get('audit', 1); const previous = store.audit_events.length ? store.audit_events.at(-1).event_auth : 'GENESIS'; const oldVersion = store.store_version;
  const event = { id: randomUUID(), occurred_at: new Date().toISOString(), actor_ref: 'local-operator', channel: 'system', action, target_ids: [...new Set(targetIds)], previous_store_version: oldVersion, new_store_version: oldVersion + 1, idempotency_key: `system:${action}:${oldVersion + 1}`, outcome, previous_event_auth: previous, auth_algorithm: 'HMAC-SHA-256', key_version: 1 };
  const payload = structuredClone(event); event.event_auth = hmac(key, payload); store.store_version += 1; store.audit_events.push(event); return event;
}

async function appendOperationOutcome(dir, keys, action, outcome, details = {}) {
  await ensureDir(dir); const file = path.join(dir, OPERATION_AUDIT); let events = [];
  try { events = JSON.parse(await readFile(file, 'utf8')); if (!Array.isArray(events)) throw new Error('not-array'); } catch (e) { if (e.code !== 'ENOENT') fail('OPERATION_AUDIT_INVALID', 'The operational audit trail is invalid.'); }
  const previous_event_auth = events.length ? events.at(-1).event_auth : 'GENESIS';
  const event = { id: randomUUID(), occurred_at: new Date().toISOString(), action, outcome, previous_event_auth, ...details };
  event.event_auth = hmac(keys.get('audit', 1), event); events.push(event); await atomicWrite(file, `${JSON.stringify(events)}\n`); return event;
}

export async function verifyOperationAudit(dir, keys) {
  let events; try { events = JSON.parse(await readFile(path.join(dir, OPERATION_AUDIT), 'utf8')); } catch (e) { if (e.code === 'ENOENT') return { valid: true, events: 0 }; fail('OPERATION_AUDIT_INVALID', 'The operational audit trail is invalid.'); }
  let previous = 'GENESIS'; for (const event of events) { const copy = structuredClone(event); delete copy.event_auth; if (copy.previous_event_auth !== previous || !event.event_auth || !safeEqual(event.event_auth, hmac(keys.get('audit', 1), copy))) return { valid: false, events: events.length }; previous = event.event_auth; }
  return { valid: true, events: events.length };
}

async function persistAuditedStore(dir, keys, store, keyVersion, action, targetIds = []) {
  appendStoreAudit(store, keys, action, 'accepted', targetIds); validateStore(store); const active = path.join(dir, ACTIVE); try { await copyFile(active, path.join(dir, LKG)); await chmod(path.join(dir, LKG), 0o600); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  await atomicWrite(active, `${JSON.stringify(encryptStore(store, keys, keyVersion))}\n`); const verified = await load(dir, keys, store.store_id); if (!verifyAudit(verified, keys.get('audit', 1))) fail('AUDIT_INVALID', 'Audit integrity verification failed.'); return verified;
}

export async function initialize(dir, keys, { storeId = randomUUID(), keyVersion = 1 } = {}) {
  assertSupported(); await ensureDir(dir); const release = await acquireLock(dir);
  try { const file = path.join(dir, ACTIVE); try { await stat(file); fail('ALREADY_INITIALIZED', 'The store is already initialized.'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const store = emptyStore(storeId); const envelope = encryptStore(store, keys, keyVersion); await atomicWrite(file, `${JSON.stringify(envelope)}\n`); const reopened = await load(dir, keys); return { store: reopened, envelope };
  } finally { await release(); }
}

export async function load(dir, keys, expectedStoreId) {
  const raw = await readFile(path.join(dir, ACTIVE), 'utf8').catch(() => fail('STORE_UNAVAILABLE', 'The encrypted store is unavailable.'));
  let envelope; try { envelope = JSON.parse(raw); } catch { fail('INVALID_ENVELOPE', 'The encrypted store envelope is invalid.'); }
  return decryptStore(envelope, keys, expectedStoreId);
}

export async function mutate(dir, keys, expectedVersion, fn, { keyVersion = null } = {}) {
  await ensureDir(dir); const release = await acquireLock(dir);
  try { const active = path.join(dir, ACTIVE);const currentEnvelope=JSON.parse(await readFile(active,'utf8'));const current=decryptStore(currentEnvelope,keys); if (current.store_version !== expectedVersion) fail('STALE_VERSION', 'The store changed; reload and retry.'); const next = await fn(structuredClone(current)); validateStore(next); const lkg = path.join(dir,LKG); await copyFile(active,lkg); await chmod(lkg,0o600); const envelope = encryptStore(next,keys,keyVersion??currentEnvelope.key_version); await atomicWrite(active,`${JSON.stringify(envelope)}\n`); const verified = await load(dir,keys,next.store_id); if (verified.store_version !== next.store_version) fail('VERIFY_FAILED','The encrypted replacement could not be verified.'); return verified;
  } finally { await release(); }
}

export async function health(dir, keys) {
  assertSupported(); let store; try { store = await load(dir,keys); if (!verifyAudit(store,keys.get('audit',1))) fail('AUDIT_INVALID','Audit integrity verification failed.'); }
  catch (error) { try { await appendOperationOutcome(dir, keys, 'integrity_check', 'integrity_failure', { error_code: error.code || 'INTERNAL_ERROR' }); } catch {} throw error; }
  const files = await readdir(dir); const orphan_temps = files.filter(x => x.endsWith('.tmp')).length; const modes = {};
  for (const f of files.filter(x => x.endsWith('.json') || x.endsWith('.lock'))) modes[f] = (await stat(path.join(dir,f))).mode & 0o777;
  if (Object.values(modes).some(x => (x & 0o077)!==0)) { await appendOperationOutcome(dir, keys, 'integrity_check', 'integrity_failure', { error_code: 'UNSAFE_PERMISSIONS' }); fail('UNSAFE_PERMISSIONS','A runtime file has unsafe permissions.'); }
  await appendOperationOutcome(dir, keys, 'integrity_check', 'accepted', { store_version: store.store_version });
  return { status:'healthy', schema_version:store.schema_version,envelope_version:ENVELOPE_VERSION,store_version:store.store_version,audit:'valid',operation_audit:(await verifyOperationAudit(dir,keys)).valid?'valid':'invalid',orphan_temps,permissions:'owner-only' };
}

async function verifiedBackups(backupDir, keys, storeId) {
  const names = (await readdir(backupDir)).filter(name => /^finance-os-.*\.encrypted\.json$/.test(name)); const valid = [];
  for (const name of names) { const file = path.join(backupDir, name); try { const raw = await readFile(file, 'utf8'); const store = decryptStore(JSON.parse(raw), keys, storeId); valid.push({ name, file, store_version: store.store_version, mtime: (await stat(file)).mtimeMs }); } catch {} }
  return valid.sort((a,b) => b.mtime - a.mtime || b.name.localeCompare(a.name));
}

export async function enforceBackupRetention(backupDir, keys, storeId, retain = 7) {
  if (!Number.isSafeInteger(retain) || retain < 1) fail('INVALID_RETENTION','Backup retention must preserve at least one generation.'); const valid = await verifiedBackups(backupDir,keys,storeId); if (!valid.length) fail('NO_KNOWN_GOOD_BACKUP','No authenticated backup generation is available.'); const remove = valid.slice(Math.max(1,retain));
  for (const item of remove) await rm(item.file,{force:true}); return { kept:valid.length-remove.length,removed:remove.map(x=>x.name),invalid_preserved:(await readdir(backupDir)).filter(name=>/^finance-os-.*\.encrypted\.json$/.test(name)&&!valid.some(x=>x.name===name)).length };
}

export async function backup(dir, backupDir, keys, { retention = null, audit = true } = {}) {
  await ensureDir(dir); await ensureDir(backupDir); const release = await acquireLock(dir); let result;
  try { const activeEnv=JSON.parse(await readFile(path.join(dir,ACTIVE),'utf8')); const store = decryptStore(activeEnv,keys); const env = encryptStore(store,keys,activeEnv.key_version); const generation = `${String(store.store_version).padStart(12,'0')}-${Date.now()}-${randomUUID()}`; const file = path.join(backupDir,`finance-os-${generation}.encrypted.json`); await atomicWrite(file,`${JSON.stringify(env)}\n`); decryptStore(JSON.parse(await readFile(file,'utf8')),keys,store.store_id); const policy=retention??store.preferences.backup_retention_generations??7; const retentionResult=await enforceBackupRetention(backupDir,keys,store.store_id,policy); result={ generation, file, store_id:store.store_id, store_version:store.store_version, sha256:sha256(await readFile(file,'utf8')), retention:retentionResult };
    if (audit) await persistAuditedStore(dir,keys,store,activeEnv.key_version,'backup_created',[store.store_id]);
    await appendOperationOutcome(dir,keys,'backup','accepted',{generation,store_version:store.store_version}); return result;
  } catch(error) { try{await appendOperationOutcome(dir,keys,'backup','rejected',{error_code:error.code||'INTERNAL_ERROR'});}catch{} throw error; } finally { await release(); }
}

export async function restorePrepare(backupFile, destination, keys, expectedStoreId, activationTarget) {
  if(!expectedStoreId)fail('STORE_ID_REQUIRED','The expected active store identity is required.'); if(!activationTarget)fail('ACTIVATION_TARGET_REQUIRED','The intended restore activation target is required.'); await ensureDir(destination); await ensureDir(activationTarget); const canonicalTarget=await realpath(activationTarget); const raw=await readFile(backupFile,'utf8'); const env = JSON.parse(raw); const store = decryptStore(env,keys,expectedStoreId); const file=path.join(destination,ACTIVE); await atomicWrite(file,`${JSON.stringify(env)}\n`); const envelope_hash=sha256(JSON.stringify(env)); const activation_target_hash=sha256({requested:path.resolve(activationTarget),canonical:canonicalTarget}); const confirmation_hash=sha256({ action:'activate_restore',store_id:store.store_id,store_version:store.store_version,envelope_hash,activation_target_hash }); return { status:'confirmation_required',confirmation_hash,envelope_hash,activation_target_hash,store_id:store.store_id,store_version:store.store_version,counts:Object.fromEntries(['accounts','ledger_entries','transfers','investments','liabilities','budgets','goals'].map(k=>[k,store[k].length])) };
}

export async function activateRestore(stagedDir, activeDir, confirmation, comparison, keys) {
  if (!comparison || confirmation !== comparison.confirmation_hash) fail('CONFIRMATION_REQUIRED','Fresh restore activation confirmation is required.'); await ensureDir(activeDir); const canonicalTarget=await realpath(activeDir); if(comparison.activation_target_hash!==sha256({requested:path.resolve(activeDir),canonical:canonicalTarget}))fail('RESTORE_TARGET_MISMATCH','The confirmation is bound to a different activation target.'); const release=await acquireLock(activeDir); try{const staged=path.join(stagedDir,ACTIVE);const raw=await readFile(staged,'utf8');const env=JSON.parse(raw);if(sha256(JSON.stringify(env))!==comparison.envelope_hash)fail('STALE_RESTORE','The staged restore changed after review.');const restored=decryptStore(env,keys,comparison.store_id);let activeStore;try{activeStore=await load(activeDir,keys);}catch(e){if(e.code!=='STORE_UNAVAILABLE')throw e;}if(activeStore&&activeStore.store_id!==restored.store_id)fail('STORE_ID_MISMATCH','The active and restored store identities differ.');const active=path.join(activeDir,ACTIVE);if(activeStore)await atomicWrite(path.join(activeDir,LKG),await readFile(active,'utf8'));appendStoreAudit(restored,keys,'restore_activated','accepted',[restored.store_id]);await atomicWrite(active,`${JSON.stringify(encryptStore(restored,keys,env.key_version))}\n`);const verified=await load(activeDir,keys,comparison.store_id);if(verified.store_version!==comparison.store_version+1||!verifyAudit(verified,keys.get('audit',1)))fail('VERIFY_FAILED','Restored generation verification failed.');await appendOperationOutcome(activeDir,keys,'restore','accepted',{source_store_version:comparison.store_version,store_version:verified.store_version});return { status:'activated',store_id:comparison.store_id,store_version:verified.store_version };}catch(error){try{await appendOperationOutcome(activeDir,keys,'restore','rejected',{error_code:error.code||'INTERNAL_ERROR'});}catch{}throw error;}finally{await release();}
}

export async function rotate(dir, keys, oldVersion, newVersion) {
  await ensureDir(dir); const release=await acquireLock(dir); try { const currentEnv=JSON.parse(await readFile(path.join(dir,ACTIVE),'utf8')); if(currentEnv.key_version!==oldVersion)fail('KEY_VERSION_MISMATCH','The active key version does not match the rotation request.'); keys.get('store',newVersion); const current=decryptStore(currentEnv,keys); const backupDir=path.join(dir,'rotation-backups'); const pre=await backupUnlocked(dir,backupDir,keys,currentEnv,current,1); const state={operation_id:randomUUID(),store_id:current.store_id,old_key_version:oldVersion,new_key_version:newVersion,stage:'prebackup_verified',backup_file:pre.file,created_at:new Date().toISOString()}; await atomicWrite(path.join(dir,ROTATION_STATE),`${JSON.stringify(state)}\n`); operationInject('ROTATION','after_prebackup'); appendStoreAudit(current,keys,'key_rotated','accepted',[current.store_id]); const staged=encryptStore(current,keys,newVersion); await atomicWrite(path.join(dir,ROTATION_STAGE),`${JSON.stringify(staged)}\n`); decryptStore(JSON.parse(await readFile(path.join(dir,ROTATION_STAGE),'utf8')),keys,current.store_id); state.stage='staged_verified';await atomicWrite(path.join(dir,ROTATION_STATE),`${JSON.stringify(state)}\n`);operationInject('ROTATION','after_stage');await atomicWrite(path.join(dir,LKG),await readFile(path.join(dir,ACTIVE),'utf8'));await atomicWrite(path.join(dir,ACTIVE),await readFile(path.join(dir,ROTATION_STAGE),'utf8'));operationInject('ROTATION','after_activate');const rotated=await load(dir,keys,current.store_id);if(!verifyAudit(rotated,keys.get('audit',1)))fail('AUDIT_INVALID','Audit continuity failed after rotation.');await rm(path.join(dir,ROTATION_STAGE),{force:true});await rm(path.join(dir,ROTATION_STATE),{force:true});await appendOperationOutcome(dir,keys,'key_rotation','accepted',{old_key_version:oldVersion,new_key_version:newVersion,store_version:rotated.store_version});return { status:'rotated',old_key_version:oldVersion,new_key_version:newVersion,store_version:rotated.store_version,backup_generation:pre.generation };
  }catch(error){try{await appendOperationOutcome(dir,keys,'key_rotation','rejected',{error_code:error.code||'INTERNAL_ERROR'});}catch{}throw error;}finally{await release();}
}

async function backupUnlocked(dir, backupDir, keys, activeEnv, store, retention) { await ensureDir(backupDir); const env=encryptStore(store,keys,activeEnv.key_version);const generation=`${String(store.store_version).padStart(12,'0')}-${Date.now()}-${randomUUID()}`;const file=path.join(backupDir,`finance-os-${generation}.encrypted.json`);await atomicWrite(file,`${JSON.stringify(env)}\n`);decryptStore(JSON.parse(await readFile(file,'utf8')),keys,store.store_id);const retentionResult=await enforceBackupRetention(backupDir,keys,store.store_id,retention);return{generation,file,store_id:store.store_id,store_version:store.store_version,sha256:sha256(await readFile(file,'utf8')),retention:retentionResult}; }

export async function recoverRotation(dir, keys) { let state;try{state=JSON.parse(await readFile(path.join(dir,ROTATION_STATE),'utf8'));}catch(e){if(e.code==='ENOENT')return{status:'none'};throw e;}const release=await acquireLock(dir);try{const activeEnv=JSON.parse(await readFile(path.join(dir,ACTIVE),'utf8'));if(activeEnv.store_id!==state.store_id)fail('STORE_ID_MISMATCH','Rotation recovery store identity differs.');if(activeEnv.key_version===state.new_key_version){const store=decryptStore(activeEnv,keys,state.store_id);if(!verifyAudit(store,keys.get('audit',1)))fail('AUDIT_INVALID','Rotation recovery audit check failed.');await rm(path.join(dir,ROTATION_STAGE),{force:true});await rm(path.join(dir,ROTATION_STATE),{force:true});await appendOperationOutcome(dir,keys,'key_rotation_recovery','accepted',{resolution:'activated',new_key_version:state.new_key_version});return{status:'recovered',resolution:'activated'};}if(activeEnv.key_version!==state.old_key_version)fail('KEY_VERSION_MISMATCH','Rotation recovery found an unexpected active key version.');try{const stagedRaw=await readFile(path.join(dir,ROTATION_STAGE),'utf8');const stagedEnv=JSON.parse(stagedRaw);const stagedStore=decryptStore(stagedEnv,keys,state.store_id);if(stagedEnv.key_version!==state.new_key_version||!verifyAudit(stagedStore,keys.get('audit',1)))fail('VERIFY_FAILED','The staged rotation generation failed verification.');await atomicWrite(path.join(dir,LKG),await readFile(path.join(dir,ACTIVE),'utf8'));await atomicWrite(path.join(dir,ACTIVE),stagedRaw.endsWith('\n')?stagedRaw:`${stagedRaw}\n`);await rm(path.join(dir,ROTATION_STAGE),{force:true});await rm(path.join(dir,ROTATION_STATE),{force:true});await appendOperationOutcome(dir,keys,'key_rotation_recovery','accepted',{resolution:'activated_staged',new_key_version:state.new_key_version});return{status:'recovered',resolution:'activated_staged'};}catch(error){if(error.code!=='ENOENT')throw error;await rm(path.join(dir,ROTATION_STATE),{force:true});await appendOperationOutcome(dir,keys,'key_rotation_recovery','accepted',{resolution:'rolled_back',old_key_version:state.old_key_version});return{status:'recovered',resolution:'rolled_back'};}}finally{await release();}}

export function migrateStore(store) {
  if (store.schema_version==='1.0.0') return structuredClone(store);
  if (store.schema_version!=='0.9.0') fail('UNSUPPORTED_SCHEMA','No migration path exists for this schema version.');
  const next=structuredClone(store); next.schema_version='1.0.0'; next.preferences ??={base_currency:'THB',time_zone:'Asia/Bangkok',locale:'en-TH',week_starts_on:'monday',fiscal_year_start_month:1,backup_retention_generations:7}; next.exchange_rates??=[]; next.net_worth_snapshots??=[]; return next;
}

export async function migratePersistent(dir, keys, { targetVersion = SCHEMA_VERSION } = {}) {
  if(targetVersion!==SCHEMA_VERSION)fail('UNSUPPORTED_SCHEMA','The requested migration target is unsupported.');await ensureDir(dir);const release=await acquireLock(dir);try{const activeRaw=await readFile(path.join(dir,ACTIVE),'utf8');const activeEnv=JSON.parse(activeRaw);if(activeEnv.store_schema_version===targetVersion)return{status:'current',schema_version:targetVersion};const source=decryptStore(activeEnv,keys,undefined,{allowedSchemaVersions:['0.9.0'],validate:false});const backupDir=path.join(dir,'migration-backups');const pre=await backupLegacyUnlocked(backupDir,keys,activeEnv,source);const state={operation_id:randomUUID(),store_id:source.store_id,source_version:source.schema_version,target_version:targetVersion,stage:'prebackup_verified',backup_file:pre.file,created_at:new Date().toISOString()};await atomicWrite(path.join(dir,MIGRATION_STATE),`${JSON.stringify(state)}\n`);operationInject('MIGRATION','after_prebackup');const migrated=migrateStore(source);appendStoreAudit(migrated,keys,'schema_migrated','accepted',[migrated.store_id]);validateStore(migrated);const staged=encryptStore(migrated,keys,activeEnv.key_version);await atomicWrite(path.join(dir,MIGRATION_STAGE),`${JSON.stringify(staged)}\n`);const verified=decryptStore(JSON.parse(await readFile(path.join(dir,MIGRATION_STAGE),'utf8')),keys,migrated.store_id);if(!verifyAudit(verified,keys.get('audit',1)))fail('AUDIT_INVALID','Migration audit verification failed.');state.stage='staged_verified';await atomicWrite(path.join(dir,MIGRATION_STATE),`${JSON.stringify(state)}\n`);operationInject('MIGRATION','after_stage');await atomicWrite(path.join(dir,LKG),activeRaw);await atomicWrite(path.join(dir,ACTIVE),await readFile(path.join(dir,MIGRATION_STAGE),'utf8'));operationInject('MIGRATION','after_activate');await rm(path.join(dir,MIGRATION_STAGE),{force:true});await rm(path.join(dir,MIGRATION_STATE),{force:true});await appendOperationOutcome(dir,keys,'migration','accepted',{source_version:source.schema_version,target_version:targetVersion,store_version:verified.store_version});return{status:'migrated',source_version:source.schema_version,target_version:targetVersion,store_version:verified.store_version,backup_generation:pre.generation};}catch(error){try{await appendOperationOutcome(dir,keys,'migration','rejected',{error_code:error.code||'INTERNAL_ERROR'});}catch{}throw error;}finally{await release();}
}

async function backupLegacyUnlocked(backupDir,keys,activeEnv,store){await ensureDir(backupDir);const generation=`legacy-${store.schema_version}-${Date.now()}-${randomUUID()}`;const file=path.join(backupDir,`finance-os-${generation}.encrypted.json`);await atomicWrite(file,`${JSON.stringify(activeEnv)}\n`);decryptStore(JSON.parse(await readFile(file,'utf8')),keys,store.store_id,{allowedSchemaVersions:[store.schema_version],validate:false});return{generation,file,store_id:store.store_id,store_version:store.store_version,sha256:sha256(await readFile(file,'utf8'))};}

export async function recoverMigration(dir,keys){let state;try{state=JSON.parse(await readFile(path.join(dir,MIGRATION_STATE),'utf8'));}catch(e){if(e.code==='ENOENT')return{status:'none'};throw e;}const release=await acquireLock(dir);try{const activeEnv=JSON.parse(await readFile(path.join(dir,ACTIVE),'utf8'));if(activeEnv.store_id!==state.store_id)fail('STORE_ID_MISMATCH','Migration recovery store identity differs.');if(activeEnv.store_schema_version===state.target_version){const store=decryptStore(activeEnv,keys,state.store_id);if(!verifyAudit(store,keys.get('audit',1)))fail('AUDIT_INVALID','Migration recovery audit check failed.');await rm(path.join(dir,MIGRATION_STAGE),{force:true});await rm(path.join(dir,MIGRATION_STATE),{force:true});await appendOperationOutcome(dir,keys,'migration_recovery','accepted',{resolution:'activated',target_version:state.target_version});return{status:'recovered',resolution:'activated'};}if(activeEnv.store_schema_version!==state.source_version)fail('UNSUPPORTED_SCHEMA','Migration recovery found an unexpected active schema.');try{const stagedRaw=await readFile(path.join(dir,MIGRATION_STAGE),'utf8');const stagedEnv=JSON.parse(stagedRaw);const stagedStore=decryptStore(stagedEnv,keys,state.store_id);if(stagedEnv.store_schema_version!==state.target_version||!verifyAudit(stagedStore,keys.get('audit',1)))fail('VERIFY_FAILED','The staged migration generation failed verification.');await atomicWrite(path.join(dir,LKG),await readFile(path.join(dir,ACTIVE),'utf8'));await atomicWrite(path.join(dir,ACTIVE),stagedRaw.endsWith('\n')?stagedRaw:`${stagedRaw}\n`);await rm(path.join(dir,MIGRATION_STAGE),{force:true});await rm(path.join(dir,MIGRATION_STATE),{force:true});await appendOperationOutcome(dir,keys,'migration_recovery','accepted',{resolution:'activated_staged',target_version:state.target_version});return{status:'recovered',resolution:'activated_staged'};}catch(error){if(error.code!=='ENOENT')throw error;const rollback=await readFile(state.backup_file,'utf8');const rollbackEnv=JSON.parse(rollback);decryptStore(rollbackEnv,keys,state.store_id,{allowedSchemaVersions:[state.source_version],validate:false});await atomicWrite(path.join(dir,ACTIVE),rollback.endsWith('\n')?rollback:`${rollback}\n`);await rm(path.join(dir,MIGRATION_STATE),{force:true});await appendOperationOutcome(dir,keys,'migration_recovery','accepted',{resolution:'rolled_back',source_version:state.source_version});return{status:'recovered',resolution:'rolled_back'};}}finally{await release();}}

export async function startupRecovery(dir,keys,{staleLockMs=30_000}={}){await ensureDir(dir);const lock=path.join(dir,'.write.lock');const stale_lock_recovered=await recoverStaleLock(lock,staleLockMs);const migration=await recoverMigration(dir,keys);const rotation=await recoverRotation(dir,keys);let generation='active';let expectedStoreId;try{const activeEnvelope=JSON.parse(await readFile(path.join(dir,ACTIVE),'utf8'));expectedStoreId=activeEnvelope.store_id;}catch{}try{await load(dir,keys,expectedStoreId);}catch(activeError){try{const raw=await readFile(path.join(dir,LKG),'utf8');const env=JSON.parse(raw);decryptStore(env,keys,expectedStoreId);await atomicWrite(path.join(dir,ACTIVE),raw.endsWith('\n')?raw:`${raw}\n`);generation='last-known-good';}catch{throw activeError;}}const files=await readdir(dir);const orphan_temps=files.filter(name=>name.endsWith('.tmp'));await appendOperationOutcome(dir,keys,'startup_recovery','accepted',{stale_lock_recovered,generation,orphan_temp_count:orphan_temps.length});return{status:'ready',stale_lock_recovered,generation,orphan_temps,migration,rotation};}

async function encryptedFiles(root) {
  const found = [];
  async function visit(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) await visit(file);
      else if (item.isFile() && item.name.endsWith('.encrypted.json')) found.push(file);
    }
  }
  await visit(root);
  return found;
}

export async function retireStoreKey(dir, keys, oldVersion, { additionalRoots = [] } = {}) {
  await ensureDir(dir); const release = await acquireLock(dir);
  try {
    const activeFile = path.join(dir, ACTIVE); const activeEnv = JSON.parse(await readFile(activeFile, 'utf8'));
    if (activeEnv.key_version === oldVersion) fail('KEY_STILL_ACTIVE', 'The active generation still uses the key selected for retirement.');
    const newVersion = activeEnv.key_version; keys.get('store', oldVersion); keys.get('store', newVersion);
    const roots = [...new Set([dir, ...additionalRoots].map(root => path.resolve(root)))]; const files = [];
    for (const root of roots) files.push(...await encryptedFiles(root));
    let rewrapped = 0;
    for (const file of [...new Set(files)]) {
      const raw = await readFile(file, 'utf8'); let envelope;
      try { envelope = JSON.parse(raw); } catch { fail('INVALID_ENVELOPE', 'An encrypted generation is invalid.'); }
      if (envelope.key_version !== oldVersion) continue;
      const schema = envelope.store_schema_version; const store = decryptStore(envelope, keys, envelope.store_id, { allowedSchemaVersions: [schema], validate: schema === SCHEMA_VERSION });
      const replacement = encryptStore(store, keys, newVersion); await atomicWrite(file, `${JSON.stringify(replacement)}\n`);
      decryptStore(JSON.parse(await readFile(file, 'utf8')), keys, store.store_id, { allowedSchemaVersions: [schema], validate: schema === SCHEMA_VERSION }); rewrapped += 1;
    }
    operationInject('RETIREMENT', 'after_rewrap');
    for (const root of roots) for (const file of await encryptedFiles(root)) {
      const envelope = JSON.parse(await readFile(file, 'utf8'));
      if (envelope.key_version === oldVersion) fail('KEY_STILL_REFERENCED', 'An encrypted generation still depends on the old key.');
    }
    if (typeof keys.delete !== 'function' || !keys.delete('store', oldVersion)) fail('KEY_RETIREMENT_FAILED', 'The old platform key could not be retired.');
    await appendOperationOutcome(dir, keys, 'key_retirement', 'accepted', { old_key_version: oldVersion, active_key_version: newVersion, rewrapped_generations: rewrapped, roots_checked: roots.length });
    return { status: 'retired', old_key_version: oldVersion, active_key_version: newVersion, rewrapped_generations: rewrapped, roots_checked: roots.length };
  } catch (error) { try { await appendOperationOutcome(dir, keys, 'key_retirement', 'rejected', { error_code: error.code || 'INTERNAL_ERROR' }); } catch {} throw error; }
  finally { await release(); }
}

export function assertSupported() { if (process.platform!=='darwin' || process.arch!=='arm64' || Number(process.versions.node.split('.')[0])!==22) fail('UNSUPPORTED_PLATFORM','This release supports Node.js 22 on Apple silicon macOS only.'); }
