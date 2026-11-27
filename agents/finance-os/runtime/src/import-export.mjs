import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { lstat, open, readFile, readdir, realpath, rename, rm, stat } from 'node:fs/promises';
import { canonical, hmac, sha256, safeEqual } from './canonical.mjs';
import { fail } from './errors.mjs';
import { assertSchema, validateSchema } from './schema.mjs';
import { load, mutate, validateStore } from './storage.mjs';

export const INTERCHANGE_VERSION = '1.0.0';
export const PORTABLE_ENVELOPE_VERSION = '1';
export const DEFAULT_IMPORT_LIMITS = Object.freeze({
  bytes: 8 * 1024 * 1024,
  rows: 10_000,
  columns: 16,
  fieldBytes: 256 * 1024,
  jsonDepth: 48,
  jsonNodes: 200_000,
  errors: 100,
  processingMs: 5_000
});
const HARD_LIMITS = Object.freeze({ bytes: 64 * 1024 * 1024, rows: 100_000, columns: 128, fieldBytes: 1024 * 1024, jsonDepth: 128, jsonNodes: 1_000_000, errors: 1_000, processingMs: 30_000 });
const TYPE_TO_COLLECTION = Object.freeze({
  preferences: 'preferences', account: 'accounts', ledger_entry: 'ledger_entries', transfer: 'transfers', investment: 'investments',
  liability: 'liabilities', budget: 'budgets', goal: 'goals', net_worth_snapshot: 'net_worth_snapshots', exchange_rate: 'exchange_rates'
});
const RECORD_TYPES = Object.freeze(Object.keys(TYPE_TO_COLLECTION));
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function limitsFor(overrides = {}) {
  const limits = { ...DEFAULT_IMPORT_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1 || value > HARD_LIMITS[name]) fail('INVALID_LIMIT', `The ${name} limit is invalid.`);
  }
  return limits;
}

function deadline(start, limits) {
  if (Date.now() - start > limits.processingMs) fail('PROCESSING_LIMIT', 'The import processing-time limit was exceeded.');
}

async function readBounded(filePath, limits) {
  if (typeof filePath !== 'string' || !isAbsolute(filePath)) fail('INVALID_SOURCE', 'An explicit absolute local file is required.');
  const info = await lstat(filePath).catch(() => fail('SOURCE_UNAVAILABLE', 'The selected local file is unavailable.'));
  if (!info.isFile() || info.isSymbolicLink()) fail('INVALID_SOURCE', 'The selected source must be a regular local file.');
  if (info.size > limits.bytes) fail('BYTE_LIMIT', 'The selected file exceeds the configured byte limit.');
  const bytes = await readFile(filePath);
  if (bytes.length > limits.bytes) fail('BYTE_LIMIT', 'The selected file exceeds the configured byte limit.');
  return bytes;
}

function decode(bytes, declaredEncoding = 'auto') {
  let encoding = declaredEncoding.toLowerCase();
  let offset = 0;
  if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) { if (!['auto', 'utf-8', 'utf8'].includes(encoding)) fail('ENCODING_MISMATCH', 'The declared encoding conflicts with the byte-order mark.'); encoding = 'utf-8'; offset = 3; }
  else if (bytes.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))) { if (!['auto', 'utf-16le'].includes(encoding)) fail('ENCODING_MISMATCH', 'The declared encoding conflicts with the byte-order mark.'); encoding = 'utf-16le'; offset = 2; }
  else if (bytes.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))) fail('UNSUPPORTED_ENCODING', 'UTF-16 big-endian input is unsupported.');
  else if (encoding === 'auto') encoding = 'utf-8';
  if (!['utf-8', 'utf8', 'utf-16le'].includes(encoding)) fail('UNSUPPORTED_ENCODING', 'The declared text encoding is unsupported.');
  try { return { text: new TextDecoder(encoding, { fatal: true }).decode(bytes.subarray(offset)), encoding: encoding === 'utf8' ? 'utf-8' : encoding }; }
  catch { fail('MALFORMED_ENCODING', 'The selected file contains malformed text encoding.'); }
}

function inspectJson(value, limits) {
  let nodes = 0;
  const stack = [{ value, depth: 1 }];
  while (stack.length) {
    const current = stack.pop(); nodes += 1;
    if (nodes > limits.jsonNodes) fail('JSON_NODE_LIMIT', 'The JSON document exceeds the configured node limit.');
    if (current.depth > limits.jsonDepth) fail('JSON_DEPTH_LIMIT', 'The JSON document exceeds the configured nesting limit.');
    if (current.value && typeof current.value === 'object') for (const child of Object.values(current.value)) stack.push({ value: child, depth: current.depth + 1 });
  }
}

