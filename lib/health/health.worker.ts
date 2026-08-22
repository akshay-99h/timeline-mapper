// Worker: streams export.xml (bare or inside export.zip) through the
// HealthScanner without ever holding the whole document in memory.

import { HealthScanner } from "./parser";
import { isZip, readZip } from "../parse/zip";

interface Msg {
  /** the File is transferred; Files are cheap to structured-clone (no copy) */
  file: File;
}

self.onmessage = async (e: MessageEvent<Msg>) => {
  const post = (m: unknown) => (self as unknown as Worker).postMessage(m);
  try {
    const file = e.data.file;
    const scanner = new HealthScanner();
    const decoder = new TextDecoder();

    if (file.name.toLowerCase().endsWith(".zip") || isZip(await file.slice(0, 4).arrayBuffer())) {
      // find export.xml inside the archive
      const buf = await file.arrayBuffer();
      const entries = readZip(buf);
      const entry = entries.find((en) => /(^|\/)export\.xml$/i.test(en.name));
      if (!entry) throw new Error("NO_EXPORT_XML");
      const bytes = await entry.read();
      const CHUNK = 8 * 1024 * 1024;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        scanner.push(decoder.decode(bytes.subarray(i, i + CHUNK), { stream: true }));
        post({ progress: i / bytes.length });
      }
      scanner.push(decoder.decode());
    } else {
      // stream the file directly (never fully in memory)
      const reader = file.stream().getReader();
      let done = 0;
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        done += value.byteLength;
        scanner.push(decoder.decode(value, { stream: true }));
        post({ progress: done / file.size });
      }
      scanner.push(decoder.decode());
    }

    const summary = scanner.finish();
    if (!summary) throw new Error("NO_HEALTH_DATA");
    post({ ok: true, summary });
  } catch (err) {
    post({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
