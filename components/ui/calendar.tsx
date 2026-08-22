"use client";

// shadcn/ui Calendar over react-day-picker, themed with the app's tokens.
// Chevrons come from Phosphor to keep a single icon family in the project.

import * as React from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({ className, classNames, ...props }: CalendarProps) {
  return (
    <DayPicker
      className={cn("select-none", className)}
      classNames={{
        months: "flex flex-col gap-4 sm:flex-row",
        month: "space-y-3",
        month_caption: "flex h-8 items-center justify-center",
        caption_label: "text-[13px] font-semibold",
        nav: "absolute inset-x-3 top-3 z-10 flex justify-between",
        button_previous:
          "flex h-7 w-7 items-center justify-center rounded-lg text-dim transition-colors hover:bg-sunken hover:text-ink",
        button_next:
          "flex h-7 w-7 items-center justify-center rounded-lg text-dim transition-colors hover:bg-sunken hover:text-ink",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-8 text-center text-[10px] font-medium uppercase text-faint",
        week: "mt-1 flex",
        day: cn(
          "relative h-8 w-8 p-0 text-center text-[12px] font-medium",
          "[&:has(.range-middle)]:bg-accent-soft first:[&:has(.range-middle)]:rounded-l-lg last:[&:has(.range-middle)]:rounded-r-lg"
        ),
        day_button:
          "flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-sunken aria-selected:hover:brightness-110",
        today: "[&>button]:font-bold [&>button]:text-accent",
        outside: "text-faint opacity-50",
        disabled: "text-faint opacity-30",
        hidden: "invisible",
        range_start:
          "range-start rounded-l-lg bg-accent-soft [&>button]:bg-accent [&>button]:text-white",
        range_end:
          "range-end rounded-r-lg bg-accent-soft [&>button]:bg-accent [&>button]:text-white",
        range_middle: "range-middle [&>button]:rounded-none [&>button]:bg-accent-soft [&>button]:text-ink",
        selected: "[&>button]:font-semibold",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? <CaretLeft size={14} /> : <CaretRight size={14} />,
      }}
      {...props}
    />
  );
}
