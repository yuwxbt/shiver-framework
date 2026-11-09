import { defineEvent } from 'shiver-framework';

export default defineEvent({
  name: 'ready',
  once: true,
  run: (bot) => bot.client.user.setActivity('/ping'),
});
