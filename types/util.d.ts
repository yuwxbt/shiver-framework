export function ms(value: number | string): number;
export function resolveColor(color: number | string | null | undefined): number | undefined;
export function clean(object: any): any;
export function isPlainObject(value: any): value is Record<string, any>;
export function traceId(): string;
export function chunk<T>(array: T[], size: number): T[][];
