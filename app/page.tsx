import { AnalyticsRoot } from "@/components/analytics-root";
import { ProductionModuleController } from "@/components/production-module-controller";
import { SalesDataEnhancementController } from "@/components/sales-data-enhancement-controller";

export default function Home() {
  return (
    <>
      <AnalyticsRoot />
      <ProductionModuleController />
      <SalesDataEnhancementController />
    </>
  );
}
