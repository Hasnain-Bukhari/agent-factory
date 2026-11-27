import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMinor, convertMinor, convertBetweenMinor, money, add } from '../src/money.mjs';

test('currency exponents and exact parsing',()=>{assert.equal(parseMinor('123.45','THB'),'12345');assert.equal(parseMinor('123','JPY'),'123');assert.equal(parseMinor('0.00000001','BTC'),'1');});
test('forbids floats and excess precision',()=>{assert.throws(()=>parseMinor(1.2,'THB'));assert.throws(()=>parseMinor('1.001','THB'));assert.throws(()=>money('1.0','THB'));});
test('round-half-even is deterministic',()=>{assert.equal(convertMinor('1','2.5'),'2');assert.equal(convertMinor('3','2.5'),'8');assert.equal(convertMinor('-3','2.5'),'-8');});
test('cross-currency conversion respects currency exponents',()=>{assert.equal(convertBetweenMinor('100','JPY','THB','0.25'),'2500');assert.equal(convertBetweenMinor('100000000','BTC','THB','3500000'),'350000000');});
test('integer addition rejects mixed currencies',()=>{assert.deepEqual(add(money('2','THB'),money('3','THB')),money('5','THB'));assert.throws(()=>add(money('1','THB'),money('1','USD')));});
test('unsupported currency fails closed',()=>assert.throws(()=>money('1','ZZZ')));
