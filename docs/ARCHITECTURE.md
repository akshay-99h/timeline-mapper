# Roamline architecture

Roamline is a fully client-side Next.js app with two products in one shell:

1. **Studio** - turns location history (Google Timeline, GPX, KML) into an
   animated MP4 travel film.
2. **Health** - turns an Apple Health `export.xml` into a local analytics
   dashboard.

There is no backend. Every route is statically prerendered; the only network
requests at runtime are basemap tiles.

```
                      ┌─────────────────────────────────────────────┐
 files / folders ───▶ │ lib/parse (worker)                          │
  Timeline.json       │  zip.ts ── unzip (DecompressionStream)      │
  location-history    │  parser.ts ─ 4 Google Timeline shapes       │
  Takeout .zip        │  tracks.ts ─ GPX / KML                      │
  Health export.zip   │  ingest.ts ─ merge → dedupe → outliers      │
  *.gpx / *.kml       └──────────────┬──────────────────────────────┘
                                     │ TimelinePoint[]
                                     ▼
                      ┌─────────────────────────────────────────────┐
                      │ lib/journey.ts                              │
                      │  privacy zones → time-warp (distance^α)     │
                      │  great-circle densify → TrackSample[]       │
                      └──────────────┬──────────────────────────────┘
                                     │
                     ┌───────────────┴───────────────┐
                     ▼                               ▼
        ┌─────────────────────────┐     ┌──────────────────────────┐
        │ lib/camera.ts           │     │ lib/renderer.ts          │
        │ keyframes @10Hz,        │     │ trail glow, marker, HUD, │
        │ box-blur smoothing,     │     │ stop-date labels,        │
        │ ending zoom-out         │     │ route-card poster mode   │
        └───────────┬─────────────┘     └───────────┬──────────────┘
                    └───────────────┬───────────────┘
                                    ▼
                   ┌────────────────────────────────────┐
                   │ preview (rAF loop)                 │
                   │ lib/video/exporter.ts (WebCodecs   │
                   │  H.264 + mp4-muxer / MediaRecorder)│
                   └────────────────────────────────────┘
```

## Module reference

### `lib/parse/` - ingestion

| File | Responsibility |
|---|---|
| `parser.ts` | The four Google Timeline JSON shapes → `TimelinePoint[]`. Split into `collectTimeline` (per source) and `finalizeParse` (sort, dedupe, speed-spike filter, summary) so multiple sources can merge before cleanup. |
| `zip.ts` | Dependency-free ZIP reader: EOCD scan → central directory walk → stored/deflate entries via native `DecompressionStream("deflate-raw")`. No zip64. |
| `tracks.ts` | GPX `<trkpt>` and KML `gx:Track` parsers. Regex-based on purpose: `DOMParser` doesn't exist in workers and both formats are shallow. Untimed points are skipped (they can't be animated). |
| `ingest.ts` | Fans any mix of files/archives into one point cloud: ZIPs are opened and filtered to `.json/.gpx/.kml` entries (skipping `__MACOSX`, dotfiles, giant blobs), then everything is finalized in a single pass so cross-file dedup works. |
| `dropped.ts` | Folder drag-and-drop: `webkitGetAsEntry` recursion with the mandatory `readEntries` batching loop (Chrome caps batches at 100 - Apple Health folders have 100+ workout routes). Extension-filters up front so a 500 MB `export.xml` is never read by the journey path. |
| `parser.worker.ts` / `index.ts` | Worker hosting with main-thread fallback; ArrayBuffers are transferred, not copied. |

Coordinate formats handled by `parseCoord`: `geo:lat,lng` strings,
`"lat, lng"` with degree marks, `{latLng}`, `{latitudeE7/longitudeE7}`,
`{latE7/lngE7}`, `{lat,lng}`, `{latitude,longitude}`. `(0,0)` is treated as
the no-fix sentinel. Timestamps: ISO strings and epoch seconds/millis/micros
(`parseTime` sniffs magnitude).

