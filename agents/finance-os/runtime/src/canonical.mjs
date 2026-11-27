import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(v=>v===undefined?'null':canonical(v)).join(',')}]`;
  return `{${Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

export const sha256 = value => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
export const hmac = (key, value) => createHmac('sha256', key).update(typeof value === 'string' ? value : canonical(value)).digest('base64');
export function safeEqual(a, b) {
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
