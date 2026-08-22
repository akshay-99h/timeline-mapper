// Public health-analysis API: takes the export.xml (or export.zip / a file
// list from a folder pick) and returns an aggregated HealthSummary.

import type { HealthData, HealthProgress, HealthSummary } from "./types";

export { summarize, yearsIn } from "./summarize";
export type { HealthData, HealthSummary, HealthProgress };

/** Picks the analyzable file out of whatever was dropped/selected. */
export function findHealthFile(files: File[]): File | null {
  return (
    files.find((f) => /(^|\/)export\.xml$/i.test(f.webkitRelativePath || f.name)) ??
    files.find((f) => f.name.toLowerCase().endsWith(".zip")) ??
    files.find((f) => f.name.toLowerCase().endsWith(".xml")) ??
    null
  );
}

export function analyzeHealthFile(
  file: File,
  onProgress: (p: HealthProgress) => void
): Promise<HealthData> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./health.worker.ts", import.meta.url));
    } catch {
      reject(new Error("WORKER_UNAVAILABLE"));
      return;
    }
    worker.onmessage = (
      e: MessageEvent<{ ok?: boolean; data?: HealthData; error?: string; progress?: number }>
    ) => {
      if (typeof e.data.progress === "number") {
        onProgress({ fraction: e.data.progress });
        return;
      }
      worker.terminate();
      if (e.data.ok && e.data.data) resolve(e.data.data);
      else reject(new Error(e.data.error ?? "HEALTH_PARSE_FAILED"));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("WORKER_UNAVAILABLE"));
    };
    worker.postMessage({ file });
  });
}
