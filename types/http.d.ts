export function createInteractionHandler(bot: import("./bot.js").Bot, options: {
    publicKey: string;
    applicationId?: string;
    maxBodyBytes?: number;
    maxAge?: number;
}): (request: Request) => Promise<Response>;
