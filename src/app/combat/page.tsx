import { PageHeader } from "@/components/ui/PageHeader";
import { WarTable } from "@/components/combat/WarTable";
import { MapPanel } from "@/components/combat/MapPanel";

export default function CombatPage() {
  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        eyebrow="The War Table"
        title="Initiative & Combat"
        description="Track turn order, hit points, and conditions round by round — with a live battle map and line-of-sight fog."
      />
      <MapPanel />
      <WarTable />
    </div>
  );
}
