"use client";
import { useRouter } from "next/navigation";
import { BLUE, MUTED, NEAR_BLACK } from "@/lib/types";

interface Props {
  active: "demos" | "sessions";
  canSeeSessions: boolean;
}

// Sticky tab strip rendered directly below the fixed nav (top 48px). Updates
// the URL via router.replace so /analytics?tab=sessions is deep-linkable.
export default function AnalyticsTabs({ active, canSeeSessions }: Props) {
  const router = useRouter();

  const go = (tab: "demos" | "sessions") => {
    const href = tab === "sessions" ? "/analytics?tab=sessions" : "/analytics";
    router.replace(href, { scroll: false });
  };

  const pill = (tab: "demos" | "sessions", label: string) => {
    const isActive = active === tab;
    return (
      <button
        key={tab}
        type="button"
        onClick={() => go(tab)}
        style={{
          background: isActive ? BLUE : "transparent",
          color: isActive ? "#fff" : NEAR_BLACK,
          border: "1px solid",
          borderColor: isActive ? BLUE : "#d2d2d7",
          borderRadius: 980,
          padding: "6px 16px",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          transition: "background 0.15s ease, color 0.15s ease",
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      style={{
        position: "sticky",
        top: 48,
        zIndex: 90,
        background: "rgba(255,255,255,0.88)",
        backdropFilter: "saturate(180%) blur(16px)",
        borderBottom: "1px solid #e8e8ed",
        padding: "10px 24px",
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span className="section-label" style={{ color: MUTED, marginRight: 6 }}>View</span>
        {pill("demos", "Demos")}
        {canSeeSessions && pill("sessions", "Sessions")}
      </div>
    </div>
  );
}
