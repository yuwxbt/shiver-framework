export function validateMessage({ content, embeds, components, v2 }: {
    content?: string | null;
    embeds?: object[];
    components?: object[];
    v2?: boolean;
}): void;
export function validateModal(modal: {
    custom_id: string;
    title: string;
    components: object[];
}): void;