function detectDelimiter(text) {
  const header = text.split(/\r?\n/, 1)[0];
  const candidates = [',', ';', '\t'].map(delimiter => ({ delimiter, count: [...header].filter(char => char === delimiter).length })).sort((a, b) => b.count - a.count);
  if (!candidates[0].count || candidates[0].count === candidates[1].count) fail('AMBIGUOUS_DELIMITER', 'The CSV delimiter is missing or ambiguous.');
  return candidates[0].delimiter;
}

function parseCsv(text, delimiter, limits, start) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  const pushField = () => { if (Buffer.byteLength(field) > limits.fieldBytes) fail('FIELD_LIMIT', 'A CSV field exceeds the configured limit.'); row.push(field); field = ''; if (row.length > limits.columns) fail('COLUMN_LIMIT', 'A CSV row exceeds the configured column limit.'); };
  const pushRow = () => { pushField(); rows.push(row); row = []; if (rows.length - 1 > limits.rows) fail('ROW_LIMIT', 'The CSV file exceeds the configured row limit.'); deadline(start, limits); };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === delimiter) pushField();
    else if (char === '\n') pushRow();
    else if (char === '\r' && text[index + 1] === '\n') { pushRow(); index += 1; }
    else if (char === '\r') pushRow();
    else field += char;
  }
  if (quoted) fail('MALFORMED_CSV', 'The CSV file contains an unterminated quoted field.');
  if (field.length || row.length) pushRow();
  return rows;
}

function unneutralize(value) { return value.startsWith("'") && FORMULA_PREFIX.test(value.slice(1)) ? value.slice(1) : value; }
function neutralize(value) { const text = String(value); return FORMULA_PREFIX.test(text) ? `'${text}` : text; }
function csvCell(value) { const text = neutralize(value); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }

function parseRecords(text, format, options, limits, start) {
  if (format === 'json') {
    let parsed; try { parsed = JSON.parse(text); } catch { fail('MALFORMED_JSON', 'The JSON document is malformed.'); }
    inspectJson(parsed, limits);
    const records = Array.isArray(parsed) ? parsed : parsed?.records;
    if (!Array.isArray(records)) fail('INVALID_INTERCHANGE', 'The JSON document must contain a records array.');
    if (records.length > limits.rows) fail('ROW_LIMIT', 'The JSON document exceeds the configured row limit.');
    return { records, delimiter: null, embeddedManifest: parsed?.manifest || null };
  }
  if (format !== 'csv') fail('UNSUPPORTED_FORMAT', 'Only CSV and JSON imports are supported.');
  const delimiter = options.delimiter === 'auto' || !options.delimiter ? detectDelimiter(text) : options.delimiter;
  if (![',', ';', '\t'].includes(delimiter)) fail('UNSUPPORTED_DELIMITER', 'The selected CSV delimiter is unsupported.');
  const rows = parseCsv(text, delimiter, limits, start);
  if (!rows.length || rows[0].length !== 2 || rows[0][0] !== 'record_type' || rows[0][1] !== 'payload_json') fail('INVALID_CSV_HEADER', 'The CSV header must be record_type,payload_json.');
  const records = rows.slice(1).filter(row => !(row.length === 1 && row[0] === '')).map((row, index) => {
    if (row.length !== 2) return { record_type: row[0], payload_error: 'COLUMN_COUNT', row_number: index + 2 };
    let payload; try { payload = JSON.parse(unneutralize(row[1])); } catch { return { record_type: unneutralize(row[0]), payload_error: 'PAYLOAD_JSON', row_number: index + 2 }; }
    return { record_type: unneutralize(row[0]), payload, row_number: index + 2 };
  });
  return { records, delimiter, embeddedManifest: null };
}

function envelopeAad(envelope) {
  return canonical({ purpose: 'finance-os-portable-export', envelope_version: envelope.envelope_version, algorithm: envelope.algorithm, key_id: envelope.key_id, manifest: envelope.manifest });
}

function assertRecipientKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) fail('INVALID_RECIPIENT_KEY', 'A caller-supplied 32-byte recipient key is required.');
}

