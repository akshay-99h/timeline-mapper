"use client";

// Global app state (Zustand). Persistent settings sync to IndexedDB.

import { create } from "zustand";
import { getSetting, setSetting } from "./db";
import type { Lang } from "./i18n";
import { translate } from "./i18n";
import type {
  JourneyConfig,
  ParseOptions,
  ParseResult,
  PrivacyZone,
} from "./types";
import { DEFAULT_PARSE_OPTIONS } from "./parse/parser";

export type Theme = "system" | "dark" | "light";
export type WizardStep = 0 | 1 | 2 | 3;

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "success" | "error";
}

interface PersistedSettings {
  lang: Lang;
  theme: Theme;
  titleTemplate: string;
  lastName: string;
  duration: number;
  camera: JourneyConfig["camera"];
  compression: JourneyConfig["compression"];
  formatId: string;
  mapThemeId: string;
  trailId: string;
  showStopDates: boolean;
  privacyZones: PrivacyZone[];
  onboarded: boolean;
}

const DEFAULT_SETTINGS: PersistedSettings = {
  lang: "en",
  theme: "system",
  titleTemplate: "{name} · {year}",
  lastName: "My journeys",
  duration: 45,
  camera: "steady",
  compression: "balanced",
  formatId: "square-1080",
  mapThemeId: "midnight",
  trailId: "ember",
  showStopDates: true,
  privacyZones: [],
  onboarded: false,
};

interface AppState extends PersistedSettings {
  hydrated: boolean;
  step: WizardStep;
  data: ParseResult | null;
  fileName: string | null;
  parseOptions: ParseOptions;
  rangeStart: number;
  rangeEnd: number;
  journeyName: string;
  toasts: Toast[];

  t: (key: string, vars?: Record<string, string | number>) => string;
  hydrate: () => Promise<void>;
  setSettings: (patch: Partial<PersistedSettings>) => void;
  setStep: (s: WizardStep) => void;
  setData: (r: ParseResult | null, fileName: string | null) => void;
  setParseOptions: (o: Partial<ParseOptions>) => void;
  setRange: (start: number, end: number) => void;
  setJourneyName: (n: string) => void;
  addZone: (z: PrivacyZone) => void;
  removeZone: (id: string) => void;
  toast: (text: string, kind?: Toast["kind"]) => void;
  dismissToast: (id: number) => void;
  currentConfig: () => JourneyConfig;
  resolvedTitle: () => string;
}

let toastSeq = 1;
const PERSIST_KEYS: (keyof PersistedSettings)[] = [
  "lang", "theme", "titleTemplate", "lastName", "duration",
  "camera", "compression", "formatId", "mapThemeId", "trailId",
  "showStopDates", "privacyZones", "onboarded",
];

export const useApp = create<AppState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  hydrated: false,
  step: 0,
  data: null,
  fileName: null,
  parseOptions: { ...DEFAULT_PARSE_OPTIONS },
  rangeStart: 0,
  rangeEnd: 0,
  journeyName: DEFAULT_SETTINGS.lastName,
  toasts: [],

  t: (key, vars) => translate(get().lang, key, vars),

  hydrate: async () => {
    try {
      const saved = await getSetting<Partial<PersistedSettings>>("settings");
      if (saved) set({ ...saved });
    } catch {
      // first run / private browsing: fall back to defaults
    }
    set({ hydrated: true });
  },

  setSettings: (patch) => {
    set(patch);
    const s = get();
    const persisted = Object.fromEntries(PERSIST_KEYS.map((k) => [k, s[k]]));
    void setSetting("settings", persisted).catch(() => {});
  },

  setStep: (step) => set({ step }),

  setData: (data, fileName) => {
    if (data && data.points.length > 0) {
      // default range: the latest calendar year present in the data
      const end = data.summary.end;
      const yearStart = Date.UTC(new Date(end).getFullYear(), 0, 1);
      const start = Math.max(data.summary.start, yearStart);
      set({ data, fileName, rangeStart: start, rangeEnd: end, step: 1 });
    } else {
      set({ data, fileName });
    }
  },

  setParseOptions: (o) => set({ parseOptions: { ...get().parseOptions, ...o } }),
  setRange: (rangeStart, rangeEnd) => set({ rangeStart, rangeEnd }),
  setJourneyName: (journeyName) => {
    set({ journeyName });
    get().setSettings({ lastName: journeyName });
  },

  addZone: (z) => get().setSettings({ privacyZones: [...get().privacyZones, z] }),
  removeZone: (id) =>
    get().setSettings({ privacyZones: get().privacyZones.filter((z) => z.id !== id) }),

  toast: (text, kind = "info") => {
    const id = toastSeq++;
    set({ toasts: [...get().toasts, { id, text, kind }] });
    setTimeout(() => get().dismissToast(id), 4200);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  currentConfig: () => {
    const s = get();
    return {
      rangeStart: s.rangeStart,
      rangeEnd: s.rangeEnd,
      name: s.journeyName,
      titleTemplate: s.titleTemplate,
      duration: s.duration,
      camera: s.camera,
      compression: s.compression,
      formatId: s.formatId,
      mapThemeId: s.mapThemeId,
      trailId: s.trailId,
      showStopDates: s.showStopDates,
      privacyZones: s.privacyZones,
    };
  },

  resolvedTitle: () => {
    const s = get();
    const startYear = new Date(s.rangeStart).getFullYear();
    const endYear = new Date(s.rangeEnd).getFullYear();
    const year = startYear === endYear ? String(startYear) : `${startYear}-${endYear}`;
    return s.titleTemplate
      .replaceAll("{year}", year)
      .replaceAll("{name}", s.journeyName)
      .trim() || s.journeyName;
  },
}));
