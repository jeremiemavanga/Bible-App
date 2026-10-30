/** Store bytes rather than file-backed Blobs: the latter are not portable across IndexedDB engines. */
export type StoredMedia = { bytes: Uint8Array<ArrayBuffer>; type: string };
export type MediaData = Blob | StoredMedia;
export async function packMedia(file: Blob): Promise<StoredMedia> {
  return { bytes: new Uint8Array(await file.arrayBuffer()), type: file.type };
}
export function mediaBlob(media: MediaData): Blob {
  return media instanceof Blob
    ? media
    : new Blob([media.bytes], { type: media.type });
}
export function isStoredMedia(value: unknown): value is StoredMedia {
  const m = value as StoredMedia;
  return !!m && m.bytes instanceof Uint8Array && typeof m.type === "string";
}
