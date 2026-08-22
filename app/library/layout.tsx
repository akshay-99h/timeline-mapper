import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My videos",
  description: "Your generated travel films, stored locally on this device.",
  alternates: { canonical: "/library" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
