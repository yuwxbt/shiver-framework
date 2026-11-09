import { ShiverError } from './errors.js';

const UNITS = { ms: 1, s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 };

export function ms(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === 'string') {
    let total = 0;
    let matched = '';
    for (const [, amount, unit] of value.matchAll(/(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)/g)) {
      total += Number(amount) * UNITS[unit];
      matched += amount + unit;
    }
    if (matched && matched.length === value.replace(/\s+/g, '').length) return total;
  }
  throw new ShiverError('INVALID_DURATION', `Invalid duration ${JSON.stringify(value)}. Use milliseconds or a string like "5s", "10m", "1h30m".`);
}

const COLORS = {
  blurple: 0x5865f2, green: 0x57f287, yellow: 0xfee75c, fuchsia: 0xeb459e, red: 0xed4245,
  white: 0xffffff, black: 0x000001, gray: 0x99aab5, grey: 0x99aab5, orange: 0xe67e22,
  blue: 0x3498db, purple: 0x9b59b6, pink: 0xff69b4, teal: 0x1abc9c,
};

export function resolveColor(color) {
  if (color == null) return undefined;
  if (typeof color === 'number' && color >= 0 && color <= 0xffffff) return Math.floor(color);
  if (typeof color === 'string') {
    const key = color.toLowerCase();
    if (Object.hasOwn(COLORS, key)) return COLORS[key];
    const hex = color.replace(/^#/, '');
    if (/^[0-9a-f]{6}$/i.test(hex)) return parseInt(hex, 16);
    if (/^[0-9a-f]{3}$/i.test(hex)) return parseInt([...hex].map((c) => c + c).join(''), 16);
  }
  throw new ShiverError('INVALID_COLOR', `Invalid color ${JSON.stringify(color)}. Use a number, "#rrggbb", or one of: ${Object.keys(COLORS).join(', ')}.`);
}

export function clean(object) {
  for (const key in object) if (object[key] === undefined) delete object[key];
  return object;
}

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function traceId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}