function openPortableEnvelope(envelope, recipientKey) {
  assertRecipientKey(recipientKey);
  if (!envelope || envelope.envelope_version !== PORTABLE_ENVELOPE_VERSION || envelope.algorithm !== 'AES-256-GCM' || typeof envelope.key_id !== 'string' || !envelope.key_id) fail('INVALID_EXPORT_ENVELOPE', 'The portable export envelope is invalid.');
  assertSchema('export', envelope.manifest);
  const aad = Buffer.from(envelopeAad(envelope));
  if (envelope.aad_sha256 !== sha256(aad) || envelope.ciphertext_sha256 !== sha256(Buffer.from(envelope.ciphertext_b64 || '', 'base64'))) fail('EXPORT_INTEGRITY_FAILED', 'The portable export integrity check failed.');
  const sealed = Buffer.from(envelope.ciphertext_b64 || '', 'base64');
  if (sealed.length < 17) fail('EXPORT_AUTHENTICATION_FAILED', 'The portable export authentication check failed.');
  try {
    const nonce = Buffer.from(envelope.nonce_b64 || '', 'base64'); const tag = sealed.subarray(-16); const body = sealed.subarray(0, -16);
    const decipher = createDecipheriv('aes-256-gcm', recipientKey, nonce); decipher.setAAD(aad); decipher.setAuthTag(tag);
    return { plaintext: Buffer.concat([decipher.update(body), decipher.final()]), manifest: envelope.manifest };
  } catch { fail('EXPORT_AUTHENTICATION_FAILED', 'The portable export authentication check failed.'); }
}

function structuralResult(record, rowNumber, context) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { status: 'rejected', error_code: 'INVALID_ROW', row_number: rowNumber };
  const recordType = record.record_type; const payload = record.payload;
  if (!RECORD_TYPES.includes(recordType) || record.payload_error || !payload || typeof payload !== 'object' || Array.isArray(payload)) return { status: 'rejected', error_code: record.payload_error || 'INVALID_RECORD', row_number: record.row_number || rowNumber };
  const normalizedHash = sha256({ record_type: recordType, payload });
  const batch = { schema_version: '1.0.0', batch_id: context.batchId, format: context.format, source_name: context.sourceName, source_fingerprint: context.sourceFingerprint, encoding: context.encoding, mapping_version: context.mappingVersion, created_at: context.createdAt, mode: 'dry_run', commit_mode: context.commitMode, rows: [{ row_number: record.row_number || rowNumber, normalized_hash: normalizedHash, idempotency_key: `${context.batchId}:${normalizedHash}`, record_type: recordType, payload }] };
  if (!validateSchema('import', batch).valid) return { status: 'rejected', error_code: 'SCHEMA_VALIDATION_FAILED', row_number: record.row_number || rowNumber, normalized_hash: normalizedHash, record_type: recordType };
  return { status: 'accepted', row_number: record.row_number || rowNumber, normalized_hash: normalizedHash, record_type: recordType, payload };
}

function existingImportHashes(store) {
  return new Set(store.idempotency_receipts.flatMap(receipt => receipt.import_row_hashes || []));
}

function probableDuplicate(store, row) {
  if (row.record_type !== 'ledger_entry') return false;
  const value = row.payload; const at = Date.parse(value.occurred_at);
  return store.ledger_entries.some(entry => entry.account_id === value.account_id && entry.amount?.minor_units === value.amount?.minor_units && entry.amount?.currency === value.amount?.currency && entry.category === value.category && Number.isFinite(at) && Math.abs(Date.parse(entry.occurred_at) - at) <= 72 * 60 * 60 * 1000);
}

function mergeRows(store, rows) {
  const next = structuredClone(store);
  for (const row of rows) {
    if (row.record_type === 'preferences') next.preferences = structuredClone(row.payload);
    else next[TYPE_TO_COLLECTION[row.record_type]].push(structuredClone(row.payload));
  }
  return next;
}

function classifySemantics(store, rows, allowedDuplicates) {
  const seenHashes = new Set(); const importedHashes = existingImportHashes(store); const ids = new Set();
  const preferences = rows.filter(row => row.status === 'accepted' && row.record_type === 'preferences');
  if (preferences.length > 1) for (const row of preferences) { row.status = 'rejected'; row.error_code = 'MULTIPLE_PREFERENCES'; }
  for (const collection of Object.values(TYPE_TO_COLLECTION).filter(name => name !== 'preferences')) for (const item of store[collection]) if (item.id) ids.add(item.id);
  for (const row of rows) {
    if (row.status !== 'accepted') continue;
    if (seenHashes.has(row.normalized_hash) || importedHashes.has(row.normalized_hash)) { row.status = 'duplicate'; row.error_code = 'EXACT_REPLAY'; continue; }
    seenHashes.add(row.normalized_hash);
    if (row.payload.id && ids.has(row.payload.id)) { row.status = 'duplicate'; row.error_code = 'DUPLICATE_ID'; continue; }
    if (row.payload.id) ids.add(row.payload.id);
    if (probableDuplicate(store, row) && !allowedDuplicates.has(row.normalized_hash)) { row.status = 'ambiguous'; row.error_code = 'POSSIBLE_DUPLICATE'; }
  }
  const accepted = rows.filter(row => row.status === 'accepted');
  try { validateStore(mergeRows(store, accepted)); }
  catch {
    for (const row of accepted) { row.status = 'rejected'; row.error_code = 'SEMANTIC_VALIDATION_FAILED'; }
  }
  return rows;
}

