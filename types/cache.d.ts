export function messageCache({ maxPerChannel, lifetime, interval }?: {
    maxPerChannel?: number;
    lifetime?: number | string;
    interval?: number | string;
}): Pick<import("discord.js").ClientOptions, "makeCache" | "sweepers">;
