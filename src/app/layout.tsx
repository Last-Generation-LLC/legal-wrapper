import type { Metadata } from "next";
import { Inter_Tight, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

// next/font self-hosts these at build time (satisfies the "self-host in
// production" handoff note). Each sets a CSS variable consumed by @theme.
const sans = Inter_Tight({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const serif = Instrument_Serif({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"], // Instrument Serif ships only weight 400
});
const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Legal Document Workspace",
  description: "Local-first legal document workspace built on the Claude API.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      // `dark` pins the app to the dark theme now; the light theme stays
      // defined-but-unused so a future toggle is a one-line change (d1).
      className={`dark ${sans.variable} ${serif.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="bg-bg text-foreground min-h-full flex flex-col">
        {children}
        {/* #18: app-wide toast layer. Unstyled + classNames so toasts wear the
            project's tokens (panel bg, mono, amber/red) instead of sonner's
            defaults. Errors get a red left rule; only upload/parse failures
            toast — chat and grid errors stay inline by decision. */}
        <Toaster
          theme="dark"
          position="bottom-right"
          offset={20}
          toastOptions={{
            unstyled: true,
            classNames: {
              toast:
                "flex w-full items-start gap-2.5 rounded-[4px] border border-border bg-panel px-3.5 py-3 shadow-lg font-mono text-[11px] leading-relaxed text-foreground",
              title: "font-medium text-foreground",
              description: "text-dim",
              error: "border-l-2 border-l-red",
              closeButton: "text-dim hover:text-foreground",
            },
          }}
        />
      </body>
    </html>
  );
}
