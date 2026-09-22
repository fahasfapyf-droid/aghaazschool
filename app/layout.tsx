import type { Metadata } from "next";
import "./globals.css";
import OfflineSyncBootstrap from "@/components/offline-sync-bootstrap";
import ConnectivityIndicator from "@/components/connectivity-indicator";

export const metadata: Metadata = {
  title: "Aghaaz School Management",
  description: "School management and admissions platform",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><OfflineSyncBootstrap /><ConnectivityIndicator />{children}</body>
    </html>
  );
}
