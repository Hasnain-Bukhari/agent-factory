import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { sha256 } from './canonical.mjs';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const text = value => typeof value === 'string' ? value : '';
const equal = (a, b) => {
  const aa = Buffer.from(text(a));
  const bb = Buffer.from(text(b));
  return aa.length === bb.length && timingSafeEqual(aa, bb);
};
const fail = (code, status = 400) => Object.assign(new Error(code), { code, status });
const boundedString = (value, name, max = 120) => {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) throw fail(`INVALID_${name.toUpperCase()}`);
  return value;
};
const ownKeys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key));

function localRequest(request, requireOrigin = false) {
  const host = text(request.host).replace(/:\d{1,5}$/u, '');
  if (!LOCAL_HOSTS.has(host)) throw fail('LOCAL_ONLY', 403);
  if (!request.origin) {
    if (requireOrigin) throw fail('ORIGIN_REQUIRED', 403);
    return;
  }
  let origin;
  try { origin = new URL(request.origin); } catch { throw fail('ORIGIN_FORBIDDEN', 403); }
  if (origin.protocol !== 'http:' || !LOCAL_HOSTS.has(origin.hostname)) throw fail('ORIGIN_FORBIDDEN', 403);
}

export class LocalSessionAuthority {
  constructor({ password, secret = randomBytes(32), now = Date.now, ttlMs = 30 * 60_000, idleMs = 10 * 60_000, maxSessions = 8, maxLoginAttempts = 5, loginWindowMs = 60_000 } = {}) {
    if (typeof password !== 'string' || password.length < 16 || password.length > 256) throw new Error('A strong local dashboard password is required.');
    this.now = now;
    this.ttlMs = ttlMs;
    this.idleMs = idleMs;
    this.maxSessions = maxSessions;
    this.maxLoginAttempts = maxLoginAttempts;
    this.loginWindowMs = loginWindowMs;
    this.secret = Buffer.from(secret);
    if (this.secret.length < 32) throw new Error('Session signing secret must be at least 32 bytes.');
    this.salt = randomBytes(16);
    this.passwordHash = scryptSync(password, this.salt, 32, { N: 16_384, r: 8, p: 1 });
    this.sessions = new Map();
    this.loginAttempts = { startedAt: 0, count: 0 };
  }

  #sign(payload) { return createHmac('sha256', this.secret).update(payload).digest('base64url'); }

