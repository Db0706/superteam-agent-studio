/**
 * Lists a ZIP's entries from its central directory without decompressing
 * anything. Browser-safe; used to show what a downloaded archive contains.
 */
export function listZipEntries(bytes: Uint8Array): { path: string; bytes: number }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("Not a ZIP archive");
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const out: { path: string; bytes: number }[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error("Corrupt ZIP central directory");
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    out.push({ path: decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen)), bytes: size });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
