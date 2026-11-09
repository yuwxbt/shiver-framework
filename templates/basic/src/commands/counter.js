import { button, container, defineCommand, defineComponent, opt, separator } from 'shiver-framework';

const view = (count) => container(
  { accent: 'blurple' },
  `## Counter\nCurrent value: **${count}**`,
  separator(),
  button({ id: `counter:add:${count}`, label: '+1', style: 'primary' }),
  button({ id: 'counter:reset', label: 'Reset' }),
);

export default defineCommand({
  name: 'counter',
  description: 'A counter with buttons',
  options: {
    start: opt.integer('Starting value', { min: 0, max: 1000 }),
  },
  run: (ctx, { start }) => ctx.reply(view(start ?? 0)),
});

export const add = defineComponent({
  id: 'counter:add:{count}',
  run: (ctx, { count }) => ctx.update(view(Number(count) + 1)),
});

export const reset = defineComponent({
  id: 'counter:reset',
  run: (ctx) => ctx.update(view(0)),
});
