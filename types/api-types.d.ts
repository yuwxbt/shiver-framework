export type Context = import("./context.js").Context;
export type Bot = import("./bot.js").Bot;
export type Duration = number | string;
export type Middleware = (ctx: Context, next: () => Promise<unknown>) => unknown;
export type Permissions = import("discord.js").PermissionResolvable;
export type PrefixSplitter = (text: string, message: import("discord.js").Message) => string[] | Promise<string[]>;
export type Guards = {
    guildOnly?: boolean;
    dmOnly?: boolean;
    channelTypes?: number[];
    roles?: string[];
    ownerOnly?: boolean;
    nsfw?: boolean;
    permissions?: Permissions;
    botPermissions?: Permissions;
    entitlement?: string | string[];
    cooldown?: Duration | ({
        duration: Duration;
    } & CooldownOptions);
    use?: Middleware | Middleware[];
    ephemeral?: boolean;
    defer?: boolean | "ephemeral" | "update";
};
export type CooldownOptions = {
    per?: "user" | "guild" | "channel" | "global";
    uses?: number;
    exemptUsers?: string[];
};
export type CommandMeta = {
    name: string;
    description?: string;
    type?: "slash";
    prefix?: boolean;
    slash?: boolean;
    aliases?: string[];
    splitPrefix?: PrefixSplitter;
    guilds?: string | string[];
    defaultMemberPermissions?: Permissions;
    contexts?: Array<"guild" | "botDM" | "privateChannel" | 0 | 1 | 2>;
    install?: Array<"guild" | "user" | 0 | 1>;
    nameLocalizations?: Record<string, string>;
    descriptionLocalizations?: Record<string, string>;
};
export type BotOptions = {
    dir?: string | string[];
    token?: string;
    env?: boolean;
    sync?: boolean;
    validate?: boolean;
    mentionPrefix?: boolean;
    ownersBypassCooldown?: boolean;
    defaultLocale?: string;
    resolveLocale?: (ctx: Context, fallback: string) => string | undefined;
    allowedMentions?: import("discord.js").MessageMentionOptions;
    messages?: Record<string, string | null | ((...args: any[]) => string)>;
    logger?: {
        debug: (...args: any[]) => void;
        info: (...args: any[]) => void;
        warn: (...args: any[]) => void;
        error: (...args: any[]) => void;
    };
    logLevel?: "debug" | "info" | "warn" | "error" | "silent";
    store?: import("./store.js").Store;
    owners?: string | string[];
    use?: Middleware | Middleware[];
    plugins?: ReadonlyArray<import("./plugin.js").Plugin>;
    client?: Partial<import("discord.js").ClientOptions>;
    intents?: import("discord.js").ClientOptions["intents"];
    prefix?: string | string[] | ((message: import("discord.js").Message) => string | string[] | Promise<string | string[]>);
    splitPrefix?: PrefixSplitter;
    devGuild?: string;
    autoDefer?: boolean | Duration;
    catchUnhandled?: boolean;
    signals?: boolean;
    watch?: boolean;
    locales?: string;
    onError?: (ctx: Context, error: Error, traceId: string) => unknown;
};
export type Component = {
    type: number;
    [key: string]: any;
};
export type MessageInput = string | Component | Component[] | ({
    content?: string | null;
    components?: Component | Component[];
    ephemeral?: boolean;
    embeds?: object[];
    embed?: object;
    files?: import("discord.js").MessageCreateOptions["files"];
    allowedMentions?: import("discord.js").MessageMentionOptions;
    [key: string]: any;
});
export type Modal = {
    custom_id: string;
    title: string;
    components: Component[];
};
export type FieldValue = string | string[] | boolean | import("discord.js").Attachment[] | null;
