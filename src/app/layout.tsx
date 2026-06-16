import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DataProviderProvider } from "@/lib/data/context";
import { AppShell } from "@/components/shell/AppShell";
import { MultiplayerGate } from "@/components/multiplayer/MultiplayerGate";

export const metadata: Metadata = {
  title: "Dragon's Ledger — D&D Campaign Manager",
  description:
    "A candlelit campaign companion for Dungeons & Dragons: dice, character sheets, encounters, combat tracking, and campaign lore — all in one tome.",
};

export const viewport: Viewport = {
  themeColor: "#7A2E2E",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before paint to avoid a flash. Defaults to the
            OS preference when the user hasn't chosen. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('dragons-ledger:theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}`,
          }}
        />
        {/* Type pairing: Cinzel (engraved display) + EB Garamond (warm body).
            Loaded via <link> so the app still renders with serif fallbacks
            when offline, instead of failing the build. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <DataProviderProvider>
          <MultiplayerGate>
            <AppShell>{children}</AppShell>
          </MultiplayerGate>
        </DataProviderProvider>
      </body>
    </html>
  );
}
