import { createBot, JsonStore } from 'shiver-framework';

const bot = createBot({
  dir: './src',
  devGuild: process.env.DEV_GUILD || undefined,
  store: new JsonStore('./data/store.json'),
});

await bot.start();
