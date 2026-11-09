export class ShiverError extends Error {
    constructor(code: string, message: string);
    code: string;
}
export class UserError extends Error {
    constructor(message: string | object);
    payload: any;
}
