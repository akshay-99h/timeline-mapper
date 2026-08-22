// Basemap themes + trail palettes. All tile sources are keyless and free to
// use with attribution. These (and the style JSONs) are the ONLY network
// requests the app makes.

import type { StyleSpecification } from "maplibre-gl";

export interface MapTheme {
  id: string;
  /** i18n key for the display label */
  labelKey: string;
  /** style URL or inline style spec */
  style: string | StyleSpecification;
  /** burned into the video HUD */
  attribution: string;
  /** true when the basemap is dark (HUD scrims are tuned for either) */
  dark: boolean;
}

function rasterStyle(tiles: string[], attribution: string, maxzoom: number): StyleSpecification {
  return {
    version: 8,
    sources: {
      base: { type: "raster", tiles, tileSize: 256, maxzoom, attribution },
    },
    layers: [{ id: "base", type: "raster", source: "base" }],
  };
}

export const MAP_THEMES: MapTheme[] = [
  {
    id: "midnight",
    labelKey: "styleMidnight",
    style: "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json",
    attribution: "© OpenStreetMap contributors © CARTO",
    dark: true,
  },
  {
    id: "daylight",
    labelKey: "styleDaylight",
    style: "https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json",
    attribution: "© OpenStreetMap contributors © CARTO",
    dark: false,
  },
  {
    id: "voyager",
    labelKey: "styleVoyager",
    style: "https://basemaps.cartocdn.com/gl/voyager-nolabels-gl-style/style.json",
    attribution: "© OpenStreetMap contributors © CARTO",
    dark: false,
  },
  {
    id: "satellite",
    labelKey: "styleSatellite",
    style: rasterStyle(
      ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      "© Esri, Maxar, Earthstar Geographics",
      19
    ),
    attribution: "© Esri, Maxar, Earthstar Geographics",
    dark: true,
  },
  {
    id: "terrain",
    labelKey: "styleTerrain",
    style: rasterStyle(
      [
        "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
        "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
        "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
      ],
      "© OpenStreetMap contributors, SRTM · © OpenTopoMap (CC-BY-SA)",
      15
    ),
    attribution: "© OpenStreetMap contributors, SRTM · © OpenTopoMap",
    dark: false,
  },
];

export function mapTheme(id: string): MapTheme {
  return MAP_THEMES.find((t) => t.id === id) ?? MAP_THEMES[0];
}

// ---------------------------------------------------------------- trail

export interface TrailPalette {
  id: string;
  labelKey: string;
  /** "r, g, b" for canvas rgba() composition */
  rgb: string;
  /** swatch color for the UI */
  hex: string;
}

export const TRAIL_PALETTES: TrailPalette[] = [
  { id: "ember", labelKey: "trailEmber", rgb: "255, 66, 105", hex: "#ff4269" },
  { id: "aurora", labelKey: "trailAurora", rgb: "45, 212, 191", hex: "#2dd4bf" },
  { id: "voltage", labelKey: "trailVoltage", rgb: "96, 165, 250", hex: "#60a5fa" },
  { id: "sunbeam", labelKey: "trailSunbeam", rgb: "251, 191, 36", hex: "#fbbf24" },
  { id: "orchid", labelKey: "trailOrchid", rgb: "217, 121, 255", hex: "#d979ff" },
  { id: "ivory", labelKey: "trailIvory", rgb: "255, 255, 255", hex: "#ffffff" },
];

export function trailPalette(id: string): TrailPalette {
  return TRAIL_PALETTES.find((p) => p.id === id) ?? TRAIL_PALETTES[0];
}

// legacy exports still used by the landing globe
export const MAP_STYLE_DARK =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
