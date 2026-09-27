import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import { MotionRoot } from "@/components/ui/MotionRoot";
import "./globals.css";

const serif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PRE//FLIGHT",
  description:
    "Preflight tells brands where a campaign idea sits in real social video, whether it's early or late, and where there's still room, before they spend money producing it.",
};

export const viewport: Viewport = {
  themeColor: "#050505",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // browser extensions inject attributes on <html>/<body> before hydration
    <html
      lang="en"
      className={`${serif.variable} ${inter.variable} ${mono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-void font-sans text-cluster/70" suppressHydrationWarning>
        <MotionRoot>{children}</MotionRoot>
      </body>
    </html>
  );
}
