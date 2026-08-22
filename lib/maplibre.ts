// Central MapLibre import. MapLibre v6 loads its tile-parsing worker as a
// separate ES module; bundler dev servers can mangle that URL, so we vendor
// the worker (+ its shared chunk) into /public/maplibre and point MapLibre
// at it explicitly. `scripts/copy-maplibre.mjs` keeps the copy in sync.

import * as maplibregl from "maplibre-gl";

if (typeof window !== "undefined") {
  maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
}

export { maplibregl };
