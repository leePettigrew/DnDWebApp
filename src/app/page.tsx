"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { buttonClasses } from "@/components/ui/Button";
import {
  ClawIcon,
  HelmIcon,
  ScrollIcon,
  SwordsIcon,
  SwordIcon,
  ChevronRightIcon,
} from "@/components/ui/icons";
import { NAV_ITEMS } from "@/components/shell/nav-items";
import {
  useActiveCampaign,
  useCampaigns,
  useCharacters,
  useCombat,
  useEncounters,
  usePermissions,
  useSessionLogs,
  useStatBlocks,
} from "@/lib/data/hooks";

function StatTile({
  icon,
  value,
  label,
  href,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="surface-parchment group flex items-center gap-4 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-raised"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-card border border-brass/40 bg-parchment-100 text-brass-dark [&>svg]:h-6 [&>svg]:w-6">
        {icon}
      </span>
      <span>
        <span className="numerals block font-display text-2xl font-bold text-ink">
          {value}
        </span>
        <span className="block text-xs uppercase tracking-[0.15em] text-ink-faint">
          {label}
        </span>
      </span>
    </Link>
  );
}

export default function HearthPage() {
  const { items: campaigns } = useCampaigns();
  const { items: characters } = useCharacters();
  const { items: statBlocks } = useStatBlocks();
  const { items: encounters } = useEncounters();
  const { items: sessions } = useSessionLogs();
  const { value: combat } = useCombat();
  const { isDM } = usePermissions();
  const { campaign: activeCampaign } = useActiveCampaign();

  // Show the campaign you're actually in (the joined/opened one), not just the
  // first in your list — falling back to the only one in solo mode.
  const campaign = activeCampaign ?? campaigns[0];
  const latestSession = [...sessions].sort((a, b) =>
    b.date.localeCompare(a.date),
  )[0];

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow={campaign?.setting ?? "Campaign"}
        title={campaign?.name ?? "Dragon's Ledger"}
        description={
          campaign?.description ??
          "Begin by creating a campaign, then populate your heroes, bestiary, and lore."
        }
        actions={
          <Link href="/dice" className={buttonClasses("primary", "md")}>
            <SwordIcon className="h-4 w-4" /> Roll the Dice
          </Link>
        }
      />

      {/* Quick stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          icon={<HelmIcon />}
          value={characters.length}
          label="Heroes"
          href="/characters"
        />
        <StatTile
          icon={<ClawIcon />}
          value={statBlocks.length}
          label="Bestiary"
          href="/bestiary"
        />
        <StatTile
          icon={<SwordsIcon />}
          value={encounters.length}
          label="Encounters"
          href="/encounters"
        />
        <StatTile
          icon={<ScrollIcon />}
          value={sessions.length}
          label="Sessions"
          href="/codex"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Section tiles */}
        <div className="lg:col-span-2">
          <Panel title="The Scriptorium" eyebrow="Where to next">
            <div className="grid gap-3 sm:grid-cols-2">
              {NAV_ITEMS.filter(
                (item) => item.href !== "/" && (isDM || !item.dmOnly),
              ).map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group flex items-center gap-3 rounded-card border border-parchment-400/60 bg-parchment-100/60 px-4 py-3 transition-all duration-200 hover:border-brass/50 hover:bg-parchment-50 hover:shadow-gilt"
                  >
                    <Icon className="h-6 w-6 shrink-0 text-brass-dark" />
                    <span className="min-w-0">
                      <span className="block font-display text-sm font-semibold text-ink">
                        {item.label}
                      </span>
                      <span className="block truncate text-xs text-ink-faint">
                        {item.blurb}
                      </span>
                    </span>
                    <ChevronRightIcon className="ml-auto h-4 w-4 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brass-dark" />
                  </Link>
                );
              })}
            </div>
          </Panel>
        </div>

        {/* Continue the tale */}
        <div className="flex flex-col gap-6">
          {combat?.active && (
            <Panel tone="flat" className="border-oxblood/40">
              <p className="font-display text-xs uppercase tracking-[0.2em] text-oxblood">
                Battle in progress
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                Round {combat.round} · {combat.combatants.length} combatants
              </p>
              <Link
                href="/combat"
                className={buttonClasses("primary", "sm", "mt-3")}
              >
                <SwordsIcon className="h-4 w-4" /> Resume Combat
              </Link>
            </Panel>
          )}

          <Panel title="Latest Chronicle" eyebrow="Session log">
            {latestSession ? (
              <div>
                <p className="numerals text-xs text-ink-faint">
                  {latestSession.date}
                </p>
                <h3 className="mt-1 font-display text-base font-semibold text-ink">
                  {latestSession.title}
                </h3>
                <p className="mt-2 line-clamp-4 whitespace-pre-line text-sm text-ink-soft">
                  {latestSession.body}
                </p>
                <Link
                  href="/codex"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-oxblood hover:text-oxblood-light"
                >
                  Read the chronicle <ChevronRightIcon className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <p className="text-sm text-ink-soft">
                No sessions logged yet. Your tale awaits its first entry.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
