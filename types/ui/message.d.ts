export function usesComponentsV2(components: any): boolean;
export function componentEmbed(component: import("../api-types.js").Component): string;
export function embed(o?: {
    title?: string;
    description?: string;
    url?: string;
    color?: string | number;
    timestamp?: boolean | Date | string;
    author?: string | {
        name: string;
        url?: string;
        icon?: string;
        iconURL?: string;
        icon_url?: string;
    };
    footer?: string | {
        text: string;
        icon?: string;
        iconURL?: string;
        icon_url?: string;
    };
    image?: string | {
        url: string;
    };
    thumbnail?: string | {
        url: string;
    };
    fields?: Array<{
        name: string;
        value: string | number;
        inline?: boolean;
    }>;
} | import("discord.js").EmbedBuilder): import("discord.js").APIEmbed;
export function poll(o: {
    question: string | {
        text: string;
    };
    answers: Array<string | {
        text: string;
        emoji?: string | object;
    }>;
    duration?: number | string;
    multi?: boolean;
    allowMultiselect?: boolean;
}): {
    question: any;
    answers: any[];
    duration: number;
    allowMultiselect: boolean;
};
export function resolveMessage(input: import("../api-types.js").MessageInput, defaults?: {
    mode?: "reply" | "edit" | "send";
    ephemeral?: boolean;
    allowedMentions?: object;
    validate?: boolean;
}): {
    [key: string]: any;
    type: number;
} | {
    [n: number]: import("../api-types.js").Component;
    length: number;
    toString(): string;
    toLocaleString(): string;
    toLocaleString(locales: string | string[], options?: Intl.NumberFormatOptions & Intl.DateTimeFormatOptions): string;
    pop(): import("../api-types.js").Component;
    push(...items: import("../api-types.js").Component[]): number;
    concat(...items: ConcatArray<import("../api-types.js").Component>[]): import("../api-types.js").Component[];
    concat(...items: (import("../api-types.js").Component | ConcatArray<import("../api-types.js").Component>)[]): import("../api-types.js").Component[];
    join(separator?: string): string;
    reverse(): import("../api-types.js").Component[];
    shift(): import("../api-types.js").Component;
    slice(start?: number, end?: number): import("../api-types.js").Component[];
    sort(compareFn?: (a: import("../api-types.js").Component, b: import("../api-types.js").Component) => number): import("../api-types.js").Component[];
    splice(start: number, deleteCount?: number): import("../api-types.js").Component[];
    splice(start: number, deleteCount: number, ...items: import("../api-types.js").Component[]): import("../api-types.js").Component[];
    unshift(...items: import("../api-types.js").Component[]): number;
    indexOf(searchElement: import("../api-types.js").Component, fromIndex?: number): number;
    lastIndexOf(searchElement: import("../api-types.js").Component, fromIndex?: number): number;
    every<S extends import("../api-types.js").Component>(predicate: (value: import("../api-types.js").Component, index: number, array: import("../api-types.js").Component[]) => value is S, thisArg?: any): this is S[];
    every(predicate: (value: import("../api-types.js").Component, index: number, array: import("../api-types.js").Component[]) => unknown, thisArg?: any): boolean;
    some(predicate: (value: import("../api-types.js").Component, index: number, array: import("../api-types.js").Component[]) => unknown, thisArg?: any): boolean;
    forEach(callbackfn: (value: import("../api-types.js").Component, index: number, array: import("../api-types.js").Component[]) => void, thisArg?: any): void;
    map<U>(callbackfn: (value: import("../api-types.js").Component, index: number, array: import("../api-types.js").Component[]) => U, thisArg?: any): U[];
    filter<S extends import("../api-types.js").Component>(predicate: (value: import("../api-types.js").Component, index: number, array: import("../api-types.js").Component[]) => value is S, thisArg?: any): S[];
    filter(predicate: (value: import("../api-types.js").Component, index: number, array: import("../api-types.js").Component[]) => unknown, thisArg?: any): import("../api-types.js").Component[];
    reduce(callbackfn: (previousValue: import("../api-types.js").Component, currentValue: import("../api-types.js").Component, currentIndex: number, array: import("../api-types.js").Component[]) => import("../api-types.js").Component): import("../api-types.js").Component;
    reduce(callbackfn: (previousValue: import("../api-types.js").Component, currentValue: import("../api-types.js").Component, currentIndex: number, array: import("../api-types.js").Component[]) => import("../api-types.js").Component, initialValue: import("../api-types.js").Component): import("../api-types.js").Component;
    reduce<U>(callbackfn: (previousValue: U, currentValue: import("../api-types.js").Component, currentIndex: number, array: import("../api-types.js").Component[]) => U, initialValue: U): U;
    reduceRight(callbackfn: (previousValue: import("../api-types.js").Component, currentValue: import("../api-types.js").Component, currentIndex: number, array: import("../api-types.js").Component[]) => import("../api-types.js").Component): import("../api-types.js").Component;
    reduceRight(callbackfn: (previousValue: import("../api-types.js").Component, currentValue: import("../api-types.js").Component, currentIndex: number, array: import("../api-types.js").Component[]) => import("../api-types.js").Component, initialValue: import("../api-types.js").Component): import("../api-types.js").Component;
    reduceRight<U>(callbackfn: (previousValue: U, currentValue: import("../api-types.js").Component, currentIndex: number, array: import("../api-types.js").Component[]) => U, initialValue: U): U;
    find<S extends import("../api-types.js").Component>(predicate: (value: import("../api-types.js").Component, index: number, obj: import("../api-types.js").Component[]) => value is S, thisArg?: any): S;
    find(predicate: (value: import("../api-types.js").Component, index: number, obj: import("../api-types.js").Component[]) => unknown, thisArg?: any): import("../api-types.js").Component;
    findIndex(predicate: (value: import("../api-types.js").Component, index: number, obj: import("../api-types.js").Component[]) => unknown, thisArg?: any): number;
    fill(value: import("../api-types.js").Component, start?: number, end?: number): import("../api-types.js").Component[];
    copyWithin(target: number, start: number, end?: number): import("../api-types.js").Component[];
    entries(): ArrayIterator<[number, import("../api-types.js").Component]>;
    keys(): ArrayIterator<number>;
    values(): ArrayIterator<import("../api-types.js").Component>;
    includes(searchElement: import("../api-types.js").Component, fromIndex?: number): boolean;
    flatMap<U, This = undefined>(callback: (this: This, value: import("../api-types.js").Component, index: number, array: import("../api-types.js").Component[]) => U | readonly U[], thisArg?: This): U[];
    flat<A, D extends number = 1>(this: A, depth?: D): FlatArray<A, D>[];
    at(index: number): import("../api-types.js").Component;
    [Symbol.iterator](): ArrayIterator<import("../api-types.js").Component>;
    [Symbol.unscopables]: {
        [x: number]: boolean;
        length?: boolean;
        toString?: boolean;
        toLocaleString?: boolean;
        pop?: boolean;
        push?: boolean;
        concat?: boolean;
        join?: boolean;
        reverse?: boolean;
        shift?: boolean;
        slice?: boolean;
        sort?: boolean;
        splice?: boolean;
        unshift?: boolean;
        indexOf?: boolean;
        lastIndexOf?: boolean;
        every?: boolean;
        some?: boolean;
        forEach?: boolean;
        map?: boolean;
        filter?: boolean;
        reduce?: boolean;
        reduceRight?: boolean;
        find?: boolean;
        findIndex?: boolean;
        fill?: boolean;
        copyWithin?: boolean;
        entries?: boolean;
        keys?: boolean;
        values?: boolean;
        includes?: boolean;
        flatMap?: boolean;
        flat?: boolean;
        at?: boolean;
        [Symbol.iterator]?: boolean;
        readonly [Symbol.unscopables]?: boolean;
    };
} | {
    [key: string]: any;
    files?: import("discord.js").MessageCreateOptions["files"];
    allowedMentions?: import("discord.js").MessageMentionOptions;
};
export function toPlain(payload: any): any;
