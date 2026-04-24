"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import AnalyticsTabs from "@/components/analytics-tabs";
import DemosAnalytics from "@/components/demos-analytics";
import SessionsAnalytics from "@/components/sessions-analytics";

function AnalyticsBody() {
  const { user } = useStore();
  const params = useSearchParams();
  const canSeeSessions = user?.role === "analyst" || user?.role === "manager";
  const requested = params.get("tab");
  const active: "demos" | "sessions" =
    requested === "sessions" && canSeeSessions ? "sessions" : "demos";
  return (
    <>
      <AnalyticsTabs active={active} canSeeSessions={canSeeSessions} />
      {active === "sessions" ? <SessionsAnalytics /> : <DemosAnalytics />}
    </>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={null}>
      <AnalyticsBody />
    </Suspense>
  );
}