  #verifyPassword(password) {
    if (typeof password !== 'string' || password.length > 256) return false;
    const candidate = scryptSync(password, this.salt, 32, { N: 16_384, r: 8, p: 1 });
    return timingSafeEqual(candidate, this.passwordHash);
  }

  login(password, request) {
    localRequest(request, true);
    const now = this.now();
    if (now - this.loginAttempts.startedAt >= this.loginWindowMs) this.loginAttempts = { startedAt: now, count: 0 };
    if (this.loginAttempts.count >= this.maxLoginAttempts) throw fail('AUTH_RATE_LIMITED', 429);
    if (!this.#verifyPassword(password)) {
      this.loginAttempts.count++;
      throw fail('AUTH_FAILED', 401);
    }
    this.loginAttempts = { startedAt: now, count: 0 };
    for (const [id, session] of this.sessions) if (session.expiresAt <= now || now - session.lastSeen > this.idleMs) this.sessions.delete(id);
    if (this.sessions.size >= this.maxSessions) throw fail('SESSION_LIMIT', 429);
    const id = randomBytes(24).toString('base64url');
    const csrf = randomBytes(32).toString('base64url');
    const session = { id, csrf, createdAt: now, lastSeen: now, expiresAt: now + this.ttlMs, scopes: new Set(['dashboard:read', 'dashboard:propose', 'dashboard:commit']) };
    this.sessions.set(id, session);
    const payload = Buffer.from(JSON.stringify({ id, expiresAt: session.expiresAt })).toString('base64url');
    const cookie = `${payload}.${this.#sign(payload)}`;
    return { cookie, csrf, expires_at: new Date(session.expiresAt).toISOString() };
  }

  authenticate(cookie, request, scope, csrf) {
    localRequest(request, request.method !== 'GET');
    const [payload, signature, extra] = text(cookie).split('.');
    if (!payload || !signature || extra || !equal(signature, this.#sign(payload))) throw fail('AUTH_REQUIRED', 401);
    let decoded;
    try { decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw fail('AUTH_REQUIRED', 401); }
    if (!ownKeys(decoded, ['id', 'expiresAt'])) throw fail('AUTH_REQUIRED', 401);
    const session = this.sessions.get(decoded.id);
    const now = this.now();
    if (!session || decoded.expiresAt !== session.expiresAt || session.expiresAt <= now || now - session.lastSeen > this.idleMs) {
      if (session) this.sessions.delete(session.id);
      throw fail('AUTH_REQUIRED', 401);
    }
    if (!session.scopes.has(scope)) throw fail('AUTH_FORBIDDEN', 403);
    if (request.method !== 'GET' && !equal(csrf, session.csrf)) throw fail('CSRF_REJECTED', 403);
    session.lastSeen = now;
    return session;
  }

  logout(cookie, request, csrf) {
    const session = this.authenticate(cookie, request, 'dashboard:read', csrf);
    this.sessions.delete(session.id);
  }

  revokeAll() {
    const revoked = this.sessions.size;
    this.sessions.clear();
    return { status: 'revoked', sessions: revoked };
  }
}

export function createApplicationClient(callTool) {
  if (typeof callTool !== 'function') throw new TypeError('A narrow application tool caller is required.');
  return Object.freeze({
    overview: () => callTool('finance_get_overview', {}),
    accounts: ({ offset = 0, limit = 25 } = {}) => callTool('finance_list_accounts', { offset, limit }),
    propose: ({ source_event_id, command }) => callTool('finance_propose_command', { source_event_id, command }),
    commit: ({ proposal_id, confirmation_hash }) => callTool('finance_commit_proposal', { proposal_id, confirmation_hash })
  });
}

const response = (status, body, headers = {}) => ({ status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'", 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', ...headers }, body });
const errorResponse = error => response(error.status || 500, { status: 'error', code: error.code && /^[A-Z0-9_]{2,60}$/u.test(error.code) ? error.code : 'INTERNAL_ERROR' });

