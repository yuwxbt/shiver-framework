export function checkName(name: any, where: any): void;
export function checkDescription(description: any, where: any): void;
export function buildOptions(map?: {}, where?: string): any[];
export function readInteractionOptions(interaction: any, map?: {}): {
    [k: string]: any;
};
export function tokenize(text: any): {
    value: any;
    index: any;
}[];
export function usage(map?: {}): string;
export function parsePrefixOptions(message: any, text: any, map: {}, split: any): Promise<{
    [k: string]: any;
}>;
export const opt: Readonly<{
    string: <C extends OptionConfig<string>>(description: string | ({
        description: string;
    } & C), config?: C) => {
        kind: "string";
        description: string;
    } & OptionConfig<string> & C;
    integer: <C extends OptionConfig<number>>(description: string | ({
        description: string;
    } & C), config?: C) => {
        kind: "integer";
        description: string;
    } & OptionConfig<number> & C;
    number: <C extends OptionConfig<number>>(description: string | ({
        description: string;
    } & C), config?: C) => {
        kind: "number";
        description: string;
    } & OptionConfig<number> & C;
    boolean: <C extends OptionConfig<boolean>>(description: string | ({
        description: string;
    } & C), config?: C) => {
        kind: "boolean";
        description: string;
    } & OptionConfig<boolean> & C;
    user: <C extends OptionConfig<import("discord.js").User>>(description: string | ({
        description: string;
    } & C), config?: C) => {
        kind: "user";
        description: string;
    } & OptionConfig<import("discord.js").User> & C;
    member: <C extends OptionConfig<import("discord.js").GuildMember | import("discord.js").APIInteractionGuildMember>>(description: string | ({
        description: string;
    } & C), config?: C) => {
        kind: "member";
        description: string;
    } & OptionConfig<import("discord.js").GuildMember | import("discord.js").APIInteractionGuildMember> & C;
    channel: <C extends OptionConfig<import("discord.js").Channel | import("discord.js").APIInteractionDataResolvedChannel>>(description: string | ({
        description: string;
    } & C), config?: C) => {
        kind: "channel";
        description: string;
    } & OptionConfig<import("discord.js").Channel | import("discord.js").APIInteractionDataResolvedChannel> & C;
    role: <C extends OptionConfig<import("discord.js").Role | import("discord.js").APIRole>>(description: string | ({
        description: string;
    } & C), config?: C) => {
        kind: "role";
        description: string;
    } & OptionConfig<import("discord.js").Role | import("discord.js").APIRole> & C;
    mentionable: <C extends OptionConfig<import("discord.js").User | import("discord.js").GuildMember | import("discord.js").APIInteractionGuildMember | import("discord.js").Role | import("discord.js").APIRole>>(description: string | ({
        description: string;
    } & C), config?: C) => {
        kind: "mentionable";
        description: string;
    } & OptionConfig<import("discord.js").User | import("discord.js").GuildMember | import("discord.js").APIInteractionGuildMember | import("discord.js").Role | import("discord.js").APIRole> & C;
    attachment: <C extends OptionConfig<import("discord.js").Attachment>>(description: string | ({
        description: string;
    } & C), config?: C) => {
        kind: "attachment";
        description: string;
    } & OptionConfig<import("discord.js").Attachment> & C;
}>;
export type OptionValues = {
    string: string;
    integer: number;
    number: number;
    boolean: boolean;
    user: import("discord.js").User;
    member: import("discord.js").GuildMember | import("discord.js").APIInteractionGuildMember;
    channel: import("discord.js").Channel | import("discord.js").APIInteractionDataResolvedChannel;
    role: import("discord.js").Role | import("discord.js").APIRole;
    mentionable: OptionValues["user"] | OptionValues["member"] | OptionValues["role"];
    attachment: import("discord.js").Attachment;
};
export type OptionConfig<T> = {
    required?: boolean;
    default?: T;
    choices?: Array<T | {
        name: string;
        value: T;
        nameLocalizations?: Record<string, string>;
    }>;
    autocomplete?: (ctx: import("./context.js").Context, value: T) => Array<T | {
        name: string;
        value: T;
    }> | Promise<Array<T | {
        name: string;
        value: T;
    }>>;
    autocompleteUse?: import("./api-types.js").Middleware | import("./api-types.js").Middleware[];
    min?: number;
    max?: number;
    channelTypes?: number[];
    types?: string[];
    nameLocalizations?: Record<string, string>;
    descriptionLocalizations?: Record<string, string>;
};
export type Option<K extends keyof OptionValues> = {
    kind: K;
    description: string;
} & OptionConfig<OptionValues[K]>;
export type InferOptions<O extends Record<string, {
    kind: keyof OptionValues;
}>> = { [P in keyof O]: O[P] extends {
    required: true;
} ? OptionValues[O[P]["kind"]] : O[P] extends {
    default: infer D;
} ? OptionValues[O[P]["kind"]] | D : OptionValues[O[P]["kind"]] | null; };
