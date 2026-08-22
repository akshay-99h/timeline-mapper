// Streaming Apple Health export.xml analyzer. Worker-safe, no DOM.
//
// export.xml is routinely 300-800 MB, so it is NEVER held in memory as one
// string: the caller feeds decoded text chunks (with a carry buffer for tags
// split across chunk boundaries) and this scanner aggregates as it goes.
//
// What we read:
//   <Record type="HKQuantityTypeIdentifierStepCount" value=".." unit="count"
//           startDate="2025-03-01 08:11:00 +0530" .../>
//   <Workout workoutActivityType="HKWorkoutActivityTypeRunning"
//            duration="41.2" durationUnit="min" startDate=".." ...>
//     <WorkoutStatistics type="...DistanceWalkingRunning" sum="7.1" unit="km"/>
//     (older exports put totalDistance/totalEnergyBurned as attributes)
//   </Workout>
//
// Document order nests WorkoutStatistics inside their Workout, so a single
// pass with "most recent workout" association is exact.

import type { DayStat, HealthData, WorkoutItem } from "./types";

const TAG_RE = /<(Record|Workout|WorkoutStatistics)\b([^>]*)>/g;

// Record types we aggregate (checked with indexOf before attribute parsing
// so the millions of irrelevant records cost almost nothing).
const T_STEPS = "HKQuantityTypeIdentifierStepCount";
const T_DIST = "HKQuantityTypeIdentifierDistanceWalkingRunning";
const T_ENERGY = "HKQuantityTypeIdentifierActiveEnergyBurned";
const T_EXERCISE = "HKQuantityTypeIdentifierAppleExerciseTime";
const T_FLIGHTS = "HKQuantityTypeIdentifierFlightsClimbed";
const T_RHR = "HKQuantityTypeIdentifierRestingHeartRate";
const T_HR = "HKQuantityTypeIdentifierHeartRate";

/**
 * Cumulative metrics are tracked per data source (iPhone, Apple Watch, apps
 * all write overlapping records); per day we keep the dominant source, which
 * approximates the source-dedup the Health app itself performs. Naive
 * summation would overcount steps by 10-30% for Watch+iPhone users.
 */
interface SourceAgg {
  steps: number;
  distKm: number;
  kcal: number;
  exerciseMin: number;
  flights: number;
}

interface DayAgg {
  perSource: Map<string, SourceAgg>;
  rhr: number | null;
  hrSum: number;
  hrCount: number;
}

export class HealthScanner {
  private days = new Map<string, DayAgg>();
  private workoutList: WorkoutItem[] = [];
  private current: WorkoutItem | null = null;
  private carry = "";

