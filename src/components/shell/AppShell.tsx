"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { D20Icon, MenuIcon, CloseIcon } from "@/components/ui/icons";
import {
  useActiveCampaign,
  useCampaigns,
  useCurrentUser,
  useDataProvider,
  usePermissions,
} from "@/lib/data/hooks";
import { SessionPanel } from "@/components/multiplayer/SessionPanel";
import { ConnectionPill } from "@/components/multiplayer/ConnectionPill";
import { ChatWidget } from "@/components/multiplayer/ChatWidget";
import { HandoutOverlay } from "@/components/dm/HandoutOverlay";
import { ThemeToggle } from "./ThemeToggle";
import { NAV_ITEMS } from "./nav-items";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { isDM } = usePermissions();
  return (
    <nav className="flex flex-col gap-1" aria-label="Primary">
      {NAV_ITEMS.filter((item) => isDM || !item.dmOnly).map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-card border px-3 py-2.5 transition-all duration-200",
              active
                ? "border-brass/50 bg-parchment-100 text-oxblood shadow-gilt"
                : "border-transparent text-ink-soft hover:border-parchment-400/60 hover:bg-parchment-200/60 hover:text-ink",
            )}
          >
            <Icon
              className={cn(
                "h-5 w-5 shrink-0 transition-colors",
                active ? "text-brass-dark" : "text-ink-faint group-hover:text-brass-dark",
              )}
            />
            <span className="font-display text-sm font-semibold tracking-title">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3">
      <span className="flex h-11 w-11 items-center justify-center rounded-card border border-brass/50 bg-oxblood text-gilt shadow-gilt">
        <D20Icon className="h-6 w-6" />
      </span>
      <span className="leading-tight">
        <span className="block font-display text-lg font-bold tracking-title text-ink">
          Dragon&apos;s Ledger
        </span>
        <span className="block font-display text-[0.6rem] uppercase tracking-[0.3em] text-brass-dark">
          Candlelit Scriptorium
        </span>
      </span>
    </Link>
  );
}

function CampaignBadge() {
  const { items } = useCampaigns();
  const user = useCurrentUser();
  const { campaign: active } = useActiveCampaign();
  const name = active?.name ?? items[0]?.name ?? "No campaign yet";
  return (
    <div className="rounded-card border border-parchment-400/60 bg-parchment-100/70 px-3 py-2.5">
      <p className="font-display text-[0.6rem] uppercase tracking-[0.2em] text-brass-dark">
        Active Campaign
      </p>
      <p className="truncate font-display text-sm font-semibold text-ink">
        {name}
      </p>
      <p className="mt-1 truncate text-xs text-ink-faint">
        {user ? `Keeper: ${user.name}` : "Local mode"}
      </p>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const { capabilities } = useDataProvider();

  // Close the mobile drawer on navigation.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen lg:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-card focus:border focus:border-brass focus:bg-oxblood focus:px-4 focus:py-2 focus:font-display focus:text-parchment-50"
      >
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col gap-6 border-r border-parchment-400/60 bg-parchment-200/40 px-4 py-6 lg:flex">
        <div className="flex items-center justify-between gap-2">
          <Brand />
          <ThemeToggle />
        </div>
        <CampaignBadge />
        <div className="rule-illuminated" />
        <NavLinks />
        <div className="mt-auto space-y-3">
          <SessionPanel />
          {!capabilities.multiUser && (
            <div className="rounded-card border border-parchment-400/50 bg-parchment-100/50 px-3 py-2 text-[0.7rem] text-ink-faint">
              <span className="font-display tracking-title text-brass-dark">
                Solo
              </span>{" "}
              · local-first · your data lives in this browser
            </div>
          )}
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-parchment-400/60 bg-parchment-100/90 px-4 py-3 backdrop-blur-sm lg:hidden">
        <Brand />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <ConnectionPill />
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          className="rounded-card border border-parchment-400/70 p-2 text-ink-soft hover:bg-parchment-200"
        >
            {menuOpen ? (
              <CloseIcon className="h-6 w-6" />
            ) : (
              <MenuIcon className="h-6 w-6" />
            )}
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <div
          className="fixed inset-0 top-[57px] z-20 animate-fade-in bg-leather/40 lg:hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMenuOpen(false);
          }}
        >
          <div className="animate-fade-in-up border-b border-parchment-400/60 bg-parchment-200 px-4 py-4 shadow-raised">
            <CampaignBadge />
            <div className="my-4 rule-illuminated" />
            <NavLinks onNavigate={() => setMenuOpen(false)} />
            <div className="mt-4">
              <SessionPanel />
            </div>
          </div>
        </div>
      )}

      <main id="main" className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </div>
      </main>

      <ChatWidget />
      <HandoutOverlay />
    </div>
  );
}
