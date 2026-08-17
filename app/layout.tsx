import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EBS Outreach",
  description: "Exeter Biology Symposium — school outreach pipeline",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