  /** Feed one decoded text chunk. */
  push(text: string) {
    const data = this.carry + text;
    // keep any trailing incomplete tag for the next chunk
    const lastOpen = data.lastIndexOf("<");
    const lastClose = data.lastIndexOf(">");
    let scan: string;
    if (lastOpen > lastClose) {
      scan = data.slice(0, lastOpen);
      this.carry = data.slice(lastOpen);
    } else {
      scan = data;
      this.carry = "";
    }

    TAG_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TAG_RE.exec(scan)) !== null) {
      const tag = m[1];
      const attrs = m[2];
      if (tag === "Record") this.record(attrs);
      else if (tag === "Workout") this.workout(attrs);
      else this.workoutStat(attrs);
    }
  }

  private record(attrs: string) {
    let kind: "steps" | "dist" | "kcal" | "exercise" | "flights" | "rhr" | "hr";
    if (attrs.includes(T_STEPS)) kind = "steps";
    else if (attrs.includes(T_DIST)) kind = "dist";
    else if (attrs.includes(T_ENERGY)) kind = "kcal";
    else if (attrs.includes(T_EXERCISE)) kind = "exercise";
    else if (attrs.includes(T_FLIGHTS)) kind = "flights";
    else if (attrs.includes(T_RHR)) kind = "rhr";
    // closing quote so HeartRateVariabilitySDNN (ms values) can't match
    else if (attrs.includes(T_HR + '"')) kind = "hr";
    else return;

    const value = num(attr(attrs, "value"));
    if (value == null) return;
    const day = attr(attrs, "startDate")?.slice(0, 10);
    if (!day) return;
    const unit = attr(attrs, "unit") ?? "";
    const d = this.day(day);

    if (kind === "rhr") {
      d.rhr = value; // daily measurement, keep latest
      return;
    }
    if (kind === "hr") {
      d.hrSum += value;
      d.hrCount++;
      return;
    }

    const source = attr(attrs, "sourceName") ?? "?";
    let s = d.perSource.get(source);
    if (!s) {
      s = { steps: 0, distKm: 0, kcal: 0, exerciseMin: 0, flights: 0 };
      d.perSource.set(source, s);
    }
    switch (kind) {
      case "steps": s.steps += value; break;
      case "dist": s.distKm += toKm(value, unit); break;
      case "kcal": s.kcal += toKcal(value, unit); break;
      case "exercise": s.exerciseMin += value; break;
      case "flights": s.flights += value; break;
    }
  }

  private workout(attrs: string) {
    const rawType = attr(attrs, "workoutActivityType") ?? "Other";
    const day = attr(attrs, "startDate")?.slice(0, 10);
    if (!day) return;
    const durUnit = attr(attrs, "durationUnit") ?? "min";
    let minutes = num(attr(attrs, "duration")) ?? 0;
    if (durUnit === "s" || durUnit === "sec") minutes /= 60;
    if (durUnit === "hr") minutes *= 60;

    // legacy attribute form
    const km = toKm(num(attr(attrs, "totalDistance")) ?? 0, attr(attrs, "totalDistanceUnit") ?? "km");
    const kcal = toKcal(num(attr(attrs, "totalEnergyBurned")) ?? 0, attr(attrs, "totalEnergyBurnedUnit") ?? "kcal");

    this.current = { type: cleanType(rawType), minutes, km, kcal, day };
    this.workoutList.push(this.current);
    this.day(day); // ensure the day exists for range/day counting
  }

  /** iOS 16+ statistics live in child elements; add onto the last workout. */
  private workoutStat(attrs: string) {
    const w = this.current;
    if (!w) return;
    const sum = num(attr(attrs, "sum"));
    if (sum == null) return;
    const unit = attr(attrs, "unit") ?? "";
    if (attrs.includes("DistanceWalkingRunning") || attrs.includes("DistanceCycling") || attrs.includes("DistanceSwimming")) {
      w.km += toKm(sum, unit);
    } else if (attrs.includes("ActiveEnergyBurned")) {
      w.kcal += toKcal(sum, unit);
    }
  }

  private day(key: string): DayAgg {
    let d = this.days.get(key);
    if (!d) {
      d = { perSource: new Map(), rhr: null, hrSum: 0, hrCount: 0 };
      this.days.set(key, d);
    }
    return d;
  }

  /** Collapse per-source day aggregates into the raw per-day dataset. */
  finish(): HealthData | null {
    if (this.days.size === 0) return null;
    const days: DayStat[] = [];
    for (const [date, d] of this.days) {
      // dominant-source per metric per day (approximates Health-app dedup)
      let steps = 0, distKm = 0, kcal = 0, exerciseMin = 0, flights = 0;
      for (const s of d.perSource.values()) {
        if (s.steps > steps) steps = s.steps;
        if (s.distKm > distKm) distKm = s.distKm;
        if (s.kcal > kcal) kcal = s.kcal;
        if (s.exerciseMin > exerciseMin) exerciseMin = s.exerciseMin;
        if (s.flights > flights) flights = s.flights;
      }
      days.push({ date, steps, distKm, kcal, exerciseMin, flights, rhr: d.rhr, hrSum: d.hrSum, hrCount: d.hrCount });
    }
    days.sort((a, b) => a.date.localeCompare(b.date));
    return { days, workouts: this.workoutList };
  }
}

// ------------------------------------------------------------------ helpers

function attr(attrs: string, name: string): string | null {
  const i = attrs.indexOf(`${name}="`);
  if (i < 0) return null;
  const start = i + name.length + 2;
  const end = attrs.indexOf('"', start);
  return end < 0 ? null : attrs.slice(start, end);
}

function num(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toKm(v: number, unit: string): number {
  if (unit === "km") return v;
  if (unit === "mi") return v * 1.60934;
  if (unit === "m") return v / 1000;
  if (unit === "yd") return v * 0.0009144;
  return v; // assume km
}

function toKcal(v: number, unit: string): number {
  if (unit === "kJ") return v / 4.184;
  return v; // Cal / kcal
}

function cleanType(raw: string): string {
  return raw
    .replace("HKWorkoutActivityType", "")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
}
