import { ShiverError } from './errors.js';
import { confirm, paginate } from './helpers.js';
import { ComponentType } from './ui/components.js';
import { resolveMessage } from './ui/message.js';
import { validateModal } from './ui/validate.js';
import { ms } from './util.js';

export class Context {
  #interaction;
  #message;
  #sent = null;
  #queue = Promise.resolve();

  constructor(bot, source, data = {}) {
    this.bot = bot;
    this.#interaction = source.interaction ?? null;
    this.#message = source.message ?? null;
    this.kind = data.kind ?? 'command';
    this.command = data.command ?? null;
    this.options = data.options ?? {};
    this.params = data.params ?? {};
    this.values = data.values ?? [];
    this.fields = data.fields ?? {};
    this.target = data.target ?? null;
    this.ephemeral = data.ephemeral ?? false;
    this.state = {};
  }

  get client() { return this.bot.client; }
  get store() { return this.bot.store; }
  get log() { return this.bot.log; }
  get interaction() { return this.#interaction; }
  get message() { return this.#message ?? this.#interaction?.message ?? null; }
  get isInteraction() { return this.#interaction !== null; }
  get user() { return this.#interaction?.user ?? this.#message.author; }
  get member() { return (this.#interaction ?? this.#message).member ?? null; }
  get guild() { return (this.#interaction ?? this.#message).guild ?? null; }
  get guildId() { return (this.#interaction ?? this.#message).guildId ?? null; }
  get channel() { return (this.#interaction ?? this.#message).channel ?? null; }
  get channelId() { return (this.#interaction ?? this.#message).channelId ?? null; }
  get locale() {
    const fallback = this.#interaction?.locale ?? this.guild?.preferredLocale ?? this.bot.options.defaultLocale;
    return this.bot.options.resolveLocale?.(this, fallback) ?? fallback;
  }
  get deferred() { return Boolean(this.#interaction?.deferred); }
  get replied() { return Boolean(this.#interaction?.replied || this.#sent); }
  get attachmentSizeLimit() { return this.#interaction?.attachmentSizeLimit ?? null; }
  get installationOwners() { return this.#interaction?.authorizingIntegrationOwners ?? null; }
  get entitlements() { return this.#interaction?.entitlements ?? null; }
  get memberPermissions() {
    return this.#interaction?.memberPermissions
      ?? this.#message?.member?.permissionsIn?.(this.channel)
      ?? this.#message?.member?.permissions
      ?? null;
  }
  get appPermissions() {
    return this.#interaction?.appPermissions ?? this.guild?.members?.me?.permissionsIn?.(this.channel) ?? null;
  }

  t(key, vars) { return this.bot.t(this.locale, key, vars); }

  #msg(input, mode) {
    return resolveMessage(input, {
      mode,
      ephemeral: this.ephemeral,
      allowedMentions: this.bot.options.allowedMentions,
      validate: this.bot.options.validate,
    });
  }

  #serial(fn) {
    const run = this.#queue.then(fn);
    this.#queue = run.catch(() => {});
    return run;
  }

  reply(input) {
    return this.#serial(async () => {
      const i = this.#interaction;
      if (i) {
        if (i.deferred && !i.replied) return i.editReply(this.#msg(input, 'edit'));
        if (i.replied) return i.followUp(this.#msg(input, 'reply'));
        const response = await i.reply({ ...this.#msg(input, 'reply'), withResponse: true });
        return response?.resource?.message ?? null;
      }
      const payload = this.#msg(input, 'send');
      if (this.#sent) return this.#message.channel.send(payload);
      this.#sent = await this.#message.reply({ ...payload, failIfNotExists: false });
      return this.#sent;
    });
  }

  defer(o = {}) {
    return this.#serial(async () => {
      const i = this.#interaction;
      if (!i) return void this.#message.channel.sendTyping?.().catch(() => {});
      if (i.deferred || i.replied) return undefined;
      await i.deferReply({ flags: (o.ephemeral ?? this.ephemeral) ? 64 : undefined });
      return undefined;
    });
  }

  edit(input) {
    return this.#serial(async () => {
      const i = this.#interaction;
      if (i) {
        if (i.deferred || i.replied) return i.editReply(this.#msg(input, 'edit'));
        if (i.isMessageComponent?.() || i.isFromMessage?.()) return void await i.update(this.#msg(input, 'edit'));
        const response = await i.reply({ ...this.#msg(input, 'reply'), withResponse: true });
        return response?.resource?.message ?? null;
      }
      if (this.#sent) return this.#sent.edit(this.#msg(input, 'edit'));
      this.#sent = await this.#message.reply({ ...this.#msg(input, 'send'), failIfNotExists: false });
      return this.#sent;
    });
  }

  update(input) { return this.edit(input); }

  deferUpdate() {
    return this.#serial(async () => {
      const i = this.#interaction;
      if (i && !i.deferred && !i.replied) await (i.deferUpdate ? i.deferUpdate() : i.deferReply());
    });
  }

  followUp(input) {
    return this.#serial(() => {
      const i = this.#interaction;
      if (i) return i.deferred || i.replied ? i.followUp(this.#msg(input, 'reply')) : i.reply({ ...this.#msg(input, 'reply'), withResponse: true }).then((r) => r?.resource?.message ?? null);
      return this.#message.channel.send(this.#msg(input, 'send'));
    });
  }

  delete() {
    return this.#serial(async () => {
      if (this.#interaction) await this.#interaction.deleteReply();
      else await this.#sent?.delete();
    });
  }

  showModal(modal) {
    return this.#serial(async () => {
      const i = this.#interaction;
      if (!i?.showModal) throw new ShiverError('UNSUPPORTED', 'Modals can only be opened from a slash command, context menu, button or select — not from a prefix command or a modal submit.');
      if (i.deferred || i.replied) throw new ShiverError('UNSUPPORTED', 'showModal() must be the first response. Remove the earlier reply/defer (and "defer: true" on the definition).');
      if (this.bot.options.validate !== false) validateModal(modal);
      await i.showModal({ toJSON: () => modal });
    });
  }

  launchActivity() {
    return this.#serial(async () => {
      const i = this.#interaction;
      if (!i?.launchActivity || i.deferred || i.replied) {
        throw new ShiverError('UNSUPPORTED', 'launchActivity() needs a supported interaction and must be its first response.');
      }
      await i.launchActivity();
    });
  }

  async awaitModal(modal, o = {}) {
    await this.showModal(modal);
    const submit = await this.#interaction.awaitModalSubmit({
      time: ms(o.time ?? '10m'),
      filter: (s) => s.customId === modal.custom_id && s.user.id === this.user.id,
    }).catch(() => null);
    return submit && new Context(this.bot, { interaction: submit }, { kind: 'modal', command: this.command, fields: readFields(submit), ephemeral: this.ephemeral });
  }

  async awaitComponent(o = {}) {
    const message = o.message ?? this.#sent ?? await this.#interaction?.fetchReply();
    if (!message?.awaitMessageComponent) throw new ShiverError('UNSUPPORTED', 'awaitComponent() needs a message: reply first, or pass { message }.');
    const wrap = (i) => new Context(this.bot, { interaction: i }, { kind: 'component', command: this.command, values: i.values ?? [], ephemeral: this.ephemeral });
    const interaction = await message.awaitMessageComponent({
      time: ms(o.time ?? '5m'),
      filter: (i) => {
        try {
          if (o.filter && !o.filter(wrap(i))) return false;
        } catch (error) {
          this.log.warn('Component collector filter failed', error);
          return false;
        }
        if (!o.anyone && i.user.id !== this.user.id) {
          i.reply({ content: this.bot.message('notYours'), flags: 64 }).catch(() => {});
          return false;
        }
        return true;
      },
    }).catch(() => null);
    return interaction && wrap(interaction);
  }

  confirm(input, o) { return confirm(this, input, o); }

  paginate(pages, o) { return paginate(this, pages, o); }
}

export function readFields(interaction) {
  return Object.fromEntries(Array.from(interaction.fields?.fields ?? [], ([id, field]) => [
    id, field.type === ComponentType.FileUpload
      ? [...(field.attachments?.values() ?? [])]
      : field.values ?? field.value ?? null,
  ]));
}
