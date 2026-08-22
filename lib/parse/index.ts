// Public parsing API: browser Files in, ParseResult out.
// Work happens in a web worker when available, main thread otherwise.

import { ingestFiles, type IngestFile } from "./ingest";
import type { ParseOptions, ParseResult } from "../types";

export async function parseTimelineFiles(
  files: File[],
  options: Partial<ParseOptions>
): Promise<ParseResult> {
  // Read every file up front (File objects can't cross into workers as
  // efficiently as transferable ArrayBuffers).
  const payloads: IngestFile[] = await Promise.all(
    files.map(async (f) => ({ name: f.name, data: await f.arrayBuffer() }))
  );

  if (typeof Worker !== "undefined") {
    try {
      return await parseInWorker(payloads, options);
    } catch (err) {
      if (err instanceof Error && err.message !== "WORKER_UNAVAILABLE") throw err;
      // fall through to main thread
    }
  }
  return ingestFiles(payloads, options);
}

function parseInWorker(
  payloads: IngestFile[],
  options: Partial<ParseOptions>
): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./parser.worker.ts", import.meta.url));
    } catch {
      reject(new Error("WORKER_UNAVAILABLE"));
      return;
    }
    worker.onmessage = (e: MessageEvent<{ ok: boolean; result?: ParseResult; error?: string }>) => {
      worker.terminate();
      if (e.data.ok && e.data.result) resolve(e.data.result);
      else reject(new Error(e.data.error ?? "PARSE_FAILED"));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("WORKER_UNAVAILABLE"));
    };
    const transfer = payloads
      .map((p) => p.data)
      .filter((d): d is ArrayBuffer => d instanceof ArrayBuffer);
    worker.postMessage({ files: payloads, options }, transfer);
  });
}
