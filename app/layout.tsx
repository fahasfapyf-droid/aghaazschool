import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aghaaz School Management",
  description: "School management and admissions platform",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
