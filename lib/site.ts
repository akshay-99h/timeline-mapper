// Canonical site constants used by metadata, sitemap and JSON-LD.
// Set NEXT_PUBLIC_SITE_URL at build time when deploying under your domain.

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://roamline.app";
export const SITE_NAME = "Roamline";
export const SITE_TITLE = "Roamline · Turn your Google Timeline into a travel film";
export const SITE_DESCRIPTION =
  "Drop in your Google Maps Timeline, Apple Health or GPX export and get a cinematic animated travel video. 100% private: everything runs in your browser, nothing is uploaded.";
