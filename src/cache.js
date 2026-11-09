import { Options } from 'discord.js';
import { ShiverError } from './errors.js';
import { ms } from './util.js';

export function messageCache({ maxPerChannel = 50, lifetime, interval = '1m' } = {}) {
  if (!Number.isSafeInteger(maxPerChannel) || maxPerChannel < 0) {
    throw new ShiverError('INVALID_CACHE', 'messageCache() needs a nonnegative integer maxPerChannel.');
  }
  const makeCache = Options.cacheWithLimits({ ...Options.DefaultMakeCacheSettings, MessageManager: maxPerChannel });
  if (lifetime === undefined || maxPerChannel === 0) return { makeCache };
  const seconds = (duration) => Math.ceil(ms(duration) / 1000);
  const expires = seconds(lifetime);
  const sweepEvery = seconds(interval);
  if (expires < 1 || sweepEvery < 1 || sweepEvery > 2147483) {
    throw new ShiverError('INVALID_CACHE', 'messageCache() needs positive message lifetime and sweep interval values.');
  }
  return {
    makeCache,
    sweepers: {
      ...Options.DefaultSweeperSettings,
      messages: { lifetime: expires, interval: sweepEvery },
    },
  };
}
