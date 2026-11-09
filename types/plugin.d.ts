export function definePlugin(plugin: Plugin): Readonly<Plugin>;
export class PluginSet {
    constructor(plugins: ReadonlyArray<Plugin>);
    ordered: any[];
    start(bot: import('./bot.js').Bot, signal: AbortSignal): Promise<void>;
    stop(): Promise<void>;
    #private;
}
export type Plugin = {
    name: string;
    requires?: string[];
    definitions?: object[];
    use?: import("./api-types.js").Middleware | import("./api-types.js").Middleware[];
    setup?: (bot: import("./bot.js").Bot) => void | (() => unknown) | Promise<void | (() => unknown)>;
};
