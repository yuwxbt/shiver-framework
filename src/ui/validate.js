import { ShiverError } from '../errors.js';


const bad = (path, message) => { throw new ShiverError('INVALID_MESSAGE', `${path}: ${message}`); };
const len = (value) => (typeof value === 'string' ? value.length : 0);

function checkId(ids, id, path) {
  if (typeof id !== 'string' || !id.length || id.length > 100) bad(path, `custom id must be 1-100 characters, got ${len(id)}. Keep state short (ids, not names) or store it and pass a key.`);
  if (ids.has(id)) bad(path, `custom id "${id}" is used twice in one message. Each component needs a unique id.`);
  ids.add(id);
}

function checkNumericId(ids, id, path) {
  if (id === undefined || id === 0) return;
  if (!Number.isInteger(id) || id < 0 || id > 0xffffffff) bad(path, 'component id must be a nonnegative 32-bit integer.');
  if (ids.has(id)) bad(path, `component id ${id} is used twice.`);
  ids.add(id);
}

function checkOptions(c, path, min, max) {
  const n = c.options?.length ?? 0;
  if (n < min || n > max) bad(path, `needs ${min}-${max} options, got ${n}.`);
  for (const [i, o] of c.options.entries()) {
    if (!len(o.label) || len(o.label) > 100) bad(`${path}.options[${i}]`, 'label must be 1-100 characters.');
    if (len(o.value) > 100) bad(`${path}.options[${i}]`, 'value must be at most 100 characters.');
    if (len(o.description) > 100) bad(`${path}.options[${i}]`, 'description must be at most 100 characters.');
  }
}

const isSelect = (type) => type === 3 || (type >= 5 && type <= 8);

function walk(c, path, state, parent) {
  checkNumericId(state.numericIds, c.id, path);
  state.count++;
  switch (c.type) {
    case 1: {
      const kids = c.components ?? [];
      if (!kids.length) bad(path, 'a row needs at least one component.');
      if (parent !== 0 && parent !== 17) bad(path, 'rows can appear at the top level or inside a container.');
      if (kids.some((k) => k.type !== 2 && !isSelect(k.type))) bad(path, 'a row can only contain buttons or a select.');
      const selects = kids.filter((k) => isSelect(k.type)).length;
      if (selects && kids.length > 1) bad(path, 'a row holds either up to 5 buttons or exactly 1 select, not both. Put the select in its own row().');
      if (kids.length > 5) bad(path, `a row holds at most 5 buttons, got ${kids.length}. Split them across rows.`);
      kids.forEach((k, i) => walk(k, `${path}.components[${i}]`, state, 1));
      break;
    }
    case 2:
      if (parent !== 1 && parent !== 9) bad(path, 'a button must be inside row() or be a section accessory.');
      if (len(c.label) > 80) bad(path, `button label is ${len(c.label)} characters, max is 80.`);
      if (c.style === 5) { if (len(c.url) > 512) bad(path, 'button url must be at most 512 characters.'); } else if (c.style !== 6) checkId(state.ids, c.custom_id, path);
      break;
    case 3:
      if (parent !== 1) bad(path, 'a select must be inside a row.');
      checkId(state.ids, c.custom_id, path);
      checkOptions(c, path, 1, 25);
      break;
    case 5: case 6: case 7: case 8:
      if (parent !== 1) bad(path, 'a select must be inside a row.');
      checkId(state.ids, c.custom_id, path);
      break;
    case 9: {
      const kids = c.components ?? [];
      if (kids.length < 1 || kids.length > 3) bad(path, `a section holds 1-3 texts, got ${kids.length}.`);
      if (kids.some((child) => child.type !== 10)) bad(path, 'a section only accepts text() children.');
      if (![2, 11].includes(c.accessory?.type)) bad(path, 'a section needs an accessory (thumbnail or button).');
      kids.forEach((k, i) => walk(k, `${path}.components[${i}]`, state, 9));
      walk(c.accessory, `${path}.accessory`, state, 9);
      break;
    }
    case 10:
      if (!len(c.content)) bad(path, 'text must not be empty.');
      state.text += c.content.length;
      break;
    case 11:
      if (parent !== 9) bad(path, 'a thumbnail must be the accessory of a section.');
      break;
    case 12:
      if (!c.items?.length || c.items.length > 10) bad(path, `a gallery holds 1-10 items, got ${c.items?.length ?? 0}.`);
      break;
    case 13:
      if (!c.file?.url?.startsWith('attachment://')) bad(path, 'file() only shows uploaded attachments: file("attachment://name.ext") with the file in "files".');
      break;
    case 17:
      if (parent) bad(path, 'a container cannot be nested inside another component.');
      (c.components ?? []).forEach((k, i) => walk(k, `${path}.components[${i}]`, state, 17));
      break;
    case 4: case 18: case 19: case 21: case 22: case 23:
      bad(path, 'modal components cannot appear in a message.');
    default:
  }
}

