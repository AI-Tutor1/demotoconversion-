"use client";
import { LIGHT_GRAY, MUTED, NEAR_BLACK } from "@/lib/types";

export interface BandCounts {
  excellent: number;
  good: number;
  below: number;
  concerns: number;
  n: number;
}

interface Tile {
  label: string;
  value: number;
  bg: string;
  fg: string;
}

function pct(v: number, n: number): string {
  if (n === 0) return "—";
  return `${Math.round((v / n) * 100)}%`;
}

// 4 colour-coded KPI tiles immediately under the hero. Each tile shows the
// absolute count plus the % share of total approved sessions in range.
// Colours match interpretationBadge() from lib/scorecard.ts.
export default function SessionsInterpretationRow({ totals }: { totals: BandCounts }) {
  const tiles: Tile[] = [
    { label: "Excellent",            value: totals.excellent, bg: "#E8F5E9", fg: "#1B5E20" },
    { label: "Good",                 value: totals.good,      bg: "#E3F2FD", fg: "#0D47A1" },
    { label: "Below Standard",       value: totals.below,     bg: "#FFF8E1", fg: "#8B6914" },
    { label: "Significant Concerns", value: totals.concerns,  bg: "#FFEBEE", fg: "#B71C1C" },
  ];
  return (
    <section style={{ background: "#fff", padding: "28px 24px 8px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ marginBottom: 14 }}>
          <div className="section-label">Quality bands</div>
          <div style={{ fontSize: 19, fontWeight: 600, color: NEAR_BLACK, marginTop: 4 }}>Scorecard interpretation</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
            {totals.n} approved session{totals.n === 1 ? "" : "s"} in this date range.
          </div>
        </div>
        {totals.n === 0 ? (
          <div
            className="chart-card"
            style={{ padding: "20px 24px", color: MUTED, fontSize: 13 }}
          >
            No approved sessions in this date range.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 12,
            }}
          >
            {tiles.map((t) => (
              <div
                key={t.label}
                className="animate-fade-up-1"
                style={{
                  background: t.bg,
                  borderRadius: 14,
                  padding: "18px 20px",
                  border: `1px solid ${LIGHT_GRAY}`,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: t.fg,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  {t.label}
                </div>
                <div style={{ fontSize: 32, fontWeight: 700, color: t.fg, marginTop: 6, lineHeight: 1 }}>
                  {t.value}
                </div>
                <div style={{ fontSize: 12, color: t.fg, opacity: 0.75, marginTop: 4 }}>
                  {pct(t.value, totals.n)} of approved
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
