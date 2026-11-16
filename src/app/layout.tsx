import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "CabTrack — Daily Cab & Driver Tracking",
  description: "Cab duty ON/OFF, drivers, day & night shifts, live alerts and daily reports.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#f6f7fb] text-slate-900 antialiased">{children}</body>
    </html>
  );
}
