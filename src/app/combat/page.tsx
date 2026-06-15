import { PageHeader } from "@/components/ui/PageHeader";
import { WarTable } from "@/components/combat/WarTable";

export default function CombatPage() {
  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="The War Table"
        title="Initiative & Combat"
        description="Track turn order, hit points, and conditions round by round — and add reinforcements on the fly."
      />
      <WarTable />
    </div>
  );
}
