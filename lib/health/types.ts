// Health report types (aggregated from Apple Health export.xml).

export interface WorkoutTypeStat {
  /** cleaned name, e.g. "Running" */
  type: string;
  count: number;
  minutes: number;
  km: number;
  kcal: number;
}

export interface MonthStat {
  /** "2025-03" */
  ym: string;
  steps: number;
  workoutMin: number;
  activeKcal: number;
}

export interface HealthSummary {
  /** epoch ms of first/last data point seen */
  rangeStart: number;
  rangeEnd: number;
  daysWithData: number;
  totals: {
    steps: number;
    distanceKm: number;
    activeKcal: number;
    exerciseMin: number;
    flights: number;
    workouts: number;
    workoutMin: number;
    workoutKm: number;
  };
  daily: {
    steps: number;
    distanceKm: number;
    activeKcal: number;
  };
  bestDay: { date: string; steps: number } | null;
  restingHr: { avg: number; min: number; max: number } | null;
  /** average heart rate across all samples, from days with data */
  avgHr: number | null;
  monthly: MonthStat[];
  workoutTypes: WorkoutTypeStat[];
}

export interface HealthProgress {
  /** 0..1 of bytes scanned */
  fraction: number;
}

/** One day of already source-deduped metrics. */
export interface DayStat {
  /** "2025-03-01" */
  date: string;
  steps: number;
  distKm: number;
  kcal: number;
  exerciseMin: number;
  flights: number;
  rhr: number | null;
  hrSum: number;
  hrCount: number;
}

export interface WorkoutItem {
  /** "2025-03-01" */
  day: string;
  type: string;
  minutes: number;
  km: number;
  kcal: number;
}

/** Raw per-day dataset the scanner produces; summarize() turns a (possibly
 *  date-filtered) slice of it into a HealthSummary. */
export interface HealthData {
  days: DayStat[];
  workouts: WorkoutItem[];
}
