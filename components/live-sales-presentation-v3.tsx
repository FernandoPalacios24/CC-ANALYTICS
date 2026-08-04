"use client";

import { LiveSalesPresentationV2 } from "@/components/live-sales-presentation-v2";

/**
 * Stable production entry for the live presentation.
 *
 * The business calendar is intentionally isolated from this screen: a failure
 * in calendar rules, RPCs or realtime subscriptions must never clear sales,
 * goals, podiums or supervisor rankings. The presentation keeps its own
 * proven sales-data lifecycle and fallback projection.
 */
export function LiveSalesPresentationV3() {
  return <LiveSalesPresentationV2 />;
}
