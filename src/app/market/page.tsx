import { PageHeader } from "@/components/ui/PageHeader";
import { MarketTabs } from "@/components/market/MarketTabs";

export default function MarketPage() {
  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        eyebrow="The Trade Quarter"
        title="Markets"
        description="Shop the markets within your reach, watch prices move on the Exchange, and follow the table's trade as it happens."
      />
      <MarketTabs />
    </div>
  );
}
