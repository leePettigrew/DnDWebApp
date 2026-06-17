import { PageHeader } from "@/components/ui/PageHeader";
import { CompendiumBrowser } from "@/components/compendium/CompendiumBrowser";

export default function CompendiumPage() {
  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        eyebrow="The Compendium"
        title="Reference Library"
        description="Browse SRD spells, gear, and monsters — then drop them straight onto a hero's sheet or into your bestiary."
      />
      <CompendiumBrowser />
    </div>
  );
}
