import { PageHeader } from "@/components/ui/PageHeader";
import { MarketBrowser } from "@/components/market/MarketBrowser";

export default function MarketPage() {
  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        eyebrow="The Trade Quarter"
        title="Markets"
        description="Buy and sell at the markets within your reach. Standing with a faction sways their prices — and a sharp tongue can haggle them lower."
      />
      <MarketBrowser />
    </div>
  );
}
