// Minimal ZIP reader, dependency-free and worker-safe.
//
// Enough to open Google Takeout and Apple Health export archives in the
// browser: central-directory walk + stored/deflate entries via the native
// DecompressionStream. No zip64 (Takeout splits archives well below 4 GB).

export interface ZipEntry {
  name: string;
  /** uncompressed size in bytes */
  size: number;
  read: () => Promise<Uint8Array>;
}

const EOCD_SIG = 0x06054b50;
const CDIR_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

export function isZip(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 4) return false;
  const v = new DataView(buf);
  return v.getUint32(0, true) === 0x04034b50 || v.getUint32(0, true) === 0x06054b50;
}

export function readZip(buf: ArrayBuffer): ZipEntry[] {
  const view = new DataView(buf);

  // find End Of Central Directory (scan back through max comment length)
  let eocd = -1;
  const min = Math.max(0, buf.byteLength - 22 - 65535);
  for (let i = buf.byteLength - 22; i >= min; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("ZIP_NO_EOCD");

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  if (offset === 0xffffffff) throw new Error("ZIP64_UNSUPPORTED");

  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];

  for (let n = 0; n < count; n++) {
    if (view.getUint32(offset, true) !== CDIR_SIG) break;
    const method = view.getUint16(offset + 10, true);
    const compSize = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(new Uint8Array(buf, offset + 46, nameLen));
    offset += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/")) continue; // directory

    entries.push({
      name,
      size,
      read: async () => {
        if (view.getUint32(localOffset, true) !== LOCAL_SIG) throw new Error("ZIP_BAD_LOCAL_HEADER");
        const lNameLen = view.getUint16(localOffset + 26, true);
        const lExtraLen = view.getUint16(localOffset + 28, true);
        const start = localOffset + 30 + lNameLen + lExtraLen;
        const raw = new Uint8Array(buf, start, compSize);
        if (method === 0) return raw;
        if (method === 8) return inflateRaw(raw);
        throw new Error(`ZIP_METHOD_${method}_UNSUPPORTED`);
      },
    });
  }
  return entries;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
  const out = await new Response(stream).arrayBuffer();
  return new Uint8Array(out);
}
