import { createBot, defineCommand, defineComponent, defineModal, defineEvent, opt, container, button, componentEmbed, withComponentId } from 'shiver-framework';
import { runCommand, runPrefix } from 'shiver-framework/testing';
const command = defineCommand({
  name: 'echo', description: 'Echo',
  options: { text: opt.string('Text', {required: true}), count: opt.integer('Count'), enabled: opt.boolean('Enabled', {default: false}) },
  async run(ctx, options) {
    const text: string = options.text;
    const count: number | null = options.count;
    const enabled: boolean = options.enabled;
    await ctx.reply(container(text + count + enabled, button({id: 'again', label: 'Again'})));
  }
});
createBot({env: false, prefix: '!', autoDefer: '2s'}).add(command);
defineComponent({id: 'item:{id}', run: (ctx, params) => ctx.reply(params.id)});
defineModal({id: 'form', run: ctx => ctx.reply(String(ctx.fields.name))});
defineEvent({name: 'guildMemberAdd', run: (bot, member) => member.send(bot.t('en-US', 'welcome'))});
defineCommand({name: 'Inspect', type: 'message', run: (ctx, target) => ctx.reply(target.content)});
await runCommand(command, {options: {text: 'Hi'}});
const prefix = await runPrefix(command, {content: '!echo hello'});
if (prefix.ctx) {
  const limit: number | null = prefix.ctx.attachmentSizeLimit;
  const permissions: boolean | undefined = prefix.ctx.memberPermissions?.has('SendMessages');
  void limit;
  void permissions;
}
const activity = defineCommand({name: 'play', type: 'entryPoint', description: 'Play', run: ctx => ctx.launchActivity()});
await runCommand(activity);
defineComponent({id: /^task:(?<id>\d+)$/, run: (ctx, params) => ctx.reply(params.id)});
const preview: string = componentEmbed(withComponentId(container('Preview'), 1));
void preview;

defineCommand({name: 'tools', description: 'Tools', subcommands: {echo: {
  description: 'Echo', options: {text: opt.string('Text', {required: true})},
  run(ctx, options) { const text: string = options.text; return ctx.reply(text); }
}}});
type Assert<T extends true> = T;
type NotAny<T> = 0 extends (1 & T) ? false : true;
type ComponentIsTyped = Assert<NotAny<ReturnType<typeof defineComponent>>>;
type ModalIsTyped = Assert<NotAny<ReturnType<typeof defineModal>>>;
