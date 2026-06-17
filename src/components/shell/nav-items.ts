import type { ComponentType, SVGProps } from "react";
import {
  BookIcon,
  ClawIcon,
  D20Icon,
  FeatherIcon,
  HelmIcon,
  HomeIcon,
  ScrollIcon,
  SwordsIcon,
} from "@/components/ui/icons";

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Short description shown on the dashboard tiles. */
  blurb: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Hearth", icon: HomeIcon, blurb: "Your campaign at a glance" },
  { href: "/dice", label: "Dice Tower", icon: D20Icon, blurb: "Roll, modify, and save favorites" },
  { href: "/characters", label: "Heroes", icon: HelmIcon, blurb: "Full 5e character sheets" },
  { href: "/bestiary", label: "Bestiary", icon: ClawIcon, blurb: "Monsters & NPC stat blocks" },
  { href: "/compendium", label: "Compendium", icon: FeatherIcon, blurb: "SRD spells, gear & monsters" },
  { href: "/encounters", label: "Encounters", icon: SwordsIcon, blurb: "Assemble and arm your battles" },
  { href: "/combat", label: "War Table", icon: BookIcon, blurb: "Initiative & combat tracker" },
  { href: "/codex", label: "Codex", icon: ScrollIcon, blurb: "Notes, maps & session logs" },
];
