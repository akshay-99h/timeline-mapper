import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings",
  description: "Language, theme, defaults and privacy zones.",
  alternates: { canonical: "/settings" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
