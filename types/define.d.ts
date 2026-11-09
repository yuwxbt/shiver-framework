export function defineCommand<O extends Record<string, {
    kind: keyof import("./options.js").OptionValues;
}> = {}, S extends Record<string, Record<string, {
    kind: keyof import("./options.js").OptionValues;
}>> = {}>(def: import("./api-types.js").CommandMeta & Omit<CommandNode<O>, "subcommands"> & {
    subcommands?: { [K in keyof S]: CommandNode<S[K]>; };
}): Readonly<import("./api-types.js").CommandMeta & Omit<CommandNode<O>, "subcommands"> & {
    subcommands?: { [K in keyof S]: CommandNode<S[K]>; };
}>;
export function defineCommand(def: import("./api-types.js").Guards & {
    name: string;
    type: "user";
    run: (ctx: import("./context.js").Context, target: import("discord.js").User | import("discord.js").GuildMember | import("discord.js").APIInteractionGuildMember) => unknown;
}): Readonly<typeof def>;
export function defineCommand(def: import("./api-types.js").Guards & {
    name: string;
    type: "message";
    run: (ctx: import("./context.js").Context, target: import("discord.js").Message) => unknown;
}): Readonly<typeof def>;
export function defineCommand(def: EntryPointDefinition): Readonly<EntryPointDefinition>;
export function defineComponent(def: HandlerDefinition): Readonly<HandlerDefinition>;
export function defineModal(def: HandlerDefinition): Readonly<HandlerDefinition>;
export function defineEvent<E extends keyof import("discord.js").ClientEvents | "ready">(def: {
    name: E;
    once?: boolean;
    filter?: (bot: import("./bot.js").Bot, ...args: E extends keyof import("discord.js").ClientEvents ? import("discord.js").ClientEvents[E] : [import("discord.js").Client<true>]) => boolean | Promise<boolean>;
    run: (bot: import("./bot.js").Bot, ...args: E extends keyof import("discord.js").ClientEvents ? import("discord.js").ClientEvents[E] : [import("discord.js").Client<true>]) => unknown;
}): Readonly<{
    name: E;
    once?: boolean;
    filter?: (bot: import("./bot.js").Bot, ...args: E extends keyof import("discord.js").ClientEvents ? import("discord.js").ClientEvents[E] : [import("discord.js").Client<true>]) => boolean | Promise<boolean>;
    run: (bot: import("./bot.js").Bot, ...args: E extends keyof import("discord.js").ClientEvents ? import("discord.js").ClientEvents[E] : [import("discord.js").Client<true>]) => unknown;
}>;
export function defineTask(def: {
    name: string;
    every: number | string;
    immediate?: boolean;
    run: (bot: import("./bot.js").Bot) => unknown;
}): Readonly<{
    name: string;
    every: number | string;
    immediate?: boolean;
    run: (bot: import("./bot.js").Bot) => unknown;
}>;
export function commandToJSON(def: any): any;
export function resolveLeaf(def: object, path: string[]): {
    leaf: object;
    chain: object[];
    rest: string[];
};
export function compilePattern(pattern: any): (id: any) => any;
export function customId(pattern: string, params?: Record<string, string | number>): string;
export const KIND: unique symbol;
export function defineButton(def: HandlerDefinition): Readonly<HandlerDefinition>;
export function defineSelect(def: HandlerDefinition): Readonly<HandlerDefinition>;
export type CommandNode<O extends Record<string, {
    kind: keyof import("./options.js").OptionValues;
}> = {}> = import("./api-types.js").Guards & {
    description?: string;
    options?: O;
    splitPrefix?: import("./api-types.js").PrefixSplitter;
    run?: (ctx: import("./context.js").Context, options: import("./options.js").InferOptions<O>) => unknown;
    subcommands?: Record<string, CommandNode<any>>;
};
export type HandlerDefinition = import("./api-types.js").Guards & {
    id: string | RegExp;
    run: (ctx: import("./context.js").Context, params: Record<string, string>) => unknown;
};
export type EntryPointDefinition = Omit<import("./api-types.js").CommandMeta, "type" | "description" | "prefix" | "slash" | "aliases" | "guilds" | "splitPrefix"> & import("./api-types.js").Guards & {
    type: "entryPoint";
    description: string;
} & ({
    handler?: "app";
    run: (ctx: import("./context.js").Context) => unknown;
} | {
    handler: "discord";
    run?: never;
});
