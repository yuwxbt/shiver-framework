import { defineCommand, defineModal, modal, radioGroup, textInput } from 'shiver-framework';

export default defineCommand({
  name: 'feedback',
  description: 'Send feedback to the bot owner',
  run: (ctx) => ctx.showModal(modal(
    { id: 'feedback', title: 'Feedback' },
    radioGroup({ id: 'kind', label: 'What is this about?', options: ['Bug', 'Idea', 'Other'] }),
    textInput({ id: 'body', label: 'Details', style: 'paragraph', max: 1000 }),
  )),
});

export const submit = defineModal({
  id: 'feedback',
  ephemeral: true,
  async run(ctx) {
    const { kind, body } = ctx.fields;
    await ctx.store.set(`feedback:${Date.now()}`, { kind, body, user: ctx.user.id });
    await ctx.reply('Thanks — saved.');
  },
});
