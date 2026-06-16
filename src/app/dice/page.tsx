import { PageHeader } from "@/components/ui/PageHeader";
import { DiceRoller } from "@/components/dice/DiceRoller";
import { DiceArena } from "@/components/dice/DiceArena";
import { RollHistoryPanel } from "@/components/dice/RollHistoryPanel";

export default function DicePage() {
  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        eyebrow="The Dice Tower"
        title="Roll the Bones"
        description="Build any pool of dice, add modifiers, roll with advantage or disadvantage, and keep your favorites a tap away."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <DiceRoller />
          <DiceArena />
        </div>
        <div className="lg:col-span-1">
          <RollHistoryPanel />
        </div>
      </div>
    </div>
  );
}
