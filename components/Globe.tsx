"use client";

// Landing hero: a real MapLibre 3D globe, slowly turning, with the sample
// journey drawn as a glowing trail. This is the product itself acting as the
// hero visual. Motion honors prefers-reduced-motion (static globe).
// The basemap follows the app theme (dark-matter / positron) live.

import { useEffect, useRef, useState } from "react";
import { maplibregl } from "@/lib/maplibre";
import { generateSampleJourney } from "@/lib/sample";

const GLOBE_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json";
const GLOBE_LIGHT = "https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json";

function isDarkTheme(): boolean {
  const t = document.documentElement.dataset.theme;
  if (t === "dark") return true;
  if (t === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function Globe() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dark = isDarkTheme();

    const map = new maplibregl.Map({
      container,
      style: dark ? GLOBE_DARK : GLOBE_LIGHT,
      center: [77, 22],
      zoom: 1.6,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
    });

    let raf = 0;
    let disposed = false;

    // MapLibre can miss late layout changes in some dev setups; watch the
    // container ourselves so the canvas always matches it.
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container);

    // Re-applied after every style (re)load, including theme switches.
    map.on("style.load", () => {
      if (disposed) return;
      map.setProjection({ type: "globe" });

      // Nudge the palette toward the app's tones so the sphere reads as a
      // planet against the page. In dark-matter, water is the light tone.
      try {
        if (dark) {
          map.setPaintProperty("background", "background-color", "#101017");
          map.setPaintProperty("water", "fill-color", "#252e3a");
        }
      } catch {
        // layer ids vary between styles; the defaults are fine
      }

      // sample journey as a glowing line
      const sample = generateSampleJourney();
      const coords = sample.points
        .filter((_, i) => i % 2 === 0)
        .map((p) => [p.lng, p.lat] as [number, number]);
      map.addSource("sample-trail", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } },
      });
      map.addLayer({
        id: "sample-trail-glow",
        type: "line",
        source: "sample-trail",
        paint: { "line-color": "#ff4269", "line-width": 7, "line-opacity": 0.18, "line-blur": 4 },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      map.addLayer({
        id: "sample-trail-core",
        type: "line",
        source: "sample-trail",
        paint: { "line-color": "#ff5d7d", "line-width": 1.8, "line-opacity": 0.9 },
        layout: { "line-cap": "round", "line-join": "round" },
      });

      map.resize();
      setReady(true);
    });

    // follow theme switches live
    const mo = new MutationObserver(() => {
      const next = isDarkTheme();
      if (next !== dark) {
        dark = next;
        map.setStyle(dark ? GLOBE_DARK : GLOBE_LIGHT);
      }
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    if (!reduceMotion) {
      let last = performance.now();
      const spin = (now: number) => {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (map.isStyleLoaded()) {
          const c = map.getCenter();
          map.jumpTo({ center: [c.lng + dt * 2.5, c.lat] });
        }
        raf = requestAnimationFrame(spin);
      };
      raf = requestAnimationFrame(spin);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      map.remove();
    };
  }, []);

  return (
    <div className="globe-vignette absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* offset right on desktop so the globe sits beside the copy */}
      {/* positioning lives in a wrapper div: MapLibre's unlayered CSS would
          override Tailwind's layered position utilities on its own container */}
      <div className="absolute inset-y-[-6%] left-0 right-0 md:left-[30%] md:right-[-8%]">
        <div
          ref={containerRef}
          className={`transition-opacity duration-1000 ${ready ? "opacity-100" : "opacity-0"}`}
          style={{ position: "absolute", inset: 0 }}
        />
      </div>
    </div>
  );
}
