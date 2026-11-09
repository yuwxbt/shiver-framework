import { ShiverError } from './errors.js';
import { button, row, select, text } from './ui/components.js';
import { resolveMessage, usesComponentsV2 } from './ui/message.js';

const normalize = (input) => {
  if (typeof input === 'string') return { content: input };
  if (Array.isArray(input) || typeof input?.type === 'number') return { components: [input].flat() };
  return { ...input };
};

const withRow = (message, buttons) => ({ ...message, components: [...[message.components ?? []].flat(), row(...buttons)] });

function v2Page(page) {
  if (usesComponentsV2(page.components)) return page;
  if (page.embed || page.embeds?.length || page.poll) {
    throw new ShiverError('INVALID_MESSAGE', 'Components V2 pagination cannot include embeds or polls. Use text() and other components on every page.');
  }
  const { content, components, ...options } = page;
  return { ...options, components: [text(content || '\u200b'), ...[components ?? []].flat()] };
}

async function finish(ctx, sent, followUp, input) {
  if (!followUp || !sent) return ctx.edit(input);
  const { allowedMentions, validate } = ctx.bot.options;
  const payload = resolveMessage(input, { mode: 'edit', allowedMentions, validate });
  if (ctx.interaction) return ctx.interaction.editReply({ ...payload, message: sent.id });
  return sent.edit(payload);
}

export async function confirm(ctx, input, o = {}) {
  const message = normalize(input);
  const buttons = [
    button({ id: 'shiver:confirm:yes', label: o.yes ?? 'Confirm', style: o.danger ? 'danger' : 'success' }),
    button({ id: 'shiver:confirm:no', label: o.no ?? 'Cancel' }),
  ];
  const followUp = ctx.replied;
  const sent = await ctx.reply(withRow(message, buttons));
  const answer = await ctx.awaitComponent({ message: sent ?? undefined, time: o.time ?? '30s', filter: (c) => buttons.some((b) => b.custom_id === c.interaction.customId) });
  const done = { ...message, components: [message.components ?? []].flat() };
  if (!answer) {
    await finish(ctx, sent, followUp, done).catch(() => {});
    return null;
  }
  await answer.update(done);
  return answer.interaction.customId.endsWith(':yes');
}

export async function paginate(ctx, pages, o = {}) {
  const lazy = !Array.isArray(pages);
  const count = lazy ? pages?.count : pages.length;
  if (!Number.isSafeInteger(count) || count < 1 || (lazy && typeof pages.render !== 'function')) {
    throw new ShiverError('INVALID_MESSAGE', 'paginate() needs a non-empty array or { count, render(index) }.');
  }
  const menu = o.controls === 'select';
  if (menu && count > 25) throw new ShiverError('INVALID_MESSAGE', 'paginate() select controls support at most 25 pages. Use buttons for longer lists.');
  let messages = lazy ? null : pages.map(normalize);
  const v2 = lazy ? pages.v2 === true : messages.some((page) => usesComponentsV2(page.components));
  if (!lazy && v2) messages = messages.map(v2Page);
  const getPage = async (index) => {
    const page = lazy ? normalize(await pages.render(index)) : messages[index];
    if (v2) return lazy ? v2Page(page) : page;
    if (lazy && usesComponentsV2(page.components)) throw new ShiverError('INVALID_MESSAGE', 'Set v2: true on the pagination source when it renders Components V2.');
    return page;
  };
  let index = Math.min(Math.max(Number.isFinite(o.start) ? Math.trunc(o.start) : 0, 0), count - 1);
  let page = await getPage(index);
  const render = (ended) => {
    if (count === 1) return page;
    const controls = menu ? [select({
      id: 'shiver:page:select',
      disabled: ended,
      options: Array.from({ length: count }, (_, i) => ({
        label: o.pageLabel?.(i) ?? `Page ${i + 1}`,
        value: String(i),
        default: i === index,
      })),
    })] : [
      button({ id: 'shiver:page:prev', label: '‹', disabled: ended || index === 0 }),
      button({ id: 'shiver:page:count', label: `${index + 1} / ${count}`, disabled: true }),
      button({ id: 'shiver:page:next', label: '›', disabled: ended || index === count - 1 }),
    ];
    return withRow(page, controls);
  };
  const targetPage = (click) => {
    const id = click.interaction.customId;
    if (!menu && id === 'shiver:page:prev') return index - 1;
    if (!menu && id === 'shiver:page:next') return index + 1;
    if (menu && id === 'shiver:page:select' && /^\d+$/.test(click.values[0])) return Number(click.values[0]);
    return -1;
  };

  const followUp = ctx.replied;
  const sent = await ctx.reply(render(false));
  if (count === 1) return;
  for (;;) {
    const click = await ctx.awaitComponent({ message: sent ?? undefined, time: o.time ?? '5m', filter: (c) => {
      const target = targetPage(c);
      return target >= 0 && target < count;
    } });
    if (!click) {
      await finish(ctx, sent, followUp, render(true)).catch(() => {});
      return;
    }
    index = targetPage(click);
    if (lazy) await click.deferUpdate();
    page = await getPage(index);
    await click.update(render(false));
  }
}
