import { fail } from './errors.mjs';

export const EXPONENTS = Object.freeze({ THB: 2, USD: 2, EUR: 2, GBP: 2, JPY: 0, BTC: 8 });

export function assertCurrency(code) {
  if (!Object.hasOwn(EXPONENTS, code)) fail('UNSUPPORTED_CURRENCY', 'The currency is not supported by this release.');
  return code;
}

export function parseMinor(decimal, currency) {
  assertCurrency(currency);
  if (typeof decimal !== 'string' || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(decimal)) fail('INVALID_MONEY', 'Money must be a decimal string.');
  const exp = EXPONENTS[currency];
  const neg = decimal.startsWith('-');
  const [whole, fraction = ''] = (neg ? decimal.slice(1) : decimal).split('.');
  if (fraction.length > exp) fail('PRECISION_LOSS', 'The amount has more fractional digits than the currency supports.');
  const value = BigInt(whole) * (10n ** BigInt(exp)) + BigInt((fraction + '0'.repeat(exp)).slice(0, exp) || '0');
  return (neg ? -value : value).toString();
}

export function money(minorUnits, currency) {
  assertCurrency(currency);
  if (typeof minorUnits !== 'string' || !/^-?(?:0|[1-9]\d*)$/.test(minorUnits)) fail('INVALID_MONEY', 'Minor units must be an integer string.');
  return { minor_units: minorUnits, currency };
}

export const add = (a, b) => {
  if (a.currency !== b.currency) fail('CURRENCY_MISMATCH', 'Money currencies do not match.');
  return money((BigInt(a.minor_units) + BigInt(b.minor_units)).toString(), a.currency);
};

// Converts integer minor units using a positive decimal rate and round-half-even.
export function convertMinor(sourceMinor, rateText) {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(rateText) || BigInt(rateText.replace('.', '')) === 0n) fail('INVALID_RATE', 'Exchange rate must be a positive decimal string.');
  const [w, f = ''] = rateText.split('.');
  const denominator = 10n ** BigInt(f.length);
  const numerator = BigInt(w + f);
  const signed = BigInt(sourceMinor);
  const neg = signed < 0n;
  const raw = (neg ? -signed : signed) * numerator;
  let q = raw / denominator; const r = raw % denominator;
  if (r * 2n > denominator || (r * 2n === denominator && q % 2n === 1n)) q += 1n;
  return (neg ? -q : q).toString();
}

// Rate is target-currency major units per one source-currency major unit.
export function convertBetweenMinor(sourceMinor, sourceCurrency, targetCurrency, rateText) {
  assertCurrency(sourceCurrency); assertCurrency(targetCurrency);
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(rateText) || BigInt(rateText.replace('.', '')) === 0n) fail('INVALID_RATE', 'Exchange rate must be a positive decimal string.');
  const [w,f='']=rateText.split('.'); const rateNum=BigInt(w+f); const rateDen=10n**BigInt(f.length);
  const source=BigInt(sourceMinor); const neg=source<0n; const abs=neg?-source:source;
  const numerator=abs*rateNum*(10n**BigInt(EXPONENTS[targetCurrency]));
  const denominator=rateDen*(10n**BigInt(EXPONENTS[sourceCurrency]));
  let q=numerator/denominator; const r=numerator%denominator;
  if(r*2n>denominator||(r*2n===denominator&&q%2n===1n))q+=1n;
  return(neg?-q:q).toString();
}

export function sum(items, currency) {
  assertCurrency(currency);
  return items.reduce((n, x) => {
    if (x.currency !== currency) fail('CURRENCY_MISMATCH', 'Money currencies do not match.');
    return n + BigInt(x.minor_units);
  }, 0n).toString();
}