export function createDashboardGateway({ sessions, application, maxBodyBytes = 32 * 1024 }) {
  if (!(sessions instanceof LocalSessionAuthority)) throw new TypeError('Local session authority is required.');
  if (!application || !['overview', 'accounts', 'propose', 'commit'].every(name => typeof application[name] === 'function')) throw new TypeError('Narrow application client is required.');
  return Object.freeze({
    async handle(request) {
      try {
        const method = text(request.method).toUpperCase();
        const path = text(request.path);
        const bodyBytes = Buffer.byteLength(request.rawBody || (request.body ? JSON.stringify(request.body) : ''));
        if (bodyBytes > maxBodyBytes) throw fail('REQUEST_TOO_LARGE', 413);
        if (method === 'POST' && path === '/session') {
          if (!ownKeys(request.body, ['password'])) throw fail('INVALID_REQUEST');
          const session = sessions.login(request.body.password, request);
          return response(201, { status: 'authenticated', csrf_token: session.csrf, expires_at: session.expires_at }, { 'Set-Cookie': `finance_os_session=${session.cookie}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(sessions.ttlMs / 1000)}` });
        }
        const cookie = request.cookies?.finance_os_session;
        const csrf = request.headers?.['x-csrf-token'];
        if (method === 'DELETE' && path === '/session') {
          sessions.logout(cookie, request, csrf);
          return response(204, null, { 'Set-Cookie': 'finance_os_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
        }
        if (method === 'GET' && path === '/overview') {
          sessions.authenticate(cookie, request, 'dashboard:read');
          return response(200, await application.overview());
        }
        if (method === 'GET' && path === '/accounts') {
          sessions.authenticate(cookie, request, 'dashboard:read');
          const offset = Number(request.query?.offset || 0), limit = Number(request.query?.limit || 25);
          if (!Number.isInteger(offset) || offset < 0 || offset > 10_000 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw fail('INVALID_PAGINATION');
          return response(200, await application.accounts({ offset, limit }));
        }
        if (method === 'POST' && path === '/proposals') {
          sessions.authenticate(cookie, request, 'dashboard:propose', csrf);
          if (!ownKeys(request.body, ['source_event_id', 'command'])) throw fail('INVALID_REQUEST');
          boundedString(request.body.source_event_id, 'source_event_id', 200);
          return response(200, await application.propose(request.body));
        }
        if (method === 'POST' && path === '/commits') {
          sessions.authenticate(cookie, request, 'dashboard:commit', csrf);
          if (!ownKeys(request.body, ['proposal_id', 'confirmation_hash', 'confirmation'])) throw fail('INVALID_REQUEST');
          boundedString(request.body.proposal_id, 'proposal_id', 80);
          if (!/^[a-f0-9]{64}$/u.test(text(request.body.confirmation_hash))) throw fail('INVALID_CONFIRMATION');
          const exact = `CONFIRM ${request.body.confirmation_hash}`;
          if (!equal(request.body.confirmation, exact)) throw fail('CONFIRMATION_REQUIRED', 409);
          return response(200, await application.commit({ proposal_id: request.body.proposal_id, confirmation_hash: request.body.confirmation_hash }));
        }
        throw fail('NOT_FOUND', 404);
      } catch (error) { return errorResponse(error); }
    }
  });
}

const positiveIntegerString = value => typeof value === 'string' && /^(?:0|[1-9][0-9]{0,30})$/u.test(value);
const feedString = (value, max = 80) => typeof value === 'string' && value.length >= 1 && value.length <= max && /^[A-Za-z0-9._:/-]+$/u.test(value);
const scheduleName = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/u.test(value);

function validateFeed(payload, { maxRecords, now, futureSkewMs }) {
  if (!ownKeys(payload, ['observed_at', 'records']) || !Array.isArray(payload.records) || payload.records.length > maxRecords) throw fail('FEED_INVALID');
  const observed = Date.parse(payload.observed_at);
  if (!Number.isFinite(observed) || observed > now + futureSkewMs) throw fail('FEED_INVALID');
  const records = payload.records.map(record => {
    if (!ownKeys(record, ['instrument', 'kind', 'minor_units', 'currency', 'base_currency', 'quote_currency', 'numerator', 'denominator', 'estimated', 'converted'])) throw fail('FEED_INVALID');
    if (!feedString(record.instrument)) throw fail('FEED_INVALID');
    if (record.kind === 'price') {
      if (!positiveIntegerString(record.minor_units) || !/^[A-Z]{3}$/u.test(text(record.currency))) throw fail('FEED_INVALID');
    } else if (record.kind === 'exchange_rate') {
      if (!/^[A-Z]{3}$/u.test(text(record.base_currency)) || !/^[A-Z]{3}$/u.test(text(record.quote_currency)) || !positiveIntegerString(record.numerator) || !positiveIntegerString(record.denominator) || record.denominator === '0') throw fail('FEED_INVALID');
    } else throw fail('FEED_INVALID');
    return Object.freeze({ ...record, data_label: record.estimated ? 'estimated' : record.converted ? 'converted' : 'observed' });
  });
  return Object.freeze({ observed_at: new Date(observed).toISOString(), records });
}

export class BoundedFeedClient {
  constructor({ now = Date.now, retries = 2, timeoutMs = 250, maxBytes = 32 * 1024, maxRecords = 100, freshMs = 5 * 60_000, staleMs = 24 * 60 * 60_000, futureSkewMs = 60_000, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
    Object.assign(this, { now, retries, timeoutMs, maxBytes, maxRecords, freshMs, staleMs, futureSkewMs, sleep });
    this.cache = new Map();
  }

  async refresh(source, fetcher) {
    if (!feedString(source, 60) || typeof fetcher !== 'function') throw fail('FEED_CONFIG_INVALID');
    let lastError;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const raw = await Promise.race([
          fetcher({ signal: controller.signal, attempt }),
          new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(fail('FEED_TIMEOUT', 504)), { once: true }))
        ]);
        const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(typeof raw === 'string' ? raw : JSON.stringify(raw));
        if (bytes.length > this.maxBytes) throw fail('FEED_TOO_LARGE', 413);
        let payload;
        try { payload = JSON.parse(bytes.toString('utf8')); } catch { throw fail('FEED_INVALID'); }
        const validated = validateFeed(payload, { maxRecords: this.maxRecords, now: this.now(), futureSkewMs: this.futureSkewMs });
        const entry = Object.freeze({ ...validated, provenance: `synthetic:${source}`, fetched_at: new Date(this.now()).toISOString() });
        this.cache.set(source, entry);
        return { state: 'fresh', stale: false, ...entry };
      } catch (error) {
        lastError = error;
        if (['FEED_INVALID', 'FEED_TOO_LARGE'].includes(error.code)) break;
        if (attempt < this.retries) await this.sleep(Math.min(25 * (2 ** attempt), 100));
      } finally { clearTimeout(timer); }
    }
    const cached = this.read(source);
    return { ...cached, outage: true, error_code: lastError?.code || 'FEED_UNAVAILABLE' };
  }

  read(source) {
    const entry = this.cache.get(source);
    if (!entry) return { state: 'missing', stale: false, observed_at: null, provenance: `synthetic:${source}`, records: [] };
    const age = this.now() - Date.parse(entry.observed_at);
    if (age > this.staleMs) return { state: 'missing', stale: true, observed_at: entry.observed_at, provenance: entry.provenance, records: [] };
    return { state: age > this.freshMs ? 'stale' : 'fresh', stale: age > this.freshMs, ...entry };
  }
}

