import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fail } from './errors.mjs';

export class SyntheticKeyProvider {
  constructor(seed = Buffer.alloc(32, 7)) { this.keys = new Map([['store:1', Buffer.from(seed)], ['audit:1', Buffer.alloc(32, 9)]]); }
  get(purpose, version = 1) { const key = this.keys.get(`${purpose}:${version}`); if (!key) fail('KEY_UNAVAILABLE', 'The requested key version is unavailable.'); return Buffer.from(key); }
  create(purpose, version) { const key = randomBytes(32); this.keys.set(`${purpose}:${version}`, key); return Buffer.from(key); }
  set(purpose, version, key) { if (!Buffer.isBuffer(key) || key.length !== 32) fail('INVALID_KEY', 'A 256-bit key is required.'); this.keys.set(`${purpose}:${version}`, Buffer.from(key)); }
  delete(purpose, version = 1) { return this.keys.delete(`${purpose}:${version}`); }
}

export class MacOSKeychainProvider {
  constructor(servicePrefix = 'finance-os.synthetic-gate') {
    if (process.platform !== 'darwin') fail('UNSUPPORTED_PLATFORM', 'This key provider supports macOS only.');
    this.prefix = servicePrefix;
  }
  account(purpose, version) { return `${purpose}-v${version}`; }
  get(purpose, version = 1) {
    try {
      const out = execFileSync('/usr/bin/security', ['find-generic-password', '-s', this.prefix, '-a', this.account(purpose, version), '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      const key = Buffer.from(out, 'base64');
      if (key.length !== 32) fail('KEY_INVALID', 'The platform key store returned an invalid key.');
      return key;
    } catch { fail('KEY_UNAVAILABLE', 'The platform key is unavailable.'); }
  }
  create(purpose, version) {
    const key = randomBytes(32);
    try {
      execFileSync('/usr/bin/security', ['add-generic-password', '-s', this.prefix, '-a', this.account(purpose, version), '-w', key.toString('base64')], { stdio: 'ignore' });
      return key;
    } catch { fail('KEY_STORE_FAILURE', 'The platform key could not be created.'); }
  }
  delete(purpose, version = 1) {
    try { execFileSync('/usr/bin/security', ['delete-generic-password', '-s', this.prefix, '-a', this.account(purpose, version)], { stdio: 'ignore' }); return true; }
    catch { return false; }
  }
}
