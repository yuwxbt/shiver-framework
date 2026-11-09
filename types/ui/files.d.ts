export function normalizeFileTypes(types: any, code: any, where: any): any[];
export function matchesFileTypes(attachment: any, types: any): any;
export function contentScanFlags(source: {
    flags?: number | {
        bitfield: number;
    } | null;
    data?: {
        flags?: number;
    };
    content_scan_metadata?: {
        flags: number;
    };
    contentScanMetadata?: {
        flags: number;
    };
}): {
    explicit: boolean;
    gore: boolean;
    selfHarm: boolean;
} | null;