function reportCounts(rows) {
  const counts = { total: rows.length, accepted: 0, rejected: 0, ambiguous: 0, duplicate: 0 };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

function totals(rows) {
  const byRecordType = {}; const byCurrency = {};
  for (const row of rows.filter(item => item.status === 'accepted')) {
    byRecordType[row.record_type] = (byRecordType[row.record_type] || 0) + 1;
    const visit = value => { if (!value || typeof value !== 'object') return; if (typeof value.minor_units === 'string' && typeof value.currency === 'string') byCurrency[value.currency] = (BigInt(byCurrency[value.currency] || '0') + BigInt(value.minor_units)).toString(); else for (const child of Object.values(value)) visit(child); };
    visit(row.payload);
  }
  return { by_record_type: byRecordType, by_currency_minor_units: byCurrency };
}

async function decodedSource(filePath, options, limits) {
  const original = await readBounded(filePath, limits); const sourceFingerprint = sha256(original);
  let bytes = original; let embeddedManifest = null;
  if (options.encrypted) {
    let envelope; try { envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(original)); } catch { fail('INVALID_EXPORT_ENVELOPE', 'The encrypted export envelope is malformed.'); }
    const opened = openPortableEnvelope(envelope, options.recipientKey); bytes = opened.plaintext; embeddedManifest = opened.manifest;
  }
  const decoded = decode(bytes, options.encoding || 'auto');
  return { ...decoded, sourceFingerprint, embeddedManifest };
}

async function buildImportPreview(store, filePath, options = {}) {
  validateStore(store); const start = Date.now(); const limits = limitsFor(options.limits); const source = await decodedSource(filePath, options, limits); deadline(start, limits);
  const format = options.format || source.embeddedManifest?.format;
  if (!['csv', 'json'].includes(format)) fail('UNSUPPORTED_FORMAT', 'The import format must be declared as CSV or JSON.');
  const parsed = parseRecords(source.text, format, options, limits, start); const batchId = options.batchId || randomUUID(); const createdAt = new Date().toISOString(); const mappingVersion = options.mappingVersion || INTERCHANGE_VERSION; const commitMode = options.commitMode || 'atomic';
  if (mappingVersion !== INTERCHANGE_VERSION) fail('UNSUPPORTED_MAPPING', 'The import mapping version is unsupported.');
  if (!['atomic', 'partial'].includes(commitMode)) fail('INVALID_IMPORT_MODE', 'The import commit mode is invalid.');
  const context = { batchId, format, sourceName: basename(filePath), sourceFingerprint: source.sourceFingerprint, encoding: source.encoding, mappingVersion, createdAt, commitMode };
  let rows = parsed.records.map((record, index) => structuralResult(record, index + 1, context));
  const allowedDuplicateHashes = [...new Set(options.allowPossibleDuplicateHashes || [])].sort();
  rows = classifySemantics(store, rows, new Set(allowedDuplicateHashes));
  const acceptedHashes = new Set(rows.filter(row => row.status === 'accepted').map(row => row.normalized_hash));
  const selected = commitMode === 'partial' ? [...new Set(options.selectedRowHashes || [])] : [...acceptedHashes];
  if (commitMode === 'partial' && (!selected.length || selected.some(hash => !acceptedHashes.has(hash)))) fail('INVALID_PARTIAL_SELECTION', 'Partial import selection must contain only accepted row hashes.');
  const counts = reportCounts(rows);
  const binding = { batch_id: batchId, source_fingerprint: source.sourceFingerprint, mapping_version: mappingVersion, expected_store_version: store.store_version, commit_mode: commitMode, selected_row_hashes: selected, allowed_duplicate_hashes: allowedDuplicateHashes, format, encoding: source.encoding, delimiter: parsed.delimiter };
  const confirmationHash = sha256(binding);
  return {
    status: 'confirmation_required', ...binding, confirmation_hash: confirmationHash, created_at: createdAt, source_name: basename(filePath), counts, totals: totals(rows),
    warnings: rows.filter(row => ['ambiguous', 'duplicate'].includes(row.status)).slice(0, limits.errors).map(row => ({ row_number: row.row_number, code: row.error_code })),
    errors: rows.filter(row => row.status === 'rejected').slice(0, limits.errors).map(row => ({ row_number: row.row_number, code: row.error_code })),
    rows: rows.map(({ payload, ...row }) => row), _accepted_rows: rows.filter(row => row.status === 'accepted').map(row => ({ record_type: row.record_type, payload: row.payload, normalized_hash: row.normalized_hash }))
  };
}

