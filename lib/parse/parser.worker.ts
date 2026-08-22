// Web worker: parses large Timeline exports, ZIPs and GPX/KML tracks off
// the main thread. Receives { files, options }, replies { ok, result | error }.

import { ingestFiles, type IngestFile } from "./ingest";
import type { ParseOptions } from "../types";

self.onmessage = async (
  e: MessageEvent<{ files: IngestFile[]; options: Partial<ParseOptions> }>
) => {
  try {
    const result = await ingestFiles(e.data.files, e.data.options);
    (self as unknown as Worker).postMessage({ ok: true, result });
  } catch (err) {
    (self as unknown as Worker).postMessage({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
