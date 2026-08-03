import { AnalyticsRoot } from "@/components/analytics-root";
import { InitialDashboardController } from "@/components/initial-dashboard-controller";
import { SalesDataEnhancementController } from "@/components/sales-data-enhancement-controller";

export default function Home() {
  return (
    <>
      <AnalyticsRoot />
      <InitialDashboardController />
      <SalesDataEnhancementController />
    </>
  );
}