export async function previewImport(store, filePath, options = {}) {
  const preview = await buildImportPreview(store, filePath, options); const { _accepted_rows, ...safePreview } = preview; return safePreview;
}

function appendAudit(store, auditKey, { action, actor, channel, targetIds, idempotencyKey }) {
  const priorVersion = store.store_version; const event = { id: randomUUID(), occurred_at: new Date().toISOString(), actor_ref: actor, channel, action, target_ids: [...new Set(targetIds)], previous_store_version: priorVersion, new_store_version: priorVersion + 1, idempotency_key: idempotencyKey, outcome: 'accepted', previous_event_auth: store.audit_events.length ? store.audit_events.at(-1).event_auth : 'GENESIS', auth_algorithm: 'HMAC-SHA-256', key_version: 1 };
  event.event_auth = hmac(auditKey, event); store.store_version += 1; store.audit_events.push(event); return event;
}

export async function commitImport(dataDir, keys, filePath, proposal, confirmationHash, options = {}) {
  if (!proposal || proposal.status !== 'confirmation_required' || !safeEqual(proposal.confirmation_hash, confirmationHash || '')) fail('CONFIRMATION_REQUIRED', 'Fresh confirmation of the exact import preview is required.');
  const current = await load(dataDir, keys);
  const prior = current.idempotency_receipts.find(receipt => receipt.import_batch_id === proposal.batch_id);
  if (prior) {
    if (!safeEqual(prior.request_hash, proposal.confirmation_hash) || !safeEqual(prior.input_hash, proposal.source_fingerprint)) fail('IDEMPOTENCY_CONFLICT', 'This import batch identifier was already used for different content.');
    return { status: 'already_applied', replayed: true, batch_id: proposal.batch_id, import_mode: prior.import_mode, imported_count: prior.import_row_hashes.length, rejected_count: prior.import_rejected_count, store_version: prior.store_version, audit_id: prior.audit_id };
  }
  if (current.store_version !== proposal.expected_store_version) fail('STALE_IMPORT_PREVIEW', 'The store changed; review a new import preview.');
  if (options.signal?.aborted) fail('CANCELLED', 'The import was cancelled before mutation.');
  const fresh = await buildImportPreview(current, filePath, { ...options, format: proposal.format, encoding: proposal.encoding, delimiter: proposal.delimiter, batchId: proposal.batch_id, mappingVersion: proposal.mapping_version, commitMode: proposal.commit_mode, selectedRowHashes: proposal.selected_row_hashes, allowPossibleDuplicateHashes: proposal.allowed_duplicate_hashes });
  if (!safeEqual(fresh.confirmation_hash, proposal.confirmation_hash) || fresh.source_fingerprint !== proposal.source_fingerprint) fail('STALE_IMPORT_PREVIEW', 'The source or mapping changed; review a new import preview.');
  if (proposal.commit_mode === 'atomic' && (fresh.counts.rejected || fresh.counts.ambiguous || fresh.counts.duplicate)) fail('ATOMIC_IMPORT_REJECTED', 'Atomic import requires every row to be accepted.');
  const chosen = new Set(proposal.selected_row_hashes); const selected = fresh._accepted_rows.filter(row => chosen.has(row.normalized_hash));
  if (selected.length !== chosen.size) fail('STALE_IMPORT_PREVIEW', 'The selected import rows changed; review a new preview.');
  const result = await mutate(dataDir, keys, proposal.expected_store_version, store => {
    const next = mergeRows(store, selected); const action = proposal.commit_mode === 'partial' ? 'import_partial_committed' : 'import_committed';
    const event = appendAudit(next, keys.get('audit', 1), { action, actor: options.actor || 'local-operator', channel: 'import', targetIds: [proposal.batch_id], idempotencyKey: `import:${proposal.batch_id}` });
    next.idempotency_receipts.push({ key: `import:${proposal.batch_id}`, scope: `import:${proposal.batch_id}`, command_type: 'import_batch', accepted_at: event.occurred_at, result_ids: [proposal.batch_id], store_version: next.store_version, request_hash: proposal.confirmation_hash, input_hash: proposal.source_fingerprint, status: 'accepted', audit_id: event.id, import_batch_id: proposal.batch_id, import_mode: proposal.commit_mode, import_row_hashes: proposal.selected_row_hashes, import_rejected_count: proposal.counts.total - selected.length });
    validateStore(next); return next;
  });
  return { status: 'accepted', batch_id: proposal.batch_id, import_mode: proposal.commit_mode, imported_count: selected.length, rejected_count: proposal.counts.total - selected.length, store_version: result.store_version, audit_id: result.audit_events.at(-1).id };
}

