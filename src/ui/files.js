import { ShiverError } from '../errors.js';

const fileGroups = new Set(['image', 'video', 'audio']);

export function normalizeFileTypes(types, code, where) {
  if (types === undefined) return undefined;
  if (!Array.isArray(types) || types.length > 10 || types.some((type) =>
    typeof type !== 'string' || (!fileGroups.has(type.toLowerCase()) && !/^\.[a-z0-9]+$/i.test(type)))) {
    throw new ShiverError(code, `${where}: use at most 10 file types from image, video, audio or extensions such as ".pdf".`);
  }
  return [...new Set(types.map((type) => type.toLowerCase()))];
}

export function matchesFileTypes(attachment, types) {
  if (!types?.length) return true;
  const filename = attachment.name?.toLowerCase();
  const mediaType = attachment.contentType?.toLowerCase().split('/')[0];
  return types.some((type) => type.startsWith('.') ? filename?.endsWith(type) : mediaType === type);
}

export function contentScanFlags(source) {
  const metadata = source?.content_scan_metadata ?? source?.contentScanMetadata;
  const input = source?.flags ?? source?.data?.flags;
  const flags = metadata?.flags ?? (typeof input === 'object' ? input?.bitfield : input);
  if (typeof flags !== 'number') return null;
  const [explicit, gore, selfHarm] = metadata ? [1, 2, 4] : [16, 64, 128];
  return { explicit: Boolean(flags & explicit), gore: Boolean(flags & gore), selfHarm: Boolean(flags & selfHarm) };
}
