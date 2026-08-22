import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Everything stays on your device. Map tiles are the only network request.",
  alternates: { canonical: "/privacy" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