function recordsFromStore(store, scope) {
  const requested = scope.record_types || RECORD_TYPES; const from = scope.date_from ? Date.parse(scope.date_from) : null; const to = scope.date_to ? Date.parse(scope.date_to) : null; const currencies = new Set(scope.currencies || []); const records = [];
  const include = payload => {
    const timestamp = payload.occurred_at || payload.valued_at || payload.observed_at || payload.created_at;
    if (from !== null && (!timestamp || Date.parse(timestamp) < from)) return false;
    if (to !== null && (!timestamp || Date.parse(timestamp) > to)) return false;
    if (currencies.size) { const found = []; const visit = value => { if (!value || typeof value !== 'object') return; if (typeof value.currency === 'string') found.push(value.currency); for (const child of Object.values(value)) visit(child); }; visit(payload); if (!found.some(currency => currencies.has(currency))) return false; }
    return true;
  };
  for (const recordType of requested) {
    if (!RECORD_TYPES.includes(recordType)) fail('INVALID_EXPORT_SCOPE', 'The export record scope is invalid.');
    if (recordType === 'preferences') { if (!from && !to && !currencies.size) records.push({ record_type: recordType, payload: structuredClone(store.preferences) }); continue; }
    for (const payload of store[TYPE_TO_COLLECTION[recordType]]) if (include(payload)) records.push({ record_type: recordType, payload: structuredClone(payload) });
  }
  records.sort((a, b) => RECORD_TYPES.indexOf(a.record_type) - RECORD_TYPES.indexOf(b.record_type) || String(a.payload.id || '').localeCompare(String(b.payload.id || '')));
  const portable = mergeRows({ ...store, store_version: 0, preferences: store.preferences, accounts: [], ledger_entries: [], transfers: [], investments: [], liabilities: [], budgets: [], goals: [], net_worth_snapshots: [], exchange_rates: [], audit_events: [], idempotency_receipts: [] }, records);
  validateStore(portable); return records;
}

function recordCounts(records) { const counts = {}; for (const record of records) { const key = TYPE_TO_COLLECTION[record.record_type]; counts[key] = (counts[key] || 0) + 1; } return counts; }
function serializeRecords(format, records, manifest) {
  if (format === 'json') return Buffer.from(`${canonical({ format_version: INTERCHANGE_VERSION, manifest, records })}\n`);
  const lines = ['record_type,payload_json', ...records.map(record => `${csvCell(record.record_type)},${csvCell(canonical(record.payload))}`)]; return Buffer.from(`${lines.join('\r\n')}\r\n`);
}

async function bindExportDestination(destination) {
  const requestedParent = dirname(destination); let canonicalParent;
  try { canonicalParent = await realpath(requestedParent); } catch { fail('INVALID_DESTINATION', 'The export parent directory must already exist.'); }
  const info = await stat(canonicalParent);
  if (!info.isDirectory()) fail('INVALID_DESTINATION', 'The export parent must be a local directory.');
  return { destination_parent: canonicalParent, destination_device: String(info.dev), destination_inode: String(info.ino), canonical_destination: join(canonicalParent, basename(destination)) };
}

function assertDestinationBinding(proposal, binding) {
  if (proposal.destination_parent !== binding.destination_parent || proposal.destination_device !== binding.destination_device || proposal.destination_inode !== binding.destination_inode || proposal.canonical_destination !== binding.canonical_destination) fail('EXPORT_DESTINATION_CHANGED', 'The export destination changed after confirmation.');
}

function exportBinding(proposal) {
  return { export_id: proposal.export_id, store_id: proposal.store_id, expected_store_version: proposal.expected_store_version, format: proposal.format, destination: proposal.destination, destination_parent: proposal.destination_parent, destination_device: proposal.destination_device, destination_inode: proposal.destination_inode, canonical_destination: proposal.canonical_destination, encrypted: proposal.encrypted, key_id: proposal.key_id, scope: proposal.scope, manifest: proposal.manifest };
}

function assertParentHandle(proposal, info) {
  if (!info.isDirectory() || String(info.dev) !== proposal.destination_device || String(info.ino) !== proposal.destination_inode) fail('EXPORT_DESTINATION_CHANGED', 'The export destination changed after confirmation.');
}

