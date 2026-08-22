# Roamline

**Your year, drawn in light.** Roamline turns a Google Maps Timeline export into a
cinematic, shareable travel video (MP4), rendered entirely in your browser.
No backend, no uploads: your location history never leaves your device.

![status](https://img.shields.io/badge/frontend-100%25%20client--side-ff4269)

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

Production:

```bash
npm run build      # prebuild copies the MapLibre worker + regenerates icons
npm start
```

Every route is statically prerendered; there is no server code. The app can be
hosted on any static host or the built-in Next server.

## Using it

1. **Upload**: drop any mix of location data, multiple files at once:
   - Google Timeline exports: `Timeline.json` (Android), `location-history.json`
     (iPhone), classic Takeout monthly files, `Records.json`
   - **Whole ZIP archives**: a Google Takeout download or an Apple Health
     `export.zip` can be dropped as-is; relevant entries (.json/.gpx/.kml) are
     found automatically (that's how Apple Watch workout routes come in)
   - **GPX** tracks (Strava, Garmin, sports watches) and **KML** (`gx:Track`)
   Parsing runs in a web worker; you get a summary (points kept, date range,
   distance, filtered count). Raw GPS records are opt-in with an accuracy
   cutoff, because they're noisy.
2. **Configure**: date range (full year / months / custom), journey name and a
   title template (`{year}`, `{name}`), duration (15-300 s), camera mode
   (Fixed / Steady / Dynamic), long-trip compression, output format
   (square 480/720/1080, portrait, landscape), **map theme** (Midnight /
   Daylight / Voyager / Satellite / Terrain), **trail color** (six palettes),
   **stop-date labels** (each dwell of ~a day or more gets a pill with the
   arrival date), and rectangular privacy zones drawn with shift-drag on a
   live map.
3. **Preview**: a real-time animated preview using the *exact* renderer and
   camera code the exporter uses. Space toggles play; G jumps to generate.
4. **Generate**: client-side MP4 encoding with progress + ETA + cancel, then
   play, download, share (Web Share API), and save a **designer route card**:
   a 1080x1350 share image with the full lit route, stop dates, title and
   stats (great for single Strava/Apple Watch activities). Videos are kept in
   a local IndexedDB library ("My videos") with thumbnails.

No data? Hit **Watch a sample journey** for a fictional year out of
Greater Noida West: trips across India, Dubai and Southeast Asia.

### Health report (`/health`)

Beyond the map, Roamline reads the **entire Apple Health `export.xml`**
(300-800 MB files stream through a worker in a couple of seconds, never held
in memory) and produces a local health dashboard: steps, distance, active
energy, workouts by type, resting/average heart rate, flights climbed, best
day, and a monthly steps chart. Overlapping iPhone+Watch records are deduped
per day by dominant source, approximating the Health app's own numbers.
Drop the `export.zip`, the bare `export.xml`, or the extracted folder.

## Architecture

```
lib/
  parse/parser.ts    all Timeline formats -> TimelinePoint[]   (worker-hosted)
  parse/ingest.ts    multi-file / ZIP / GPX / KML merge pipeline
  parse/zip.ts       dependency-free ZIP reader (DecompressionStream)
  parse/tracks.ts    GPX + KML parsers (regex-based, worker-safe)
  journey.ts         time compression + great-circle densify -> TrackSample[]
  camera.ts          precomputed, box-blurred camera keyframes
  renderer.ts        canvas trail/marker/HUD renderer (shared preview+export)
  video/exporter.ts  WebCodecs+mp4-muxer MP4 (MediaRecorder WebM fallback)
  db.ts              IndexedDB (videos library, settings)
  store.ts           Zustand app state, persisted settings
  i18n.ts            EN / KO / JA / ES dictionaries
  maplibre.ts        MapLibre entry; pins the worker URL (see below)
  health/parser.ts   streaming export.xml scanner -> HealthSummary
  parse/dropped.ts   folder-drop traversal (webkitGetAsEntry)
```

### The parser (`lib/parse/parser.ts`)

Google has shipped four incompatible export shapes; the parser normalizes all
of them:

| Shape | Source |
|---|---|
| top-level array of segments (`timelinePath` / `visit` / `activity`, `geo:` strings) | 2024+ Android/iOS phone export |
| `{ semanticSegments: [...] }` with `{ latLng: "12.3°, 45.6°" }` objects | Takeout `location-history.json` |
| `{ timelineObjects: [...] }` with E7 integers, `waypointPath`, `simplifiedRawPath` | classic Takeout monthly files |
| `{ locations: [...] }` raw fixes with `accuracy` | `Records.json` (opt-in) |

The pipeline then sorts chronologically, dedupes, and applies a conservative
single-point spike filter (a fix implying > 1100 km/h that the *next* fix
contradicts is dropped; sustained jumps like flights are kept). Longitude
handling is date-line safe throughout (unwrapped bounds, shortest-arc lerp,
true spherical slerp for long segments).

### Timing model (`lib/journey.ts`)

Each segment between fixes gets an animation-clock weight of
`distance^alpha`; compression picks alpha (Off 1.0 → Strong 0.5). This is why
a 9,000 km flight doesn't eat the whole video while your bike rides vanish;
real timestamps ride along so the HUD date stays truthful. Segments longer
than 120 km are densified along the great circle so planes fly in arcs.

### Camera (`lib/camera.ts`)

Instead of chasing the marker live (jittery on dense city data), camera
keyframes are precomputed at 10 Hz: local zoom is fitted to a sliding window
of upcoming track, then position/zoom tracks are smoothed with repeated box
blurs (heavier for Steady, lighter + pitch/bearing drift for Dynamic). The
final ~2 s ease out to a full-journey overview and hold.

### Video export (`lib/video/exporter.ts`)

A hidden MapLibre map is created at the exact target resolution
(`preserveDrawingBuffer`), stepped frame-by-frame on the animation clock
(waiting for tiles per frame), composited with the trail + HUD onto a canvas,
and fed to a `VideoEncoder` (H.264, hardware-accelerated where available)
muxed by [mp4-muxer]. Frame-by-frame stepping means output timing is exact
regardless of machine speed. Browsers without WebCodecs get a paced
MediaRecorder WebM fallback. A `setInterval`-driven `map.redraw()` keeps the
export alive even when the tab is backgrounded and rAF is throttled.

### MapLibre worker note

MapLibre GL v6 loads its tile parser as a separate ES-module worker. Some dev
servers mangle that URL, so `scripts/copy-maplibre.mjs` vendors
`maplibre-gl-worker.mjs` (+ shared chunk) into `public/maplibre/` and
`lib/maplibre.ts` pins it with `setWorkerUrl`. The copy runs automatically via
`predev`/`prebuild`.

## Privacy

- The **only** network requests are the basemap tiles: CARTO vector styles
  (© OpenStreetMap contributors, © CARTO), Esri World Imagery for the
  Satellite theme, OpenTopoMap for the Terrain theme. The matching
  attribution is rendered in the app and burned into exported videos.
- Timeline files are read with the File API and never leave the page.
- Videos and settings persist in IndexedDB; deleting them there is final.
- Privacy zones strip points inside user-drawn rectangles before any
  rendering or export.

## SEO

Full metadata (`app/layout.tsx` + per-route layouts), Open Graph / Twitter
cards generated at build time from `app/opengraph-image.tsx` (satori +
vendored Geist TTFs from the `geist` package), a real `favicon.ico` (PNG-in-ICO,
generated by `scripts/gen-icons.mjs`), `robots.txt`, `sitemap.xml`, and
JSON-LD (`WebApplication`). Set `NEXT_PUBLIC_SITE_URL` when deploying to your
domain (defaults to `https://roamline.app`).

## PWA

`manifest.webmanifest` + `public/sw.js` (stale-while-revalidate app shell,
never intercepts tile requests) make the shell installable and offline-ready.
Icons are generated dependency-free by `scripts/gen-icons.mjs` (hand-rolled
PNG encoder over node's zlib).

## Stack

Next.js 16 (App Router, all client components where it matters) · TypeScript ·
Tailwind v4 · Zustand · MapLibre GL v6 (globe projection on the landing hero) ·
Motion · mp4-muxer · Phosphor icons · Geist / Geist Mono.

## Browser support

- **Best**: Chrome/Edge 102+, Safari 16.4+ (WebCodecs H.264 → real MP4)
- **Fallback**: any modern browser with MediaRecorder → WebM
- iPhone Safari: supported, including Web Share of the video file.

[mp4-muxer]: https://github.com/Vanilagy/mp4-muxer
