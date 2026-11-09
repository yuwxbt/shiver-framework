import { ShiverError } from '../errors.js';
import { clean, isPlainObject, resolveColor } from '../util.js';
import { normalizeFileTypes } from './files.js';


export const ComponentType = Object.freeze({
  ActionRow: 1, Button: 2, StringSelect: 3, TextInput: 4, UserSelect: 5, RoleSelect: 6,
  MentionableSelect: 7, ChannelSelect: 8, Section: 9, TextDisplay: 10, Thumbnail: 11,
  MediaGallery: 12, File: 13, Separator: 14, Container: 17, Label: 18, FileUpload: 19,
  RadioGroup: 21, CheckboxGroup: 22, Checkbox: 23,
});

const BUTTON_STYLES = { primary: 1, secondary: 2, success: 3, danger: 4, link: 5, premium: 6 };
const T = ComponentType;

const fail = (message) => { throw new ShiverError('INVALID_COMPONENT', message); };

export function withComponentId(component, id) {
  if (!Number.isInteger(id) || id < 0 || id > 0xffffffff) fail('Component id must be a nonnegative 32-bit integer.');
  return { ...component, id };
}

function parts(args) {
  const first = args[0];
  const hasOptions = isPlainObject(first) && typeof first.type !== 'number';
  return [hasOptions ? first : {}, children(hasOptions ? args.slice(1) : args)];
}

export function children(list) {
  const out = [];
  for (const item of list.flat(Infinity)) {
    if (item == null || item === false || item === '') continue;
    out.push(typeof item === 'string' ? text(item) : item);
  }
  return out;
}

export function autoRows(list) {
  const out = [];
  let buttons = null;
  for (const item of list) {
    if (item.type === T.Button) {
      if (!buttons || buttons.components.length === 5) out.push((buttons = { type: T.ActionRow, components: [] }));
      buttons.components.push(item);
      continue;
    }
    buttons = null;
    out.push(isSelect(item) ? { type: T.ActionRow, components: [item] } : item);
  }
  return out;
}

const isSelect = (c) => c.type === T.StringSelect || (c.type >= T.UserSelect && c.type <= T.ChannelSelect);

export function emoji(value) {
  if (value == null) return undefined;
  if (typeof value !== 'string') return value;
  const custom = /^<(a?):(\w+):(\d+)>$/.exec(value);
  if (custom) return clean({ id: custom[3], name: custom[2], animated: custom[1] ? true : undefined });
  return /^\d{17,20}$/.test(value) ? { id: value } : { name: value };
}

const media = (value) => (typeof value === 'string' ? { url: value } : value);

function requireId(kind, o) {
  if (typeof o?.id !== 'string' || !o.id) fail(`${kind}() needs an "id" (the custom id your handler matches), e.g. ${kind}({ id: "my:${kind}" }).`);
}

function labelled(o, component) {
  if (o.label === undefined) return component;
  return clean({ type: T.Label, label: o.label, description: o.description, component });
}

export function text(content) {
  return { type: T.TextDisplay, content: String(content) };
}

export function container(...args) {
  const [o, kids] = parts(args);
  return clean({
    type: T.Container,
    accent_color: resolveColor(o.accent ?? o.color),
    spoiler: o.spoiler,
    components: autoRows(kids),
    ...o.raw,
  });
}

export function section(...args) {
  const [o, kids] = parts(args);
  if (!o.accessory) fail('section() needs an accessory: section({ accessory: thumbnail(url) }, "text") or section({ accessory: button({...}) }, "text"). For text without an accessory use text().');
  return { type: T.Section, components: kids, accessory: typeof o.accessory === 'string' ? thumbnail(o.accessory) : o.accessory, ...o.raw };
}

export function thumbnail(url, o = {}) {
  return clean({ type: T.Thumbnail, media: media(url), description: o.description ?? o.alt, spoiler: o.spoiler });
}

export function gallery(...items) {
  return {
    type: T.MediaGallery,
    items: items.flat(Infinity).filter(Boolean).map((item) => (typeof item === 'string'
      ? { media: { url: item } }
      : clean({ media: media(item.media ?? item.url), description: item.description ?? item.alt, spoiler: item.spoiler }))),
  };
}

export function file(url, o = {}) {
  const ref = typeof url === 'string' && !url.includes('://') ? `attachment://${url}` : url;
  return clean({ type: T.File, file: media(ref), spoiler: o.spoiler });
}

export function separator(o = {}) {
  return clean({ type: T.Separator, divider: o.divider, spacing: o.spacing === 'large' ? 2 : o.spacing === 'small' ? 1 : o.spacing });
}

export function row(...items) {
  return { type: T.ActionRow, components: children(items) };
}