export async function previewExport(store, options = {}) {
  validateStore(store);
  if (!['csv', 'json'].includes(options.format)) fail('UNSUPPORTED_FORMAT', 'The export format must be CSV or JSON.');
  if (typeof options.destination !== 'string' || !isAbsolute(options.destination)) fail('INVALID_DESTINATION', 'An explicit absolute local destination is required.');
  const encrypted = options.encrypted === true; if (encrypted && (typeof options.keyId !== 'string' || !/^[A-Za-z0-9._:-]{1,120}$/.test(options.keyId))) fail('INVALID_KEY_ID', 'Encrypted export requires a non-secret key identifier.');
  const scope = { record_types: options.recordTypes || RECORD_TYPES, date_from: options.dateFrom || null, date_to: options.dateTo || null, currencies: options.currencies || [] };
  const destinationBinding = await bindExportDestination(options.destination);
  const records = recordsFromStore(store, scope); const exportId = options.exportId || randomUUID(); const createdAt = new Date().toISOString();
  const manifest = { schema_version: '1.0.0', export_id: exportId, store_id: store.store_id, store_version: store.store_version, format: options.format, created_at: createdAt, base_currency: store.preferences.base_currency, encrypted, file_name: basename(options.destination), record_counts: recordCounts(records), scope, ...(encrypted ? { key_id: options.keyId, envelope_version: PORTABLE_ENVELOPE_VERSION } : {}) };
  assertSchema('export', manifest);
  const binding = { export_id: exportId, store_id: store.store_id, expected_store_version: store.store_version, format: options.format, destination: options.destination, ...destinationBinding, encrypted, key_id: encrypted ? options.keyId : null, scope, manifest };
  return { status: 'confirmation_required', ...binding, confirmation_hash: sha256(binding), disclosure: encrypted ? 'recipient-key encrypted portable export' : 'plaintext financial-data disclosure', record_count: records.length };
}