Outlier policy (`finalizeParse`): a fix implying > 1100 km/h from its
predecessor is dropped only when the *next* fix agrees with the predecessor
(single-point glitch); sustained jumps (real flights, data gaps) are kept.

### `lib/journey.ts` - the timing model

Animation time is allocated per segment as `weight = distance^alpha`:

| Compression | alpha |
|---|---|
| Off | 1.0 |
| Gentle | 0.85 |
| Balanced | 0.7 |
| Strong | 0.5 |

With alpha < 1, a 9,000 km flight stops dominating the video while short
local trips stay visible. Real timestamps ride along on every sample so the
HUD date is always truthful. Segments > 120 km are densified along the great
circle (spherical slerp), which is what makes flights arc instead of cutting
straight lines through the projection. All longitude math is date-line safe
(shortest-arc lerp, unwrapped bounds).

The clock reserves ~0.6 s intro hold and ~1.5-2 s ending (zoom-out + hold).

### `lib/camera.ts`

Live marker-chasing jitters on dense city data, so the camera is precomputed:
keyframes are sampled every 100 ms, local zoom is fitted to a sliding window
of surrounding track (±6 s steady / ±3.5 s dynamic), then position and zoom
arrays are smoothed with repeated box-blur passes. Longitude is unwrapped
before smoothing so paths crossing the antimeridian don't average across the
world. `cameraAt` interpolates keyframes and blends into the overview camera
during the ending.

### `lib/renderer.ts`

One renderer serves the preview, the video export, and the route card, so
what you see is exactly what renders. It draws on a 2D canvas over (or
composited with) the MapLibre canvas:

- Trail: journey decimated to ≤ 2,600 draw samples, re-projected every frame
  (the camera moves), stroked twice (wide soft glow + bright core) in ~24
  chunks with age-based alpha so old path segments fade to a floor.
- Marker: pulsing ring + glow + white-core dot.
- Stop-date labels: dwells of ≥ 20 h within a 14 km radius, deduped within
  40 km (repeat home visits merge), capped at 24, drawn as pills with greedy
  overlap avoidance once the marker arrives.
- HUD: title, locale-formatted date, distance counter, progress hairline and
  the tile-provider attribution (legally required - also burned into MP4s).
- `renderPoster()`: the "route card" mode - full-bright trail, start/end
  markers, wordmark, big title, stats row. Used for the 1080×1350 share PNG.

### `lib/video/exporter.ts`

Preferred path: a hidden MapLibre map at exactly the target resolution
(`pixelRatio: 1`, `preserveDrawingBuffer` via `canvasContextAttributes`),
stepped frame-by-frame on the animation clock. Each frame: `jumpTo` the
camera, wait for tiles (bounded), composite map + overlay, feed a
`VideoFrame` to `VideoEncoder` (H.264, hardware-accelerated), mux with
mp4-muxer (`fastStart: "in-memory"`). Deterministic stepping means output
timing is exact regardless of machine speed. Encoder backpressure is bounded
via `encodeQueueSize`.

Fallback: MediaRecorder on `canvas.captureStream()` paced to the wall clock
(WebM, or MP4 where supported).

A `setInterval`-driven `map.redraw()` keeps frames flowing when the tab is
backgrounded and the browser throttles `requestAnimationFrame`.

### `lib/health/` - the health pipeline

`export.xml` is 300-800 MB, so it is **streamed**, never held as one string:

- `parser.ts` (`HealthScanner`): consumes decoded text chunks with a carry
  buffer for tags split across chunk boundaries. Extracts `<Record>`,
  `<Workout>` and `<WorkoutStatistics>` open tags with one regex; a type
  whitelist is checked with `indexOf` before any attribute parsing so
  millions of irrelevant records cost almost nothing. Both workout stat
  encodings are handled (legacy attributes and iOS 16+ child
  `WorkoutStatistics`, associated to the last-seen workout - exact because
  document order nests them). Scans ~500 MB in ~2 s.