export function button(o = {}) {
  if (o.sku) return clean({ type: T.Button, style: 6, sku_id: o.sku, disabled: o.disabled });
  if (o.url) return clean({ type: T.Button, style: 5, url: o.url, label: o.label, emoji: emoji(o.emoji), disabled: o.disabled });
  requireId('button', o);
  if (!o.label && !o.emoji) fail(`button({ id: "${o.id}" }) needs a "label" or an "emoji".`);
  const style = typeof o.style === 'number' ? o.style : BUTTON_STYLES[o.style ?? 'secondary'];
  if (!Number.isInteger(style) || style < 1 || style > 4) fail(`Unknown button style ${JSON.stringify(o.style)}. Use "primary", "secondary", "success" or "danger".`);
  return clean({ type: T.Button, style, custom_id: o.id, label: o.label, emoji: emoji(o.emoji), disabled: o.disabled });
}

function selectBase(type, o) {
  return {
    type,
    custom_id: o.id,
    placeholder: o.placeholder,
    min_values: o.min,
    max_values: o.max,
    disabled: o.disabled,
    required: o.required,
  };
}

export function select(o = {}) {
  requireId('select', o);
  if (!Array.isArray(o.options) || !o.options.length) fail(`select({ id: "${o.id}" }) needs a non-empty "options" array.`);
  const options = o.options.map((opt) => (typeof opt === 'string'
    ? { label: opt, value: opt }
    : clean({ label: opt.label, value: String(opt.value ?? opt.label), description: opt.description, emoji: emoji(opt.emoji), default: opt.default })));
  return labelled(o, clean({ ...selectBase(T.StringSelect, o), options }));
}

function autoSelect(kind, type, defaultType) {
  return (o = {}) => {
    requireId(kind, o);
    const defaults = o.defaults?.map((d) => (typeof d === 'string' ? { id: d, type: defaultType } : d));
    if (defaults?.some((d) => !d.type)) fail(`${kind}() defaults must be objects like { id, type: "user" | "role" } because the select accepts more than one kind.`);
    return labelled(o, clean({ ...selectBase(type, o), default_values: defaults, channel_types: o.channelTypes }));
  };
}

export const userSelect = autoSelect('userSelect', T.UserSelect, 'user');
export const roleSelect = autoSelect('roleSelect', T.RoleSelect, 'role');
export const mentionableSelect = autoSelect('mentionableSelect', T.MentionableSelect, undefined);
export const channelSelect = autoSelect('channelSelect', T.ChannelSelect, 'channel');

export function label(o, component) {
  if (!component) fail('label() needs a component: label({ label: "Name" }, textInput({ id: "name" })).');
  return clean({ type: T.Label, label: o.label, description: o.description, component: component.type === T.Label ? component.component : component });
}

export function textInput(o = {}) {
  requireId('textInput', o);
  return labelled(o, clean({
    type: T.TextInput,
    custom_id: o.id,
    style: o.style === 'paragraph' || o.style === 2 ? 2 : 1,
    min_length: o.min,
    max_length: o.max,
    required: o.required,
    value: o.value,
    placeholder: o.placeholder,
  }));
}

export function fileUpload(o = {}) {
  requireId('fileUpload', o);
  const types = normalizeFileTypes(o.types, 'INVALID_COMPONENT', `fileUpload("${o.id}")`);
  return labelled(o, clean({ type: T.FileUpload, custom_id: o.id, min_values: o.min, max_values: o.max, required: o.required, file_types: types }));
}

const choice = (opt) => (typeof opt === 'string'
  ? { label: opt, value: opt }
  : clean({ label: opt.label, value: String(opt.value ?? opt.label), description: opt.description, default: opt.default }));

export function radioGroup(o = {}) {
  requireId('radioGroup', o);
  return labelled(o, clean({ type: T.RadioGroup, custom_id: o.id, options: (o.options ?? []).map(choice), required: o.required }));
}

export function checkboxGroup(o = {}) {
  requireId('checkboxGroup', o);
  return labelled(o, clean({ type: T.CheckboxGroup, custom_id: o.id, options: (o.options ?? []).map(choice), min_values: o.min, max_values: o.max, required: o.required }));
}

export function checkbox(o = {}) {
  requireId('checkbox', o);
  return labelled(o, clean({ type: T.Checkbox, custom_id: o.id, default: o.default }));
}

export function modal(...args) {
  const [o, kids] = parts(args);
  if (typeof o.id !== 'string' || !o.id) fail('modal() needs an "id": modal({ id: "feedback", title: "Feedback" }, ...inputs).');
  if (!o.title) fail(`modal({ id: "${o.id}" }) needs a "title".`);
  for (const kid of kids) {
    if (kid.type !== T.Label && kid.type !== T.TextDisplay && kid.type !== T.ActionRow) {
      fail(`Modal "${o.id}": inputs need a label. Pass one to the input, e.g. textInput({ id: "${kid.custom_id ?? 'name'}", label: "Your label" }).`);
    }
  }
  return { custom_id: o.id, title: o.title, components: kids };
}
