"use client";

// shadcn/ui-style chart tooltip (the ChartTooltipContent anatomy: popover
// surface, small label, indicator-dot rows), implemented against our design
// tokens since this project doesn't carry the full shadcn dependency chain.

export interface TooltipRow {
  label: string;
  value: string;
  /** indicator color; defaults to the accent */
  color?: string;
}

export function ChartTooltip({
  x,
  y,
  title,
  rows,
}: {
  x: number;
  y: number;
  title: string;
  rows: TooltipRow[];
}) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-30 min-w-[9rem] -translate-x-1/2 rounded-lg border border-line bg-elev px-3 py-2 shadow-xl"
      style={{ left: x, top: y }}
    >
      <p className="font-mono text-[11px] font-medium text-faint">{title}</p>
      <div className="mt-1.5 space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-[12px] text-dim">
              <span
                className="h-2 w-2 shrink-0 rounded-[3px]"
                style={{ background: r.color ?? "var(--accent)" }}
              />
              {r.label}
            </span>
            <span className="font-mono text-[12px] font-semibold text-ink">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