async function syncDirectory(directory) { const handle = await open(directory, 'r'); try { await handle.sync(); } finally { await handle.close(); } }
const EXPORT_RECOVERY_PREFIX = '.export-recovery.';
function exportTempPath(destination) { return join(dirname(destination), `.${basename(destination)}.${randomUUID()}.tmp`); }
function exportRecoveryFile(dataDir, exportId) { return join(dataDir, `${EXPORT_RECOVERY_PREFIX}${exportId}.json`); }
function exportRecoveryPayload(exportId, destination, temp, encrypted) { return { version: 1, export_id: exportId, destination, temp, encrypted, created_at: new Date().toISOString() }; }
async function writeExportRecoveryJournal(dataDir, keys, payload) {
  const file = exportRecoveryFile(dataDir, payload.export_id); const body = { ...payload, authenticator: hmac(keys.get('audit', 1), payload) }; const handle = await open(file, 'wx', 0o600);
  try { await handle.writeFile(`${canonical(body)}\n`); await handle.sync(); } finally { await handle.close(); }
  await syncDirectory(dataDir); return file;
}
function validateExportRecovery(body, keys) {
  if (!body || body.version !== 1 || typeof body.export_id !== 'string' || typeof body.destination !== 'string' || typeof body.temp !== 'string' || typeof body.encrypted !== 'boolean' || typeof body.created_at !== 'string' || typeof body.authenticator !== 'string') fail('INVALID_EXPORT_RECOVERY', 'An export recovery record is invalid.');
  const { authenticator, ...payload } = body; if (!safeEqual(authenticator, hmac(keys.get('audit', 1), payload))) fail('INVALID_EXPORT_RECOVERY', 'An export recovery record failed authentication.');
  if (!isAbsolute(payload.destination) || !isAbsolute(payload.temp) || dirname(payload.destination) !== dirname(payload.temp) || !basename(payload.temp).startsWith(`.${basename(payload.destination)}.`) || !basename(payload.temp).endsWith('.tmp')) fail('INVALID_EXPORT_RECOVERY', 'An export recovery target is invalid.');
  return payload;
}
export async function recoverExportArtifacts(dataDir, keys) {
  const files = (await readdir(dataDir)).filter(name => name.startsWith(EXPORT_RECOVERY_PREFIX) && name.endsWith('.json')); let removed = 0;
  for (const name of files) {
    const journal = join(dataDir, name); const info = await lstat(journal); if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) fail('INVALID_EXPORT_RECOVERY', 'An export recovery record is unsafe.');
    let body; try { body = JSON.parse(await readFile(journal, 'utf8')); } catch { fail('INVALID_EXPORT_RECOVERY', 'An export recovery record is malformed.'); }
    const payload = validateExportRecovery(body, keys); const staged = await lstat(payload.temp).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
    if (staged) { if (!staged.isFile() || staged.isSymbolicLink()) fail('INVALID_EXPORT_RECOVERY', 'A staged export artifact is unsafe.'); await rm(payload.temp); await syncDirectory(dirname(payload.temp)); removed += 1; }
    await rm(journal); await syncDirectory(dataDir);
  }
  return { status: 'clean', journals: files.length, removed_staged_files: removed };
}
async function stageDestination(destination, temp, bytes) {
  const directory = dirname(destination); const existing = await lstat(destination).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (existing?.isSymbolicLink() || (existing && !existing.isFile())) fail('INVALID_DESTINATION', 'The export destination must be a regular local file.');
  const handle = await open(temp, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  return temp;
}

export async function commitExport(dataDir, keys, proposal, confirmationHash, options = {}) {
  if (!proposal || proposal.status !== 'confirmation_required' || !safeEqual(proposal.confirmation_hash, confirmationHash || '')) fail('CONFIRMATION_REQUIRED', 'Fresh confirmation of the exact export preview is required.');
  if (!safeEqual(proposal.confirmation_hash, sha256(exportBinding(proposal)))) fail('CONFIRMATION_REQUIRED', 'The confirmed export details were modified.');
  assertDestinationBinding(proposal, await bindExportDestination(proposal.destination));
  const store = await load(dataDir, keys); if (store.store_version !== proposal.expected_store_version || store.store_id !== proposal.store_id) fail('STALE_EXPORT_PREVIEW', 'The store changed; review a new export preview.');
  const records = recordsFromStore(store, proposal.scope); const manifest = { ...proposal.manifest, record_counts: recordCounts(records) }; assertSchema('export', manifest);
  const plaintext = serializeRecords(proposal.format, records, manifest); let output = plaintext;
  if (proposal.encrypted) {
    assertRecipientKey(options.recipientKey); const nonce = randomBytes(12); const base = { envelope_version: PORTABLE_ENVELOPE_VERSION, algorithm: 'AES-256-GCM', key_id: proposal.key_id, manifest }; const aad = Buffer.from(envelopeAad(base)); const cipher = createCipheriv('aes-256-gcm', options.recipientKey, nonce); cipher.setAAD(aad); const sealed = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
    output = Buffer.from(`${canonical({ ...base, nonce_b64: nonce.toString('base64'), aad_sha256: sha256(aad), ciphertext_b64: sealed.toString('base64'), ciphertext_sha256: sha256(sealed) })}\n`);
  }
  const destination = proposal.canonical_destination; const temp = exportTempPath(destination); let journal; const parentHandle = await open(proposal.destination_parent, 'r');
  try {
    assertParentHandle(proposal, await parentHandle.stat());
    journal = await writeExportRecoveryJournal(dataDir, keys, exportRecoveryPayload(proposal.export_id, destination, temp, proposal.encrypted));
    await stageDestination(destination, temp, output);
    if (process.env.FINANCE_OS_EXPORT_PAUSE_POINT === 'after_stage') { const marker = process.env.FINANCE_OS_EXPORT_PAUSE_MARKER; if (marker) { const handle = await open(marker, 'wx', 0o600); await handle.close(); } await new Promise(() => { setInterval(() => {}, 60_000); }); }
    if (options.signal?.aborted) fail('CANCELLED', 'The export was cancelled before disclosure.');
    assertDestinationBinding(proposal, await bindExportDestination(proposal.destination));
    assertParentHandle(proposal, await parentHandle.stat());
    const updated = await mutate(dataDir, keys, proposal.expected_store_version, current => { appendAudit(current, keys.get('audit', 1), { action: proposal.encrypted ? 'encrypted_export_created' : 'plaintext_export_created', actor: options.actor || 'local-operator', channel: 'local', targetIds: [proposal.export_id], idempotencyKey: `export:${proposal.export_id}` }); return current; });
    assertDestinationBinding(proposal, await bindExportDestination(proposal.destination));
    assertParentHandle(proposal, await parentHandle.stat());
    await rename(temp, destination); await syncDirectory(dirname(destination));
    return { status: 'created', export_id: proposal.export_id, format: proposal.format, encrypted: proposal.encrypted, record_count: records.length, store_version: updated.store_version, audit_id: updated.audit_events.at(-1).id, file_name: basename(proposal.destination), sha256: sha256(output) };
  } finally { await parentHandle.close(); await rm(temp, { force: true }); if (journal) await rm(journal, { force: true }); }
}
