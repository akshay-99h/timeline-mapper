"use client";

// shadcn/ui "Date Range Picker" pattern: a Popover trigger button opening a
// two-month range Calendar.

import { useState } from "react";
import { CalendarBlank } from "@phosphor-icons/react";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function DateRangePicker({
  value,
  onChange,
  placeholder,
  locale,
  className,
}: {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  placeholder: string;
  locale: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const fmt = (d: Date) =>
    d.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
  const label = value?.from
    ? value.to
      ? `${fmt(value.from)} – ${fmt(value.to)}`
      : fmt(value.from)
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-2 rounded-full border px-4 py-1.5 font-mono text-[12px] font-semibold transition-colors",
            value?.from
              ? "border-accent bg-accent-soft text-accent"
              : "border-line text-dim hover:border-line-strong hover:text-ink",
            className
          )}
        >
          <CalendarBlank size={14} />
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto">
        <Calendar
          mode="range"
          numberOfMonths={2}
          defaultMonth={value?.from}
          selected={value}
          onSelect={onChange}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
