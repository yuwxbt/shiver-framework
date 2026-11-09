import { ShiverError, UserError } from './errors.js';
import { matchesFileTypes, normalizeFileTypes } from './ui/files.js';
import { clean } from './util.js';

const API_TYPE = { string: 3, integer: 4, boolean: 5, user: 6, member: 6, channel: 7, role: 8, mentionable: 9, number: 10, attachment: 11 };
const NAME = /^[-_'\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u;

const make = (kind) => {
  return (description, config) => {
    if (typeof description === 'object' && description !== null) ({ description, ...config } = description);
    return { ...config, kind, description };
  };
};

export const opt = Object.freeze({
  string: make('string'),
  integer: make('integer'),
  number: make('number'),
  boolean: make('boolean'),
  user: make('user'),
  member: make('member'),
  channel: make('channel'),
  role: make('role'),
  mentionable: make('mentionable'),
  attachment: make('attachment'),
});

export function checkName(name, where) {
  if (typeof name !== 'string' || !NAME.test(name) || name !== name.toLowerCase()) {
    throw new ShiverError('INVALID_COMMAND', `${where}: name ${JSON.stringify(name)} is invalid. Names are 1-32 characters, lowercase, with no spaces (letters, numbers, "-" and "_").`);
  }
}

export function checkDescription(description, where) {
  if (typeof description !== 'string' || !description.length || description.length > 100) {
    throw new ShiverError('INVALID_COMMAND', `${where}: description must be 1-100 characters, got ${typeof description === 'string' ? description.length : typeof description}.`);
  }
}

const toChoice = (c) => (c && typeof c === 'object' ? clean({ name: c.name, value: c.value, name_localizations: c.nameLocalizations }) : { name: String(c), value: c });

function validNumber(kind, value) {
  return typeof value === 'number' && (kind === 'integer' ? Number.isSafeInteger(value) : Math.abs(value) <= 2 ** 53);
}

function validateOption(o, where) {
  const invalid = (message) => { throw new ShiverError('INVALID_COMMAND', `${where}: ${message}`); };
  const text = o.kind === 'string';
  const numeric = o.kind === 'integer' || o.kind === 'number';
  if (o.min !== undefined || o.max !== undefined) {
    if (!text && !numeric) invalid('only string, integer and number options support min/max.');
    for (const [name, bound] of [['min', o.min], ['max', o.max]]) {
      if (bound === undefined) continue;
      if (text ? !Number.isInteger(bound) || bound < (name === 'min' ? 0 : 1) || bound > 6000 : !validNumber(o.kind, bound)) {
        invalid(`invalid ${name} bound for a ${o.kind} option.`);
      }
    }
    if (o.min > o.max) invalid('min must be less than or equal to max.');
  }
  if (o.channelTypes !== undefined && (o.kind !== 'channel' || !Array.isArray(o.channelTypes) || o.channelTypes.some((type) => !Number.isInteger(type) || type < 0))) {
    invalid('channelTypes requires a channel option and an array of Discord channel type numbers.');
  }
  if (o.types !== undefined && o.kind !== 'attachment') invalid('types is only available on attachment options.');
  if (o.autocomplete !== undefined) {
    if ((!text && !numeric) || typeof o.autocomplete !== 'function') invalid('autocomplete requires a function on a string, integer or number option.');
    if (o.choices !== undefined) invalid('use either choices or autocomplete, not both.');
  }
  if (o.autocompleteUse !== undefined && (!o.autocomplete || ![o.autocompleteUse].flat().every((middleware) => typeof middleware === 'function'))) {
    invalid('autocompleteUse requires autocomplete and middleware functions.');
  }
  if (o.choices === undefined) return undefined;
  if (!text && !numeric) invalid('only string, integer and number options support choices.');
  if (!Array.isArray(o.choices) || o.choices.length < 1 || o.choices.length > 25) invalid('choices must contain 1–25 items. Use autocomplete for longer lists.');
  return o.choices.map((choice, i) => {
    const item = toChoice(choice);
    if (typeof item.name !== 'string' || item.name.length < 1 || item.name.length > 100) invalid(`choice ${i + 1} needs a name of 1–100 characters.`);
    if (text ? typeof item.value !== 'string' || item.value.length > 100 : !validNumber(o.kind, item.value)) {
      invalid(`choice ${i + 1} has an invalid ${o.kind} value.`);
    }
    return item;
  });
}

export function buildOptions(map = {}, where = 'command') {
  const entries = Object.entries(map);
  if (entries.length > 25) throw new ShiverError('INVALID_COMMAND', `${where}: a command holds at most 25 options, got ${entries.length}.`);
  const out = entries.map(([name, o]) => {
    const at = `${where} option "${name}"`;
    if (!o || !Object.hasOwn(API_TYPE, o.kind)) throw new ShiverError('INVALID_COMMAND', `${at}: use an option builder, e.g. { ${name}: opt.string("Description") }.`);
    checkName(name, at);
    checkDescription(o.description, at);
    const choices = validateOption(o, at);
    const text = o.kind === 'string';
    return clean({
      type: API_TYPE[o.kind],
      name,
      description: o.description,
      required: o.required || undefined,
      choices,
      autocomplete: o.autocomplete ? true : undefined,
      min_value: text ? undefined : o.min,
      max_value: text ? undefined : o.max,
      min_length: text ? o.min : undefined,
      max_length: text ? o.max : undefined,
      channel_types: o.channelTypes,
      file_types: normalizeFileTypes(o.types, 'INVALID_COMMAND', at),
      name_localizations: o.nameLocalizations,
      description_localizations: o.descriptionLocalizations,
    });
  });
  return out.sort((a, b) => (b.required ? 1 : 0) - (a.required ? 1 : 0));
}

export function readInteractionOptions(interaction, map = {}) {
  const entries = Object.entries(map);
  const values = Object.fromEntries(entries.map(([name]) => [name, null]));
  for (const [name, o] of entries) {
    const data = interaction.options.get(name);
    if (!data) { values[name] = o.default ?? null; continue; }
    switch (o.kind) {
      case 'user': values[name] = data.user ?? null; break;
      case 'member': values[name] = data.member ?? null; break;
      case 'channel': values[name] = data.channel ?? null; break;
      case 'role': values[name] = data.role ?? null; break;
      case 'mentionable': values[name] = data.member ?? data.user ?? data.role ?? null; break;
      case 'attachment': values[name] = data.attachment ?? null; break;
      default: values[name] = data.value;
    }
  }
  return values;
}

export function tokenize(text) {
  const out = [];
  for (const m of text.matchAll(/"((?:\\["\\]|[^"\\]|\\(?!["\\]))*)"|(\S+)/g)) {
    out.push({ value: m[1]?.replace(/\\(["\\])/g, '$1') ?? m[2], index: m.index });
  }
  return out;
}

const snowflake = (token) => /^(?:<[@#]?[!&]?)?(\d{17,20})>?$/.exec(token)?.[1];
const BOOL = { true: true, yes: true, y: true, on: true, 1: true, false: false, no: false, n: false, off: false, 0: false };

export function usage(map = {}) {
  return Object.entries(map).map(([name, o]) => (o.required ? `<${name}>` : `[${name}]`)).join(' ');
}

export async function parsePrefixOptions(message, text, map = {}, split) {
  const args = split ? await split(text, message) : null;
  if (split && (!Array.isArray(args) || args.some((value) => typeof value !== 'string'))) {
    throw new ShiverError('INVALID_COMMAND', 'splitPrefix() must return an array of strings.');
  }
  const tokens = split ? args.map((value) => ({ value, index: 0 })) : tokenize(text);
  const entries = Object.entries(map);
  const values = Object.fromEntries(entries.map(([name]) => [name, null]));
  const attachments = [...message.attachments.values()];
  let at = 0;

  for (const [i, [name, o]] of entries.entries()) {
    const invalid = (why) => new UserError(`\`${name}\`: ${why}`);
    if (o.kind === 'attachment') {
      values[name] = attachments.shift() ?? null;
      if (!values[name] && o.required) throw invalid('attach a file.');
      if (values[name] && !matchesFileTypes(values[name], o.types?.map((type) => type.toLowerCase()))) {
        throw invalid(`attach a file of type ${o.types.join(', ')}.`);
      }
      continue;
    }
    const token = tokens[at];
    if (!token) {
      if (o.required) throw invalid('this is required.');
      values[name] = o.default ?? null;
      continue;
    }
    const isLastString = o.kind === 'string' && !entries.slice(i + 1).some(([, later]) => later.kind !== 'attachment');
    const raw = isLastString && tokens.length > at + 1
      ? (split ? args.slice(at).join(' ') : text.slice(token.index).trim())
      : token.value;
    at++;

    switch (o.kind) {
      case 'string': {
        let value = raw;
        if (o.choices) {
          const hit = o.choices.map(toChoice).find((c) => [c.name, String(c.value)].some((s) => s.toLowerCase() === raw.toLowerCase()));
          if (!hit) throw invalid(`choose one of: ${o.choices.map((c) => toChoice(c).name).join(', ')}.`);
          value = hit.value;
        }
        if (o.min !== undefined && value.length < o.min) throw invalid(`must be at least ${o.min} characters.`);
        if (o.max !== undefined && value.length > o.max) throw invalid(`must be at most ${o.max} characters.`);
        values[name] = value;
        break;
      }
      case 'integer':
      case 'number': {
        const value = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(raw) ? Number(raw) : NaN;
        if (!Number.isFinite(value) || (o.kind === 'integer' && !Number.isInteger(value))) throw invalid(o.kind === 'integer' ? 'must be a whole number.' : 'must be a number.');
        if (!validNumber(o.kind, value)) throw invalid('number is outside the supported range.');
        if (o.choices && !o.choices.some((choice) => toChoice(choice).value === value)) throw invalid(`choose one of: ${o.choices.map((choice) => toChoice(choice).value).join(', ')}.`);
        if (o.min !== undefined && value < o.min) throw invalid(`must be at least ${o.min}.`);
        if (o.max !== undefined && value > o.max) throw invalid(`must be at most ${o.max}.`);
        values[name] = value;
        break;
      }
      case 'boolean': {
        const key = raw.toLowerCase();
        if (!Object.hasOwn(BOOL, key)) throw invalid('must be yes or no.');
        values[name] = BOOL[key];
        break;
      }
      default: {
        const id = snowflake(raw);
        if (!id) throw invalid(`mention it or paste its ID.`);
        const guild = message.guild;
        const found = o.kind === 'user' ? await message.client.users.fetch(id).catch(() => null)
          : o.kind === 'member' ? await guild?.members.fetch(id).catch(() => null)
          : o.kind === 'channel' ? guild?.channels.cache.get(id) ?? message.client.channels.cache.get(id)
          : o.kind === 'role' ? guild?.roles.cache.get(id)
          : guild?.roles.cache.get(id) ?? await guild?.members.fetch(id).catch(() => null) ?? await message.client.users.fetch(id).catch(() => null);
        if (!found) throw invalid(`could not find that ${o.kind}.`);
        values[name] = found;
      }
    }
  }
  return values;
}
