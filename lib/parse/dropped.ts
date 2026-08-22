// Drag-and-drop intake that understands FOLDERS.
//
// People extract their Apple Health / Takeout archives and drop the whole
// folder (e.g. apple_health_export/). Browsers expose dropped directories
// only through the webkitGetAsEntry API, so we walk them recursively and
// collect just the files worth parsing. Irrelevant giants like the 500 MB
// export.xml are filtered out by extension before anything is read.

const WANTED = /\.(json|gpx|kml|zip)$/i;
const MAX_DEPTH = 6;
const MAX_FILES = 4000;

export async function collectDroppedFiles(
  dt: DataTransfer,
  wanted: RegExp = WANTED
): Promise<File[]> {
  const out: File[] = [];

  // Prefer the entry API (understands directories); it must be called for
  // every item synchronously, before any await invalidates the DataTransfer.
  const entries: FileSystemEntry[] = [];
  const plainFiles: File[] = [];
  for (const item of Array.from(dt.items ?? [])) {
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
    else {
      const f = item.getAsFile?.();
      if (f) plainFiles.push(f);
    }
  }

  if (entries.length > 0) {
    for (const entry of entries) {
      await walk(entry, out, 0, wanted);
    }
  }
  if (out.length === 0 && plainFiles.length === 0) {
    // very old browsers: fall back to the flat file list
    plainFiles.push(...Array.from(dt.files ?? []));
  }

  for (const f of plainFiles) {
    if (wanted.test(f.name) || plainFilesLookRaw(plainFiles, wanted)) out.push(f);
  }
  return out;
}

/** When someone drops files without helpful extensions, let them through and
 *  let the parser decide (it sniffs content anyway). */
function plainFilesLookRaw(files: File[], wanted: RegExp): boolean {
  return files.every((f) => !wanted.test(f.name));
}

async function walk(
  entry: FileSystemEntry,
  out: File[],
  depth: number,
  wanted: RegExp
): Promise<void> {
  if (out.length >= MAX_FILES || depth > MAX_DEPTH) return;
  if (entry.name.startsWith(".") || entry.name === "__MACOSX") return;

  if (entry.isFile) {
    if (!wanted.test(entry.name)) return;
    const file = await new Promise<File | null>((resolve) =>
      (entry as FileSystemFileEntry).file(resolve, () => resolve(null))
    );
    if (file) out.push(file);
    return;
  }

  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries returns batches (Chrome caps them at 100): loop until empty
    // or a folder with >100 workout routes silently loses files.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve) =>
        reader.readEntries(resolve, () => resolve([]))
      );
      if (batch.length === 0) break;
      for (const child of batch) {
        await walk(child, out, depth + 1, wanted);
      }
    }
  }
}