function checkEmbeds(embeds) {
  if (embeds.length > 10) bad('embeds', `a message holds at most 10 embeds, got ${embeds.length}.`);
  let total = 0;
  for (const [i, e] of embeds.entries()) {
    const path = `embeds[${i}]`;
    if (len(e.title) > 256) bad(path, `title is ${len(e.title)} characters, max is 256.`);
    if (len(e.description) > 4096) bad(path, `description is ${len(e.description)} characters, max is 4096.`);
    if (len(e.footer?.text) > 2048) bad(path, 'footer text must be at most 2048 characters.');
    if (len(e.author?.name) > 256) bad(path, 'author name must be at most 256 characters.');
    if ((e.fields?.length ?? 0) > 25) bad(path, `an embed holds at most 25 fields, got ${e.fields.length}.`);
    total += len(e.title) + len(e.description) + len(e.footer?.text) + len(e.author?.name);
    for (const [j, f] of (e.fields ?? []).entries()) {
      if (!len(f.name) || len(f.name) > 256) bad(`${path}.fields[${j}]`, 'field name must be 1-256 characters.');
      if (!len(f.value) || len(f.value) > 1024) bad(`${path}.fields[${j}]`, 'field value must be 1-1024 characters.');
      total += f.name.length + f.value.length;
    }
  }
  if (total > 6000) bad('embeds', `embeds hold ${total} characters in total, max is 6000 across all embeds of one message.`);
}

export function validateMessage({ content, embeds = [], components, v2 = false }) {
  if (len(content) > 2000) bad('content', `content is ${len(content)} characters, max is 2000. Split it, attach a file, or use an embed description (4096).`);
  if (embeds.length) checkEmbeds(embeds);
  if (!components?.length) return;

  const state = { count: 0, text: 0, ids: new Set(), numericIds: new Set() };
  components.forEach((c, i) => {
    const path = `components[${i}]`;
    if (!v2 && c.type !== 1) bad(path, 'without Components V2, top-level components must be rows of buttons or selects.');
    if (c.type === 2 || c.type === 11) bad(path, 'this component cannot be top-level; put buttons in row() and thumbnails in section().');
    walk(c, path, state, 0);
  });
  if (!v2 && components.length > 5) bad('components', `a message holds at most 5 rows, got ${components.length}. Use Components V2 (container/text) for up to 40 components.`);
  if (v2 && state.count > 40) bad('components', `a Components V2 message holds at most 40 components (nested ones count), got ${state.count}.`);
  if (v2 && state.text > 4000) bad('components', `text across all text() components is ${state.text} characters, max is 4000.`);
}

export function validateModal(modal) {
  const path = `modal "${modal.custom_id}"`;
  if (!len(modal.custom_id) || len(modal.custom_id) > 100) bad(path, 'custom id must be 1–100 characters.');
  if (!len(modal.title) || len(modal.title) > 45) bad(path, `title must be 1-45 characters, got ${len(modal.title)}.`);
  const kids = modal.components ?? [];
  if (kids.length < 1 || kids.length > 5) bad(path, `a modal holds 1-5 components, got ${kids.length}.`);
  const ids = new Set();
  const numericIds = new Set();
  for (const [i, kid] of kids.entries()) {
    const at = `${path}.components[${i}]`;
    checkNumericId(numericIds, kid.id, at);
    if (kid.type === 10) {
      if (!len(kid.content) || len(kid.content) > 4000) bad(at, 'text must be 1–4000 characters.');
      continue;
    }
    let c;
    if (kid.type === 18) {
      if (!len(kid.label) || len(kid.label) > 45) bad(at, `label must be 1-45 characters, got ${len(kid.label)}.`);
      if (len(kid.description) > 100) bad(at, 'description must be at most 100 characters.');
      c = kid.component;
    } else if (kid.type === 1 && kid.components?.length === 1 && kid.components[0]?.type === 4) {
      c = kid.components[0];
    } else {
      bad(at, 'a modal needs text, labels, or a legacy row with one text input.');
    }
    if (!c || (!isSelect(c.type) && ![4, 19, 21, 22, 23].includes(c.type))) bad(at, 'a label must wrap one supported modal input.');
    checkNumericId(numericIds, c.id, at);
    checkId(ids, c.custom_id, at);
    if (c.type === 3) checkOptions(c, at, 1, 25);
    if (c.type === 21) checkOptions(c, at, 2, 10);
    if (c.type === 22) checkOptions(c, at, 1, 10);
    if (c.type === 4 && len(c.value) > 4000) bad(at, 'text input value must be at most 4000 characters.');
    if (c.type === 4 && len(c.placeholder) > 100) bad(at, 'placeholder must be at most 100 characters.');
    if (c.type === 19 && (c.max_values ?? 1) > 10) bad(at, 'a file upload accepts at most 10 files.');
  }
}
