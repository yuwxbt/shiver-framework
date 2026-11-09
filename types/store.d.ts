export function scope(store: Store, prefix: string): Store;
export class MemoryStore {
    map: Map<string, {
        value: any;
        expires: number | null;
    }>;
    get(key: string): Promise<any>;
    set(key: string, value: any, o?: {
        ttl?: number | string;
    }): Promise<void>;
    delete(key: string): Promise<boolean>;
    keys(prefix?: string): Promise<string[]>;
    close(): Promise<void>;
    #private;
}
export class JsonStore extends MemoryStore {
    constructor(path: string);
    flush(): Promise<void>;
    #private;
}
export class SqliteStore {
    constructor(path: string);
    get(key: string): Promise<any>;
    set(key: string, value: any, o?: {
        ttl?: number | string;
    }): Promise<void>;
    delete(key: string): Promise<boolean>;
    keys(prefix?: string): Promise<any>;
    close(): Promise<void>;
    #private;
}
export type Store = {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any, o?: {
        ttl?: number | string;
    }) => Promise<void>;
    delete: (key: string) => Promise<boolean>;
    keys: (prefix?: string) => Promise<string[]>;
    close?: () => Promise<void>;
};
