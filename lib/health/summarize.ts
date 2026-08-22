// Pure aggregation: (per-day dataset, optional date range) -> HealthSummary.
// Runs instantly client-side, so date filtering never re-reads the export.

import type { DayStat, HealthData, HealthSummary, MonthStat, WorkoutTypeStat } from "./types";

export function summarize(
  data: HealthData,
  rangeStart?: string,
  rangeEnd?: string
): HealthSummary | null {
  const inRange = (day: string) =>
    (!rangeStart || day >= rangeStart) && (!rangeEnd || day <= rangeEnd);

  const days = data.days.filter((d) => inRange(d.date));
  if (days.length === 0) return null;

  const totals = {
    steps: 0, distanceKm: 0, activeKcal: 0, exerciseMin: 0, flights: 0,
    workouts: 0, workoutMin: 0, workoutKm: 0,
  };
  const monthly = new Map<string, MonthStat>();
  let bestDay: { date: string; steps: number } | null = null;
  const rhrs: number[] = [];
  let hrSum = 0;
  let hrCount = 0;

  const month = (ym: string): MonthStat => {
    let mo = monthly.get(ym);
    if (!mo) {
      mo = { ym, steps: 0, workoutMin: 0, activeKcal: 0 };
      monthly.set(ym, mo);
    }
    return mo;
  };

  for (const d of days) {
    totals.steps += d.steps;
    totals.distanceKm += d.distKm;
    totals.activeKcal += d.kcal;
    totals.exerciseMin += d.exerciseMin;
    totals.flights += d.flights;
    if (d.rhr != null) rhrs.push(d.rhr);
    hrSum += d.hrSum;
    hrCount += d.hrCount;
    if (!bestDay || d.steps > bestDay.steps) bestDay = { date: d.date, steps: Math.round(d.steps) };
    const mo = month(d.date.slice(0, 7));
    mo.steps += d.steps;
    mo.activeKcal += d.kcal;
  }

  const workoutTypes = new Map<string, WorkoutTypeStat>();
  for (const w of data.workouts) {
    if (!inRange(w.day)) continue;
    totals.workouts++;
    totals.workoutMin += w.minutes;
    totals.workoutKm += w.km;
    month(w.day.slice(0, 7)).workoutMin += w.minutes;
    let t = workoutTypes.get(w.type);
    if (!t) {
      t = { type: w.type, count: 0, minutes: 0, km: 0, kcal: 0 };
      workoutTypes.set(w.type, t);
    }
    t.count++;
    t.minutes += w.minutes;
    t.km += w.km;
    t.kcal += w.kcal;
  }

  const n = days.length;
  return {
    rangeStart: Date.parse(days[0].date),
    rangeEnd: Date.parse(days[n - 1].date),
    daysWithData: n,
    totals,
    daily: {
      steps: totals.steps / n,
      distanceKm: totals.distanceKm / n,
      activeKcal: totals.activeKcal / n,
    },
    bestDay: bestDay && bestDay.steps > 0 ? bestDay : null,
    avgHr: hrCount > 0 ? hrSum / hrCount : null,
    restingHr: rhrs.length
      ? {
          avg: rhrs.reduce((a, b) => a + b, 0) / rhrs.length,
          min: Math.min(...rhrs),
          max: Math.max(...rhrs),
        }
      : null,
    monthly: [...monthly.values()].sort((a, b) => a.ym.localeCompare(b.ym)),
    workoutTypes: [...workoutTypes.values()].sort((a, b) => b.count - a.count),
  };
}

/** Distinct years present in the dataset, newest first (filter chips). */
export function yearsIn(data: HealthData): number[] {
  const ys = new Set<number>();
  for (const d of data.days) ys.add(Number(d.date.slice(0, 4)));
  return [...ys].sort((a, b) => b - a);
}

export type { DayStat };
