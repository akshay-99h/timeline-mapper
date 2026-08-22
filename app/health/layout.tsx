import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Health report",
  description:
    "Analyze your entire Apple Health export locally: steps, workouts, heart rate and energy. Nothing leaves your device.",
  alternates: { canonical: "/health" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
