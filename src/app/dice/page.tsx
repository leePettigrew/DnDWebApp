import { PageHeader } from "@/components/ui/PageHeader";
import { DiceRoller } from "@/components/dice/DiceRoller";
import { DiceArena } from "@/components/dice/DiceArena";

export default function DicePage() {
  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        eyebrow="The Dice Tower"
        title="Roll the Bones"
        description="Build any pool of dice, add modifiers, roll with advantage or disadvantage, and keep your favorites a tap away."
      />
      <DiceRoller />
      <DiceArena />
    </div>
  );
}
