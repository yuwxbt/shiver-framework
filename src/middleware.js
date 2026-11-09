import { PermissionsBitField } from 'discord.js';
import { ShiverError, UserError } from './errors.js';
import { ms } from './util.js';


export function compose(stack, handler) {
  return (ctx) => {
    let last = -1;
    const dispatch = (i) => {
      if (i <= last) return Promise.reject(new Error('next() called more than once in a middleware.'));
      last = i;
      const fn = i === stack.length ? handler : stack[i];
      return Promise.resolve().then(() => fn(ctx, () => dispatch(i + 1)));
    };
    return dispatch(0);
  };
}

const text = (ctx, key, ...args) => {
  const message = ctx.bot.options.messages[key];
  return typeof message === 'function' ? message(...args) : message;
};

const names = (bits) => new PermissionsBitField(bits).toArray().map((p) => p.replace(/([a-z])([A-Z])/g, '$1 $2')).join(', ');

export const guildOnly = () => (ctx, next) => {
  if (!ctx.guildId) throw new UserError(text(ctx, 'guildOnly'));
  return next();
};

export const dmOnly = () => (ctx, next) => {
  if (ctx.guildId) throw new UserError(text(ctx, 'dmOnly'));
  return next();
};

export const channelOnly = (...types) => {
  const allowed = new Set(types);
  return (ctx, next) => {
    if (!allowed.has(ctx.channel?.type)) throw new UserError(text(ctx, 'channelOnly'));
    return next();
  };
};

export const requireRoles = (...ids) => (ctx, next) => {
  if (!ctx.guildId) throw new UserError(text(ctx, 'guildOnly'));
  const roles = ctx.member?.roles;
  const hasRole = (id) => Array.isArray(roles) ? roles.includes(id) : roles?.cache?.has(id);
  if (!ids.every(hasRole)) throw new UserError(text(ctx, 'roles'));
  return next();
};

export const ownerOnly = () => (ctx, next) => {
  if (!ctx.bot.owners.has(ctx.user.id)) throw new UserError(text(ctx, 'ownerOnly'));
  return next();
};

export const nsfwOnly = () => (ctx, next) => {
  if (ctx.guildId && !ctx.channel?.nsfw) throw new UserError(text(ctx, 'nsfw'));
  return next();
};

export const requirePermissions = (...permissions) => {
  const need = PermissionsBitField.resolve(permissions.flat());
  return (ctx, next) => {
    if (!ctx.guildId) throw new UserError(text(ctx, 'guildOnly'));
    const have = ctx.memberPermissions;
    const missing = need & ~(have?.bitfield ?? 0n);
    if (missing && !have?.has('Administrator')) throw new UserError(text(ctx, 'userPermissions', names(missing)));
    return next();
  };
};

export const requireBotPermissions = (...permissions) => {
  const need = PermissionsBitField.resolve(permissions.flat());
  return (ctx, next) => {
    if (!ctx.guildId) return next();
    const have = ctx.appPermissions;
    const missing = need & ~(have?.bitfield ?? 0n);
    if (missing && !have?.has('Administrator')) throw new UserError(text(ctx, 'botPermissions', names(missing)));
    return next();
  };
};

export const requireEntitlement = (...skus) => {
  const wanted = new Set(skus.flat());
  return (ctx, next) => {
    const owned = ctx.entitlements;
    if (owned?.some((e) => wanted.has(e.skuId) && (e.isActive?.() ?? true))) return next();
    throw new UserError({
      content: text(ctx, 'premium'),
      components: [{ type: 1, components: [...wanted].slice(0, 5).map((sku) => ({ type: 2, style: 6, sku_id: sku }))}],
    });
  };
};

const scopeKey = (ctx, per) => per === 'guild' ? ctx.guildId ?? ctx.user.id
  : per === 'channel' ? ctx.channelId ?? ctx.user.id
    : per === 'global' ? '*' : ctx.user.id;

export const limitConcurrency = (limit, o = {}) => {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new ShiverError('INVALID_GUARD', 'limitConcurrency() needs a positive integer limit.');
  const active = new Map();
  return async (ctx, next) => {
    const key = scopeKey(ctx, o.per ?? 'global');
    const count = active.get(key) ?? 0;
    if (count >= limit) throw new UserError(text(ctx, 'busy'));
    active.set(key, count + 1);
    try {
      await next();
    } finally {
      const remaining = active.get(key) - 1;
      if (remaining) active.set(key, remaining);
      else active.delete(key);
    }
  };
};

export const cooldown = (duration, o = {}) => {
  const window = ms(duration);
  const uses = o.uses ?? 1;
  if (!Number.isSafeInteger(uses) || uses < 1) throw new ShiverError('INVALID_GUARD', 'cooldown() needs a positive integer uses value.');
  const exempt = new Set(o.exemptUsers ?? []);
  const hits = new Map();
  return (ctx, next) => {
    if (exempt.has(ctx.user.id) || (ctx.bot.owners.has(ctx.user.id) && ctx.bot.options.ownersBypassCooldown)) return next();
    const now = Date.now();
    const scope = scopeKey(ctx, o.per);
    const recent = (hits.get(scope) ?? []).filter((at) => now - at < window);
    if (recent.length >= uses) {
      throw new UserError(text(ctx, 'cooldown', Math.ceil((recent[0] + window) / 1000)));
    }
    recent.push(now);
    hits.set(scope, recent);
    if (hits.size > 5000) for (const [key, list] of hits) if (now - list.at(-1) >= window) hits.delete(key);
    return next();
  };
};

const cache = new WeakMap();

export function guardsFor(node) {
  let stack = cache.get(node);
  if (stack) return stack;
  stack = [];
  if (node.guildOnly) stack.push(guildOnly());
  if (node.dmOnly) stack.push(dmOnly());
  if (node.channelTypes?.length) stack.push(channelOnly(...node.channelTypes));
  if (node.roles?.length) stack.push(requireRoles(...node.roles));
  if (node.ownerOnly) stack.push(ownerOnly());
  if (node.nsfw) stack.push(nsfwOnly());
  if (node.permissions) stack.push(requirePermissions(node.permissions));
  if (node.botPermissions) stack.push(requireBotPermissions(node.botPermissions));
  if (node.entitlement) stack.push(requireEntitlement(node.entitlement));
  if (node.cooldown !== undefined) {
    stack.push(typeof node.cooldown === 'object' ? cooldown(node.cooldown.duration, node.cooldown) : cooldown(node.cooldown));
  }
  if (node.use) stack.push(...[node.use].flat());
  cache.set(node, stack);
  return stack;
}