export class InMemoryScheduleState {
  constructor() { this.configs = new Map(); this.runs = new Map(); this.active = new Set(); }
  configure(name, config) { this.configs.set(name, Object.freeze({ ...config })); }
  config(name) { return this.configs.get(name); }
  claim(name, key) { if (this.runs.has(key) || this.active.has(name)) return false; this.active.add(name); this.runs.set(key, { status: 'running' }); return true; }
  finish(name, key, receipt) { this.active.delete(name); this.runs.set(key, Object.freeze(receipt)); }
  receipt(key) { return this.runs.get(key); }
  overlapping(name) { return this.active.has(name); }
}

export class LeastPrivilegeScheduler {
  constructor({ tasks, state = new InMemoryScheduleState(), audit = () => {}, now = Date.now } = {}) {
    if (!tasks || typeof tasks !== 'object') throw new TypeError('Scheduled tasks are required.');
    this.tasks = Object.freeze({ ...tasks }); this.state = state; this.audit = audit; this.now = now;
  }

  configure(name, change) {
    const task = this.tasks[name];
    if (!scheduleName(name) || !task || !Array.isArray(task.capabilities) || typeof task.run !== 'function') throw fail('SCHEDULE_UNKNOWN');
    if (!ownKeys(change, ['enabled', 'paused', 'required_capabilities'])) throw fail('SCHEDULE_CONFIG_INVALID');
    const required = change.required_capabilities || [];
    if (!Array.isArray(required) || required.some(capability => !task.capabilities.includes(capability))) throw fail('SCHEDULE_PRIVILEGE_FORBIDDEN', 403);
    const config = { enabled: change.enabled === true, paused: change.paused === true, required_capabilities: [...new Set(required)].sort() };
    this.state.configure(name, config);
    this.audit({ id: randomUUID(), action: 'schedule_config_changed', subject: name, config_hash: sha256(config), at: new Date(this.now()).toISOString() });
    return config;
  }

  async run(name, scheduledFor) {
    const task = this.tasks[name], config = this.state.config(name);
    if (!task || !config) return { status: 'not_configured' };
    if (!config.enabled) return { status: 'disabled' };
    if (config.paused) return { status: 'paused' };
    const instant = new Date(scheduledFor);
    if (!Number.isFinite(instant.getTime())) throw fail('SCHEDULE_TIME_INVALID');
    const runId = sha256({ name, scheduled_for: instant.toISOString() });
    const key = `${name}:${runId}`;
    const prior = this.state.receipt(key);
    if (prior?.status === 'running') return { status: 'overlap_prevented', run_id: runId };
    if (prior) return { ...prior, replayed: true };
    if (this.state.overlapping(name) || !this.state.claim(name, key)) return { status: 'overlap_prevented', run_id: runId };
    const sourceEventId = `schedule:${name}:${runId}`;
    try {
      const result = await task.run(Object.freeze({ source_event_id: sourceEventId, capabilities: Object.freeze([...config.required_capabilities]) }));
      const receipt = { status: 'completed', run_id: runId, source_event_id: sourceEventId, result_digest: sha256(result ?? null), replayed: false };
      this.state.finish(name, key, receipt);
      return receipt;
    } catch {
      const receipt = { status: 'failed', run_id: runId, source_event_id: sourceEventId, error_code: 'TASK_FAILED', replayed: false };
      this.state.finish(name, key, receipt);
      return receipt;
    }
  }
}

