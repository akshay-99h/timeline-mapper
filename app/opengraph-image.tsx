// Open Graph card, generated statically at build time.
// Fonts come from the `geist` npm package (TTF, satori-compatible).

import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const alt = "Roamline · Turn your Google Timeline into a travel film";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#ff4269";

export default async function OgImage() {
  const fontDir = join(process.cwd(), "node_modules/geist/dist/fonts");
  const [bold, regular, mono] = await Promise.all([
    readFile(join(fontDir, "geist-sans/Geist-Bold.ttf")),
    readFile(join(fontDir, "geist-sans/Geist-Regular.ttf")),
    readFile(join(fontDir, "geist-mono/GeistMono-Medium.ttf")),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          background: "#0b0b10",
          padding: 72,
          position: "relative",
          fontFamily: "Geist",
        }}
      >
        {/* glowing journey trail */}
        <svg
          width="1200"
          height="630"
          viewBox="0 0 1200 630"
          style={{ position: "absolute", top: 0, left: 0 }}
        >
          <path
            d="M 120 480 C 300 420, 380 180, 560 220 C 700 252, 720 420, 860 360 C 960 318, 1000 180, 1090 140"
            fill="none"
            stroke={ACCENT}
            strokeWidth="26"
            strokeLinecap="round"
            opacity="0.14"
          />
          <path
            d="M 120 480 C 300 420, 380 180, 560 220 C 700 252, 720 420, 860 360 C 960 318, 1000 180, 1090 140"
            fill="none"
            stroke={ACCENT}
            strokeWidth="7"
            strokeLinecap="round"
          />
          <circle cx="1090" cy="140" r="26" fill={ACCENT} opacity="0.25" />
          <circle cx="1090" cy="140" r="14" fill={ACCENT} />
          <circle cx="1090" cy="140" r="6" fill="#ffffff" />
          <circle cx="120" cy="480" r="9" fill={ACCENT} opacity="0.7" />
        </svg>

        {/* wordmark */}
        <div
          style={{
            position: "absolute",
            top: 64,
            left: 72,
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div style={{ width: 18, height: 18, borderRadius: 99, background: ACCENT, display: "flex" }} />
          <div style={{ fontSize: 34, fontWeight: 700, color: "#f2f2f6", display: "flex" }}>
            Roamline
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            maxWidth: 780,
          }}
        >
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              color: "#f2f2f6",
              lineHeight: 1.08,
              letterSpacing: -2,
              display: "flex",
            }}
          >
            Turn your Google Timeline into a travel film
          </div>
          <div
            style={{
              marginTop: 26,
              fontSize: 26,
              color: "#a3a3b2",
              fontFamily: "Geist Mono",
              display: "flex",
            }}
          >
            100% in your browser · nothing is ever uploaded
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Geist", data: bold, weight: 700, style: "normal" },
        { name: "Geist", data: regular, weight: 400, style: "normal" },
        { name: "Geist Mono", data: mono, weight: 500, style: "normal" },
      ],
    }
  );
}
