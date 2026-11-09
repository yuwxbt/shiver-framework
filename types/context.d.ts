export function readFields(interaction: any): any;
export class Context {
    constructor(bot: import("./bot.js").Bot, source: {
        interaction?: any;
        message?: any;
    }, data?: {
        kind?: "command" | "prefix" | "component" | "modal" | "autocomplete";
        command?: import("./define.js").CommandNode & {
            name: string;
        };
        options?: Record<string, unknown>;
        params?: Record<string, string>;
        values?: string[];
        fields?: Record<string, import("./api-types.js").FieldValue>;
        target?: import("discord.js").User | import("discord.js").GuildMember | import("discord.js").Message | null;
        ephemeral?: boolean;
    });
    bot: import("./bot.js").Bot;
    kind: "command" | "prefix" | "component" | "modal" | "autocomplete";
    command: import("./api-types.js").Guards & {
        description?: string;
        options?: {};
        splitPrefix?: import("./api-types.js").PrefixSplitter;
        run?: (ctx: import("./context.js").Context, options: import("./options.js").InferOptions<{}>) => unknown;
        subcommands?: Record<string, import("./define.js").CommandNode<any>>;
    } & {
        name: string;
    } | null;
    options: Record<string, unknown>;
    params: Record<string, string>;
    values: string[];
    fields: Record<string, import("./api-types.js").FieldValue>;
    target: import("discord.js").User | import("discord.js").GuildMember | import("discord.js").APIInteractionGuildMember | import("discord.js").Message<boolean> | null;
    ephemeral: boolean;
    state: Record<string, unknown>;
    get client(): import("discord.js").Client<boolean>;
    get store(): import("./store.js").Store;
    get log(): {
        debug: (...args: any[]) => void;
        info: (...args: any[]) => void;
        warn: (...args: any[]) => void;
        error: (...args: any[]) => void;
    };
    get interaction(): any;
    get message(): import("discord.js").Message | null;
    get isInteraction(): boolean;
    get user(): import("discord.js").User;
    get member(): import("discord.js").GuildMember | import("discord.js").APIInteractionGuildMember | null;
    get guild(): import("discord.js").Guild | null;
    get guildId(): string | null;
    get channel(): import("discord.js").TextBasedChannel | null;
    get channelId(): string | null;
    get locale(): string;
    get deferred(): boolean;
    get replied(): boolean;
    get attachmentSizeLimit(): number | null;
    get installationOwners(): Readonly<import("discord.js").BaseInteraction["authorizingIntegrationOwners"]> | null;
    get entitlements(): import("discord.js").BaseInteraction["entitlements"] | null;
    get memberPermissions(): Readonly<import("discord.js").PermissionsBitField> | null;
    get appPermissions(): Readonly<import("discord.js").PermissionsBitField> | null;
    t(key: string, vars?: Record<string, unknown>): string;
    reply(input: import("./api-types.js").MessageInput): Promise<import("discord.js").Message | null>;
    defer(o?: {
        ephemeral?: boolean;
    }): Promise<void>;
    edit(input: import("./api-types.js").MessageInput): Promise<import("discord.js").Message | null | void>;
    update(input: import("./api-types.js").MessageInput): Promise<import("discord.js").Message | null | void>;
    deferUpdate(): Promise<void>;
    followUp(input: import("./api-types.js").MessageInput): Promise<import("discord.js").Message | null>;
    delete(): Promise<void>;
    showModal(modal: import("./api-types.js").Modal): Promise<void>;
    launchActivity(): Promise<void>;
    awaitModal(modal: import("./api-types.js").Modal, o?: {
        time?: number | string;
    }): Promise<Context | null>;
    awaitComponent(o?: {
        message?: any;
        time?: number | string;
        filter?: (ctx: Context) => boolean;
        anyone?: boolean;
    }): Promise<Context | null>;
    confirm(input: import("./api-types.js").MessageInput, o?: {
        yes?: string;
        no?: string;
        danger?: boolean;
        time?: number | string;
    }): Promise<boolean | null>;
    paginate(pages: import("./api-types.js").MessageInput[] | {
        count: number;
        v2?: boolean;
        render: (index: number) => import("./api-types.js").MessageInput | Promise<import("./api-types.js").MessageInput>;
    }, o?: {
        time?: number | string;
        start?: number;
        controls?: "buttons" | "select";
        pageLabel?: (index: number) => string;
    }): Promise<void>;
    #private;
}