export class OfflineNotificationResponder {
  constructor({ fail = false } = {}) { this.fail = fail; this.deliveries = []; }
  async send(message) { if (this.fail) throw new Error('offline responder failure'); this.deliveries.push(Object.freeze({ ...message })); return { accepted: true }; }
}

function localHour(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  return Number(parts.find(part => part.type === 'hour').value);
}
const inQuietHours = (hour, start, end) => start === end ? true : start < end ? hour >= start && hour < end : hour >= start || hour < end;

export class MinimalNotifier {
  constructor({ responder, now = Date.now, timeZone = 'Asia/Bangkok', audit = () => {} } = {}) {
    if (!responder || typeof responder.send !== 'function') throw new TypeError('Notification responder is required.');
    Object.assign(this, { responder, now, timeZone, audit });
    this.config = Object.freeze({ opted_in: false, enabled: false, quiet_start: 22, quiet_end: 7, allowed_codes: [] });
    this.seen = new Set();
  }

  configure(change) {
    if (!ownKeys(change, ['opted_in', 'enabled', 'quiet_start', 'quiet_end', 'allowed_codes'])) throw fail('NOTIFICATION_CONFIG_INVALID');
    const start = change.quiet_start, end = change.quiet_end;
    if (![start, end].every(value => Number.isInteger(value) && value >= 0 && value <= 23) || !Array.isArray(change.allowed_codes) || change.allowed_codes.length > 20 || change.allowed_codes.some(code => !feedString(code, 60))) throw fail('NOTIFICATION_CONFIG_INVALID');
    this.config = Object.freeze({ opted_in: change.opted_in === true, enabled: change.enabled === true, quiet_start: start, quiet_end: end, allowed_codes: [...new Set(change.allowed_codes)] });
    this.audit({ id: randomUUID(), action: 'notification_config_changed', config_hash: sha256(this.config), at: new Date(this.now()).toISOString() });
    return this.config;
  }

  async notify(event) {
    if (!ownKeys(event, ['code', 'severity', 'dedupe_key'])) throw fail('NOTIFICATION_CONTENT_FORBIDDEN');
    if (!feedString(event.code, 60) || !['info', 'warning', 'critical'].includes(event.severity) || !feedString(event.dedupe_key, 100)) throw fail('NOTIFICATION_CONTENT_FORBIDDEN');
    if (!this.config.opted_in || !this.config.enabled) return { status: 'disabled' };
    if (!this.config.allowed_codes.includes(event.code)) return { status: 'not_allowed' };
    if (this.seen.has(event.dedupe_key)) return { status: 'duplicate' };
    const at = new Date(this.now());
    if (event.severity !== 'critical' && inQuietHours(localHour(at, this.timeZone), this.config.quiet_start, this.config.quiet_end)) return { status: 'quiet_hours' };
    this.seen.add(event.dedupe_key);
    try {
      await this.responder.send({ code: event.code, severity: event.severity, occurred_at: at.toISOString() });
      return { status: 'delivered' };
    } catch {
      this.seen.delete(event.dedupe_key);
      return { status: 'delivery_failed', error_code: 'NOTIFICATION_DELIVERY_FAILED' };
    }
  }
}

export const phase6BoundaryEvidence = Object.freeze({
  dashboard_dependencies: Object.freeze(['application-tools']),
  forbidden_dependencies: Object.freeze(['storage', 'keys', 'filesystem']),
  network_feeds: 'injected-synthetic-fetcher-only',
  notifications: 'injected-offline-responder-only'
});
