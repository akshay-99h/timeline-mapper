import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Studio",
  description: "Create your animated travel film: upload, configure, preview, generate.",
  alternates: { canonical: "/studio" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