- **Source dedup**: iPhone and Watch both write overlapping step/distance/
  energy records; naive summation overcounts 10-30%. Cumulative metrics are
  aggregated per `(day, sourceName)` and the dominant source wins per day,
  approximating the Health app's own numbers.
- `summarize.ts`: pure `(days, workouts, dateRange?) → HealthSummary`. The
  scanner returns the raw per-day dataset; the dashboard's date filter
  (year chips + custom range) recomputes summaries instantly client-side
  without re-reading the export.
- `health.worker.ts`: streams a bare `.xml` via `file.stream()`, or finds
  `export.xml` inside `export.zip` via the shared zip reader.

### State, storage, i18n

- `lib/store.ts`: one Zustand store; a `PersistedSettings` subset syncs to
  IndexedDB on every change. Wizard/data state is session-only.
- `lib/db.ts`: minimal promise wrapper over IndexedDB, two object stores
  (`videos` with Blob + thumbnail, `settings`).
- `lib/i18n.ts`: flat dictionaries (EN/KO/JA/ES) with `{placeholder}`
  interpolation and automatic English fallback per key.

## Hard-won gotchas (read before touching map code)

1. **CSS cascade layers vs MapLibre.** Tailwind v4 utilities live in
   `@layer`; MapLibre's stylesheet is unlayered, and unlayered CSS beats
   layered. `.maplibregl-map { position: relative }` therefore overrides
   Tailwind's `absolute` on the map container, collapsing it to height 0
   (symptom: black basemap, working overlay). **Map containers must use
   inline styles for position/size.**
2. **MapLibre v6 worker.** The tile parser is a separate ES-module worker
   whose URL some dev servers mangle. `scripts/copy-maplibre.mjs` vendors it
   into `public/maplibre/` (gitignored, regenerated by `predev`/`prebuild`)
   and `lib/maplibre.ts` pins it via `setWorkerUrl`. Always import MapLibre
   through `lib/maplibre.ts`.
3. **`preserveDrawingBuffer`** moved into `canvasContextAttributes` in
   MapLibre v5+.
4. **rAF throttling.** Hidden tabs throttle `requestAnimationFrame`, which
   stalls MapLibre's render loop. Maps that must keep painting (export,
   preview) run a `map.redraw()` interval; containers that mount
   mid-transition also get an explicit `ResizeObserver` + `resize()`.
5. **`readEntries` batching.** Directory readers return ≤ 100 entries per
   call; loop until empty or folder drops silently lose files.

## Build-time assets

- `scripts/gen-icons.mjs`: draws the brand mark into raw RGBA and encodes
  PNG (zlib + hand-rolled chunks/CRC) and ICO (PNG-in-ICO) - zero image
  dependencies. Emits `public/icon-*.png` and `app/favicon.ico`.
- `app/opengraph-image.tsx` / `twitter-image.tsx`: satori-rendered 1200×630
  cards using TTFs from the `geist` npm package, statically generated at
  build.
- `app/robots.ts`, `app/sitemap.ts`, JSON-LD in `app/layout.tsx`; per-route
  `layout.tsx` files carry route metadata (pages are client components and
  can't export `metadata` themselves).

## Testing approach

There is no test framework wired in; validation was done with disposable
node harnesses compiling the pure modules (`tsc --module commonjs` into a
scratch dir) and running fixture suites:

- parser: 9 fixtures across all four Google shapes, date-line crossing,
  spike rejection, dedup, raw-records opt-in.
- ingestion: GPX/KML/ZIP (Takeout- and Apple-Health-shaped), multi-source
  chronological merge, garbage rejection.
- health: full real-world 495 MB `export.xml` (2 s scan) plus date-filtered
  summaries.

The modules under `lib/` are worker-safe and DOM-free precisely so they can
be tested this way; if you add a test runner, point it at `lib/`.
