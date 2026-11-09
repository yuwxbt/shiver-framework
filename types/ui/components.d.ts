export function withComponentId<T extends Component>(component: T, id: number): T & {
    id: number;
};
export function children(list: any): any[];
export function autoRows(list: any): any[];
export function emoji(value: any): any;
export function text(content: string | number): Component;
export function container(...args: Array<ComponentOptions | Child>): Component;
export function section(...args: Array<ComponentOptions | Child>): Component;
export function thumbnail(url: string | {
    url: string;
}, o?: ComponentOptions): Component;
export function gallery(...items: Array<string | {
    url?: string;
    media?: {
        url: string;
    };
    description?: string;
    alt?: string;
    spoiler?: boolean;
} | Array<string | object>>): Component;
export function file(url: string | {
    url: string;
}, o?: ComponentOptions): Component;
export function separator(o?: ComponentOptions): Component;
export function row(...items: Child[]): Component;
export function button(o?: ComponentOptions): Component;
export function select(o?: ComponentOptions): Component;
export function label(o: {
    label: string;
    description?: string;
}, component: Component): Component;
export function textInput(o?: ComponentOptions): Component;
export function fileUpload(o?: ComponentOptions): Component;
export function radioGroup(o?: ComponentOptions): Component;
export function checkboxGroup(o?: ComponentOptions): Component;
export function checkbox(o?: ComponentOptions): Component;
export function modal(...args: Array<ComponentOptions | Child>): import("../api-types.js").Modal;
export const ComponentType: Readonly<{
    ActionRow: 1;
    Button: 2;
    StringSelect: 3;
    TextInput: 4;
    UserSelect: 5;
    RoleSelect: 6;
    MentionableSelect: 7;
    ChannelSelect: 8;
    Section: 9;
    TextDisplay: 10;
    Thumbnail: 11;
    MediaGallery: 12;
    File: 13;
    Separator: 14;
    Container: 17;
    Label: 18;
    FileUpload: 19;
    RadioGroup: 21;
    CheckboxGroup: 22;
    Checkbox: 23;
}>;
export const userSelect: (o?: ComponentOptions) => Component;
export const roleSelect: (o?: ComponentOptions) => Component;
export const mentionableSelect: (o?: ComponentOptions) => Component;
export const channelSelect: (o?: ComponentOptions) => Component;
export type Component = import("../api-types.js").Component;
export type Child = string | Component | null | false | undefined | Child[];
export type ComponentOptions = {
    id?: string;
    label?: string;
    title?: string;
    description?: string;
    alt?: string;
    url?: string;
    sku?: string;
    emoji?: string | {
        id?: string;
        name?: string;
        animated?: boolean;
    };
    style?: string | number;
    disabled?: boolean;
    required?: boolean;
    min?: number;
    max?: number;
    placeholder?: string;
    value?: string;
    accent?: string | number;
    color?: string | number;
    spoiler?: boolean;
    divider?: boolean;
    spacing?: "small" | "large" | number;
    accessory?: Component | string;
    raw?: Record<string, unknown>;
    options?: Array<string | {
        label: string;
        value?: string;
        description?: string;
        emoji?: string | object;
        default?: boolean;
    }>;
    defaults?: Array<string | {
        id: string;
        type: "user" | "role" | "channel";
    }>;
    channelTypes?: number[];
    types?: string[];
    default?: boolean;
};
