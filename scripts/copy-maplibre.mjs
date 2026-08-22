// Keeps the vendored MapLibre worker in /public in sync with node_modules.
// Runs automatically before dev and build (see package.json).
import { copyFileSync, mkdirSync } from "node:fs";

const dest = new URL("../public/maplibre/", import.meta.url);
mkdirSync(dest, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(
    new URL(`../node_modules/maplibre-gl/dist/${f}`, import.meta.url),
    new URL(f, dest)
  );
}
