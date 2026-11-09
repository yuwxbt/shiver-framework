export function compose(stack: import("./api-types.js").Middleware[], handler: (ctx: import("./context.js").Context) => unknown): (ctx: import("./context.js").Context) => Promise<unknown>;
export function guardsFor(node: any): any;
export function guildOnly(): import("./api-types.js").Middleware;
export function dmOnly(): import("./api-types.js").Middleware;
export function channelOnly(...types: number[]): import("./api-types.js").Middleware;
export function requireRoles(...ids: string[]): import("./api-types.js").Middleware;
export function ownerOnly(): import("./api-types.js").Middleware;
export function nsfwOnly(): import("./api-types.js").Middleware;
export function requirePermissions(...permissions: (import("discord.js").PermissionResolvable)[]): import("./api-types.js").Middleware;
export function requireBotPermissions(...permissions: (import("discord.js").PermissionResolvable)[]): import("./api-types.js").Middleware;
export function requireEntitlement(...skus: (string | string[])[]): import("./api-types.js").Middleware;
export function limitConcurrency(limit: number, o?: {
    per?: "user" | "guild" | "channel" | "global";
}): import("./api-types.js").Middleware;
export function cooldown(duration: any, o?: {}): import("./api-types.js").Middleware;
