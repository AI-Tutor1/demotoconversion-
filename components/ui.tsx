"use client";

import { BLUE, MUTED } from "@/lib/types";

// ─── STATUS BADGE ───
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; c: string; d: string }> = {
    Pending: { bg: "#FFF8E1", c: "#8B6914", d: "#F5A623" },
    Converted: { bg: "#E8F5E9", c: "#1B5E20", d: "#4CAF50" },
    "Not Converted": { bg: "#FFEBEE", c: "#B71C1C", d: "#E53935" },
  };
  const s = map[status] || map.Pending;
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "3px 12px", borderRadius: 980, fontSize: 12,
        fontWeight: 500, background: s.bg, color: s.c,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.d }} />
      {status}
    </span>
  );
}

// ─── FORM FIELD ───
export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: MUTED, marginBottom: 5 }}>
        {label}
      </label>
      {children}
      {error && (
        <div style={{ fontSize: 11, color: "#E24B4A", marginTop: 3, fontWeight: 500 }}>
          {error}
        </div>
      )}
    </div>
  );
}

// ─── STAR RATING ───
export function Stars({
  value,
  onChange,
  readOnly = false,
}: {
  value: number;
  onChange: (v: number) => void;
  readOnly?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 4 }} role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          tabIndex={readOnly ? -1 : 0}
          role={readOnly ? undefined : "radio"}
          aria-label={`${n} stars`}
          onClick={() => !readOnly && onChange(n)}
          onKeyDown={(e) => {
            if (readOnly) return;
            if (e.key === "Enter" || e.key === " ") onChange(n);
            if (e.key === "ArrowRight" && value < 5) onChange(value + 1);
            if (e.key === "ArrowLeft" && value > 1) onChange(value - 1);
          }}
          style={{
            cursor: readOnly ? "default" : "pointer",
            fontSize: readOnly ? 13 : 22,
            color: n <= value ? "#FF9F0A" : "#d2d2d7",
            outline: "none",
          }}
        >
          {n <= value ? "\u2605" : "\u2606"}
        </span>
      ))}
      {!readOnly && (
        <span style={{ fontSize: 14, color: MUTED, marginLeft: 6, alignSelf: "center" }}>
          {value}/5
        </span>
      )}
    </div>
  );
}

// ─── EMPTY STATE ───
export function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px", color: MUTED }}>
      <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.3 }}>&#9678;</div>
      <p style={{ fontSize: 14 }}>{text}</p>
    </div>
  );
}

// ─── CONFIRM MODAL ───
export function ConfirmModal({
  title,
  msg,
  onConfirm,
  onCancel,
}: {
  title: string;
  msg: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.45)",
        zIndex: 250, display: "flex", alignItems: "center",
        justifyContent: "center", backdropFilter: "blur(6px)",
      }}
    >
      <div
        style={{
          background: "#fff", borderRadius: 16, padding: "28px 32px",
          maxWidth: 400, width: "90%",
          boxShadow: "0 20px 60px rgba(0,0,0,.25)",
        }}
      >
        <h3 style={{ fontSize: 19, fontWeight: 600, marginBottom: 8 }}>{title}</h3>
        <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.5, marginBottom: 24 }}>{msg}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="pill pill-outline" onClick={onCancel} style={{ fontSize: 13 }}>
            Cancel
          </button>
          <button className="pill pill-blue" onClick={onConfirm} style={{ fontSize: 13 }}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SECTION HEADER (for Analyst form) ───
export function SectionHeader({
  num,
  title,
  subtitle,
  children,
}: {
  num: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 36 }}>
      <h3 style={{ fontSize: 21, fontWeight: 600, marginBottom: 4 }}>
        <span style={{ color: BLUE, fontSize: 12, fontWeight: 600, marginRight: 12 }}>{num}</span>
        {title}
      </h3>
      <p style={{ fontSize: 14, color: MUTED, marginBottom: 20, lineHeight: 1.43 }}>{subtitle}</p>
      {children}
    </div>
  );
}
