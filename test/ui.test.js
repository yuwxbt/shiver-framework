import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  button, channelSelect, checkbox, checkboxGroup, componentEmbed, container, contentScanFlags, embed, file, fileUpload, gallery, modal,
  radioGroup, resolveMessage, row, section, select, separator, text, textInput, thumbnail, userSelect,
  validateModal, withComponentId,
} from '../src/index.js';
import { toPlain } from '../src/ui/message.js';

const send = (input, defaults) => toPlain(resolveMessage(input, defaults));
const code = (fn, pattern) => assert.throws(fn, (e) => e.name === 'ShiverError' && pattern.test(e.message), `expected ShiverError matching ${pattern}`);

test('Discord component embeds validate the preview subset, byte size, and inline JSON escaping', () => {
  const component = container('hello </script>', button({ url: 'https://example.com', label: 'Open' }));
  const json = componentEmbed(component);
  assert.deepEqual(JSON.parse(json), { component });
  assert.ok(!json.includes('</script>'));
  code(() => componentEmbed(container(button({ id: 'click', label: 'Click' }))), /preview buttons/);
  code(() => componentEmbed(container(file('x.txt'))), /cannot appear in a link preview/);
  code(() => componentEmbed(container(gallery('attachment://x.png'))), /absolute HTTP/);
  code(() => componentEmbed(container('é'.repeat(1500))), /3000-byte/);
});

test('content scans decode both Discord flag layouts and numeric IDs are validated', () => {
  assert.deepEqual(contentScanFlags({ flags: { bitfield: 16 | 128 } }), { explicit: true, gore: false, selfHarm: true });
  assert.deepEqual(contentScanFlags({ content_scan_metadata: { flags: 2 } }), { explicit: false, gore: true, selfHarm: false });
  assert.equal(contentScanFlags({}), null);
  const original = button({ id: 'custom', label: 'Hello' });
  assert.deepEqual(withComponentId(original, 3), { ...original, id: 3 });
  assert.equal(original.id, undefined);
  code(() => send(container(withComponentId(text('One'), 3), withComponentId(text('Two'), 3))), /component id 3 is used twice/);
  code(() => withComponentId(original, -1), /32-bit/);
});

test('file upload filters are normalized and invalid modal children fail locally', () => {
  const input = fileUpload({ id: 'attachment', label: 'File', types: ['.PDF', 'image', '.pdf'] });
  assert.deepEqual(input.component.file_types, ['.pdf', 'image']);
  code(() => fileUpload({ id: 'file', types: ['application/pdf'] }), /file types/);
  code(() => validateModal(modal({ id: 'm', title: 'M' }, row(button({ id: 'b', label: 'Button' })))), /legacy row/);
});

test('components produce Discord API JSON', () => {
  assert.deepEqual(text('hi'), { type: 10, content: 'hi' });
  assert.deepEqual(button({ id: 'a', label: 'A', style: 'danger' }), { type: 2, style: 4, custom_id: 'a', label: 'A' });
  assert.deepEqual(button({ url: 'https://x.y', label: 'Open' }), { type: 2, style: 5, url: 'https://x.y', label: 'Open' });
  assert.deepEqual(button({ sku: '123' }), { type: 2, style: 6, sku_id: '123' });
  assert.deepEqual(button({ id: 'e', emoji: '<a:wave:123456789012345678>' }).emoji, { id: '123456789012345678', name: 'wave', animated: true });
  assert.deepEqual(separator({ divider: false, spacing: 'large' }), { type: 14, divider: false, spacing: 2 });
  assert.deepEqual(thumbnail('https://x.y/a.png', { alt: 'pic' }), { type: 11, media: { url: 'https://x.y/a.png' }, description: 'pic' });
  assert.deepEqual(file('report.pdf'), { type: 13, file: { url: 'attachment://report.pdf' } });
  assert.deepEqual(gallery('https://x.y/a.png', { url: 'https://x.y/b.png', spoiler: true }).items, [
    { media: { url: 'https://x.y/a.png' } },
    { media: { url: 'https://x.y/b.png' }, spoiler: true },
  ]);
  assert.deepEqual(select({ id: 's', options: ['Red', { label: 'Blue', value: 'b' }], min: 1, max: 2 }), {
    type: 3, custom_id: 's', min_values: 1, max_values: 2, options: [{ label: 'Red', value: 'Red' }, { label: 'Blue', value: 'b' }],
  });
  assert.deepEqual(userSelect({ id: 'u', defaults: ['1'] }).default_values, [{ id: '1', type: 'user' }]);
  assert.deepEqual(channelSelect({ id: 'c', channelTypes: [0] }).channel_types, [0]);
});

