import { defineCommand } from 'shiver-framework';

export default defineCommand({
  name: 'ping',
  description: 'Check that the bot is alive',
  run: (ctx) => ctx.reply(`Pong — ${ctx.client.ws.ping}ms`),
});
