import { ShiverError } from '../errors.js';
import { clean, isPlainObject, ms, resolveColor } from '../util.js';
import { autoRows, children, ComponentType as T, emoji } from './components.js';
import { validateMessage } from './validate.js';

const FLAG = { SuppressEmbeds: 4, Ephemeral: 64, SuppressNotifications: 4096, IsComponentsV2: 32768 };
const V2_TYPES = new Set([T.Section, T.TextDisplay, T.Thumbnail, T.MediaGallery, T.File, T.Separator, T.Container]);
const PREVIEW_TYPES = new Set([T.ActionRow, T.Button, T.Section, T.TextDisplay, T.Thumbnail, T.MediaGallery, T.Separator, T.Container]);
const LINK_BUTTON_KEYS = new Set(['id', 'type', 'url', 'style', 'label', 'emoji', 'disabled']);

export function usesComponentsV2(components) {
  return children([components]).some((c) => V2_TYPES.has(c.type));
}

export function componentEmbed(component) {
  const invalid = (message) => { throw new ShiverError('INVALID_MESSAGE', `componentEmbed(): ${message}`); };
  if (component?.type !== T.Container || !component.components?.length) invalid('provide one non-empty container().');
  let mediaItems = 0;
  const checkURL = (url) => {
    if (typeof url !== 'string' || url.length > 2048 || !URL.canParse(url) || !['http:', 'https:'].includes(new URL(url).protocol)) {
      invalid('use an absolute HTTP(S) URL of at most 2048 characters for preview links and media.');
    }
  };
  const visit = (child) => {
    if (!PREVIEW_TYPES.has(child?.type)) invalid(`component type ${child?.type} cannot appear in a link preview.`);
    if (child.type === T.Button) {
      if (child.style !== 5 || (!child.label && !child.emoji) || Object.keys(child).some((key) => !LINK_BUTTON_KEYS.has(key))) {
        invalid('preview buttons must be URL buttons with a label or emoji.');
      }
      checkURL(child.url);
    }
    if (child.type === T.Thumbnail) checkURL(child.media?.url);
    if (child.type === T.MediaGallery) {
      for (const item of child.items ?? []) checkURL(item.media?.url);
      mediaItems += child.items?.length ?? 0;
    }
    child.components?.forEach(visit);
    if (child.accessory) visit(child.accessory);
  };
  validateMessage({ components: [component], v2: true });
  visit(component);
  if (mediaItems > 10) invalid('a preview holds at most 10 gallery items in total.');
  const json = JSON.stringify({ component }).replaceAll('<', '\\u003c');
  if (Buffer.byteLength(json, 'utf8') > 3000) invalid('the preview exceeds the 3000-byte limit.');
  return json;
}

const named = (value, key) => (typeof value === 'string' ? { [key]: value } : value);

export function embed(o = {}) {
  if (typeof o.toJSON === 'function') return o.toJSON();
  const author = named(o.author, 'name');
  const footer = named(o.footer, 'text');
  return clean({
    title: o.title,
    description: o.description,
    url: o.url,
    color: resolveColor(o.color),
    timestamp: o.timestamp === true ? new Date().toISOString() : o.timestamp instanceof Date ? o.timestamp.toISOString() : o.timestamp,
    author: author && clean({ name: author.name, url: author.url, icon_url: author.icon_url ?? author.iconURL ?? author.icon }),
    footer: footer && clean({ text: footer.text, icon_url: footer.icon_url ?? footer.iconURL ?? footer.icon }),
    image: named(o.image, 'url'),
    thumbnail: named(o.thumbnail, 'url'),
    fields: o.fields?.filter(Boolean).map((f) => clean({ name: String(f.name), value: String(f.value), inline: f.inline })),
  });
}

export function poll(o) {
  return {
    question: named(o.question, 'text'),
    answers: o.answers.map((a) => (typeof a === 'string' ? { text: a } : clean({ text: a.text, emoji: emoji(a.emoji) }))),
    duration: o.duration === undefined ? undefined : Math.max(1, Math.round(ms(typeof o.duration === 'number' ? o.duration * 36e5 : o.duration) / 36e5)),
    allowMultiselect: o.multi ?? o.allowMultiselect ?? false,
  };
}

const json = (data) => ({ toJSON: () => data });

export function resolveMessage(input, defaults = {}) {
  if (typeof input === 'string') input = { content: input };
  else if (Array.isArray(input) || typeof input?.type === 'number') input = { components: input };
  if (!isPlainObject(input)) {
    throw new ShiverError('INVALID_MESSAGE', `A message must be a string or an object like { content, embeds, components }, got ${input === null ? 'null' : typeof input}.`);
  }

  const { content, embed: one, embeds, components, ephemeral, silent, suppressEmbeds, flags: extraFlags, poll: pollInput, ...rest } = input;
  const mode = defaults.mode ?? 'reply';
  const out = { ...rest };

  const list = components === undefined ? undefined : autoRows(children([components]));
  const v2 = usesComponentsV2(list) || (typeof extraFlags === 'number' && Boolean(extraFlags & FLAG.IsComponentsV2));

  let flags = typeof extraFlags === 'number' ? extraFlags : 0;
  if (v2) flags |= FLAG.IsComponentsV2;
  if (mode === 'reply' && (ephemeral ?? defaults.ephemeral)) flags |= FLAG.Ephemeral;
  if (silent && mode !== 'edit') flags |= FLAG.SuppressNotifications;
  if (suppressEmbeds) flags |= FLAG.SuppressEmbeds;

  const allEmbeds = [one, ...(embeds ?? [])].filter(Boolean).map(embed);
  if (v2 && (content || allEmbeds.length || pollInput)) {
    throw new ShiverError('INVALID_MESSAGE', 'This message uses Components V2 (container, section, text, gallery, file or separator), so it cannot also have "content", "embeds" or "poll". Put the text inside the components with text("...").');
  }

  if (content !== undefined) out.content = content === null ? null : String(content);
  if (allEmbeds.length || embeds !== undefined) out.embeds = allEmbeds.map(json);
  if (list) out.components = list.map(json);
  if (pollInput) out.poll = poll(pollInput);
  if (flags) out.flags = flags;
  if (out.allowedMentions === undefined && defaults.allowedMentions) out.allowedMentions = defaults.allowedMentions;

  if (defaults.validate !== false) validateMessage({ content: out.content, embeds: allEmbeds, components: list, v2 });
  return out;
}

export function toPlain(payload) {
  const out = { ...payload };
  for (const key of ['components', 'embeds']) {
    if (out[key]) out[key] = out[key].map((item) => (typeof item?.toJSON === 'function' ? item.toJSON() : item));
  }
  return out;
}