test('container accepts options, strings, falsy children and loose buttons', () => {
  const c = container({ accent: '#ff0000' }, '# Title', false && 'hidden', null, button({ id: 'a', label: 'A' }), button({ id: 'b', label: 'B' }));
  assert.equal(c.type, 17);
  assert.equal(c.accent_color, 0xff0000);
  assert.deepEqual(c.components.map((k) => k.type), [10, 1]);
  assert.equal(c.components[1].components.length, 2);
});

test('section needs an accessory and wraps url strings as thumbnails', () => {
  assert.equal(section({ accessory: 'https://x.y/a.png' }, 'hello').accessory.type, 11);
  code(() => section('hello'), /needs an accessory/);
});

test('resolveMessage flags Components V2 automatically', () => {
  const out = send(container('hello'));
  assert.equal(out.flags, 32768);
  assert.equal(out.components[0].type, 17);
  assert.equal(send({ components: [text('a')], ephemeral: true }).flags, 32768 | 64);
});

test('resolveMessage keeps classic messages classic and wraps loose buttons', () => {
  const out = send({ content: 'hi', components: [button({ id: 'a', label: 'A' }), select({ id: 's', options: ['x'] })] });
  assert.equal(out.flags, undefined);
  assert.deepEqual(out.components.map((c) => [c.type, c.components.length]), [[1, 1], [1, 1]]);
});

test('ephemeral is dropped on edits and sends', () => {
  assert.equal(send({ content: 'x', ephemeral: true }, { mode: 'reply' }).flags, 64);
  assert.equal(send({ content: 'x', ephemeral: true }, { mode: 'edit' }).flags, undefined);
  assert.equal(send('x', { ephemeral: true }).flags, 64);
});

test('embed shortcuts', () => {
  const e = embed({ title: 'T', color: 'blurple', footer: 'f', image: 'https://x.y/i.png', timestamp: new Date(0), fields: [{ name: 'a', value: 1 }, null] });
  assert.deepEqual(e, { title: 'T', color: 0x5865f2, timestamp: '1970-01-01T00:00:00.000Z', footer: { text: 'f' }, image: { url: 'https://x.y/i.png' }, fields: [{ name: 'a', value: '1' }] });
  assert.equal(send({ embed: { title: 'x' } }).embeds.length, 1);
});

test('validation explains what to fix', () => {
  code(() => send({ content: 'x', components: [text('y')] }), /cannot also have "content"/);
  code(() => send('x'.repeat(2001)), /content is 2001 characters, max is 2000/);
  code(() => send({ components: [row(...Array.from({ length: 6 }, (_, i) => button({ id: `b${i}`, label: 'x' })))] }), /at most 5 buttons/);
  code(() => send({ components: [row(button({ id: 'a', label: 'x' }), select({ id: 's', options: ['x'] }))] }), /either up to 5 buttons or exactly 1 select/);
  code(() => send({ components: [button({ id: 'same', label: 'x' }), button({ id: 'same', label: 'y' })] }), /used twice/);
  code(() => send({ embeds: [{ title: 'x'.repeat(257) }] }), /title is 257 characters, max is 256/);
  code(() => send(container(...Array.from({ length: 41 }, (_, i) => `line ${i}`))), /at most 40 components/);
  code(() => button({ label: 'no id' }), /needs an "id"/);
  code(() => button({ id: 'x', label: 'x', style: 'huge' }), /Unknown button style/);
  assert.doesNotThrow(() => send('x'.repeat(2001), { validate: false }));
});

test('modal inputs are wrapped in labels', () => {
  const m = modal(
    { id: 'm', title: 'Form' },
    'Some intro text',
    textInput({ id: 'name', label: 'Name', description: 'Your name', max: 50 }),
    radioGroup({ id: 'kind', label: 'Kind', options: ['A', 'B'] }),
    checkboxGroup({ id: 'tags', label: 'Tags', options: ['x', 'y'], min: 0, required: false }),
    fileUpload({ id: 'proof', label: 'Proof', max: 3, types: ['image', '.pdf'], required: false }),
  );
  assert.deepEqual(m.components.map((c) => c.type), [10, 18, 18, 18, 18]);
  assert.deepEqual(m.components[1], { type: 18, label: 'Name', description: 'Your name', component: { type: 4, custom_id: 'name', style: 1, max_length: 50 } });
  assert.deepEqual(m.components[4].component, { type: 19, custom_id: 'proof', max_values: 3, required: false, file_types: ['image', '.pdf'] });
  assert.doesNotThrow(() => validateModal(m));
  assert.equal(checkbox({ id: 'ok', label: 'Agree' }).component.type, 23);
  code(() => modal({ id: 'm', title: 'x' }, textInput({ id: 'a' })), /inputs need a label/);
  code(() => validateModal(modal({ id: 'm', title: 'x'.repeat(46) }, textInput({ id: 'a', label: 'A' }))), /title must be 1-45/);
  code(() => validateModal(modal({ id: 'm', title: 'x' }, radioGroup({ id: 'r', label: 'R', options: ['only'] }))), /needs 2-10 options/);
});
