"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import {
  ACCT_FINAL_CATEGORIES,
  BLUE,
  LIGHT_GRAY,
  MUTED,
  NEAR_BLACK,
  acctFinalLabel,
  type Demo,
} from "@/lib/types";
import { suggestAccountability } from "@/lib/utils";

interface Props {
  demoId: number | null;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="section-label" style={{ marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function ReadOnlyChip({ label, tone }: { label: string; tone: "blue" | "yellow" | "gray" | "green" }) {
  const palette = {
    blue:   { bg: "#E3F2FD", fg: "#0D47A1" },
    yellow: { bg: "#FFF8E1", fg: "#8B6914" },
    gray:   { bg: LIGHT_GRAY, fg: MUTED },
    green:  { bg: "#E8F5E9", fg: "#1B5E20" },
  }[tone];
  return (
    <span
      style={{
        padding: "3px 10px",
        borderRadius: 980,
        fontSize: 11,
        fontWeight: 600,
        background: palette.bg,
        color: palette.fg,
        marginRight: 6,
      }}
    >
      {label}
    </span>
  );
}

export default function AccountabilityDrawer({ demoId, onClose }: Props) {
  const {
    demos,
    user,
    teacherSessions,
    finalizeAccountability,
    clearAccountability,
    setConfirm,
    flash,
    logActivity,
  } = useStore();

  // Read live demo from store — realtime keeps this fresh if another tab edits.
  const demo: Demo | undefined = useMemo(
    () => demos.find((d) => d.id === demoId) ?? undefined,
    [demos, demoId]
  );

  const canFinalize = user?.role === "analyst" || user?.role === "manager";

  // Local selection state — initialised from the demo's current final set
  // (or the auto-heuristic's single category if never finalised).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  // Snapshot the finalisation marker at open-time so we can detect concurrent
  // edits from other tabs/users.
  const [openedAt, setOpenedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!demo) return;
    const initial: string[] =
      demo.accountabilityFinal.length > 0
        ? demo.accountabilityFinal
        : demo.status === "Not Converted"
        ? [suggestAccountability(demo)]
        : [];
    setSelected(new Set(initial));
    setOpenedAt(demo.accountabilityFinalAt ?? null);
    // Re-initialise when the user opens a different demo.
  }, [demoId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!demo || demoId === null) return null;

  const isFinalised = !!demo.accountabilityFinalAt;
  const concurrentEdit =
    !!demo.accountabilityFinalAt &&
    openedAt !== demo.accountabilityFinalAt &&
    demo.accountabilityFinalBy !== (user?.id ?? "");

  const toggle = (value: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const saveDisabled = busy || selected.size === 0 || !canFinalize;

  const onSave = async () => {
    if (saveDisabled) return;
    setBusy(true);
    const cats = Array.from(selected);
    const res = await finalizeAccountability(demo.id, cats);
    setBusy(false);
    if (res.ok) {
      logActivity(`finalised accountability (${cats.join(", ")})`, demo.student);
      flash("Accountability finalised");
      onClose();
    }
  };

  const onClear = () => {
    if (!canFinalize) return;
    setConfirm({
      title: "Clear accountability?",
      msg: `This will remove the finalised allocation for ${demo.student}. The demo will return to "Awaiting accountability".`,
      onConfirm: async () => {
        setBusy(true);
        const res = await clearAccountability(demo.id);
        setBusy(false);
        if (res.ok) {
          logActivity("cleared accountability", demo.student);
          flash("Accountability cleared");
          onClose();
        }
      },
    });
  };

  // Linked sessions — match by teacher uid (stable FK). Student linkage may
  // be absent on older sessions; we don't force that match so teachers with
  // no student-level link still surface relevant sessions.
  const linkedSessions = useMemo(() => {
    if (user?.role !== "analyst" && user?.role !== "manager") return [];
    const teacherKey = String(demo.tid);
    return teacherSessions
      .filter((s) => s.teacherUserId === teacherKey)
      .filter(
        (s) =>
          !demo.student ||
          (s.studentUserName ?? "").toLowerCase() === demo.student.toLowerCase() ||
          (s.expectedStudent1 ?? "").toLowerCase() === demo.student.toLowerCase()
      )
      .slice(0, 5);
  }, [teacherSessions, demo.tid, demo.student, user?.role]);

  const suggestion = useMemo(() => suggestAccountability(demo), [demo]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Accountability allocation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
          animation: "fadeIn 0.15s ease-out",
        }}
      />

      {/* Panel */}
      <div
        className="animate-slide-in"
        style={{
          position: "relative",
          width: 480,
          maxWidth: "100vw",
          background: "#fff",
          height: "100vh",
          overflowY: "auto",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.12)",
          padding: "28px 28px 32px",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div className="section-label" style={{ marginBottom: 4 }}>Accountability</div>
            <h2 style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.2, color: NEAR_BLACK, margin: 0 }}>
              {demo.student}
            </h2>
            <div style={{ fontSize: 13, color: MUTED, marginTop: 3 }}>
              {demo.teacher} · {demo.date} · {demo.subject} · {demo.level}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: 22,
              color: MUTED,
              lineHeight: 1,
              padding: 4,
            }}
          >
            ×
          </button>
        </div>

        {/* Concurrent-edit banner */}
        {concurrentEdit && (
          <div
            style={{
              background: "#FFF8E1",
              border: "1px solid #F5D98E",
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 16,
              fontSize: 12,
              color: "#8B6914",
            }}
          >
            Finalised just now by another user. Showing their allocation — save again to overwrite.
          </div>
        )}

        {/* Status / workflow */}
        <Section title="Status">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <ReadOnlyChip
              label={demo.status}
              tone={demo.status === "Converted" ? "green" : demo.status === "Not Converted" ? "yellow" : "gray"}
            />
            {isFinalised ? (
              <ReadOnlyChip label="Finalised" tone="blue" />
            ) : demo.status === "Not Converted" ? (
              <ReadOnlyChip label="Awaiting accountability" tone="yellow" />
            ) : null}
          </div>
        </Section>

        {/* Analyst review */}
        {demo.review && (
          <Section title="Analyst review">
            <p style={{ fontSize: 13, lineHeight: 1.5, color: NEAR_BLACK, margin: 0 }}>{demo.review}</p>
          </Section>
        )}

        {/* POUR */}
        {demo.pour.length > 0 && (
          <Section title="POUR issues">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {demo.pour.map((p, i) => (
                <span key={i} className="pour-tag" style={{ fontSize: 11 }}>
                  {p.cat}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Linked sessions */}
        {(user?.role === "analyst" || user?.role === "manager") && (
          <Section title="Linked product sessions">
            {linkedSessions.length === 0 ? (
              <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>No linked Product sessions.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {linkedSessions.map((s) => (
                  <Link
                    key={s.id}
                    href={`/sessions/${s.id}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: LIGHT_GRAY,
                      border: "1px solid #e8e8ed",
                      borderRadius: 8,
                      padding: "8px 12px",
                      textDecoration: "none",
                      color: NEAR_BLACK,
                      fontSize: 12,
                    }}
                  >
                    <span>{s.sessionDate ?? "—"} · {s.studentUserName || s.expectedStudent1 || "—"}</span>
                    <span style={{ color: BLUE, fontWeight: 600 }}>View →</span>
                  </Link>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* Sales suggestion */}
        <Section title="Sales suggestion">
          {demo.acctType ? (
            <ReadOnlyChip label={demo.acctType} tone={demo.acctType === "Product" ? "yellow" : "blue"} />
          ) : (
            <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>No suggestion yet.</p>
          )}
        </Section>

        {/* Auto-heuristic */}
        <Section title="Auto-heuristic">
          <p style={{ fontSize: 12, color: MUTED, margin: "0 0 4px" }}>
            Based on analyst rating {demo.analystRating}/5, student feedback {demo.studentRaw}/10, {demo.pour.length} POUR issue{demo.pour.length === 1 ? "" : "s"}:
          </p>
          <ReadOnlyChip label={acctFinalLabel(suggestion)} tone={suggestion === "Product" ? "yellow" : "blue"} />
        </Section>

        {/* Allocation checkboxes */}
        <Section title={canFinalize ? "Final allocation" : "Finalised allocation"}>
          {canFinalize ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {ACCT_FINAL_CATEGORIES.map((c) => {
                const checked = selected.has(c.value);
                return (
                  <label
                    key={c.value}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      background: checked ? "#EAF4FE" : LIGHT_GRAY,
                      border: `1px solid ${checked ? BLUE : "#e8e8ed"}`,
                      borderRadius: 10,
                      cursor: "pointer",
                      transition: "background 0.12s, border-color 0.12s",
                    }}
                  >
                    <input
                      type="checkbox"
                      className="apple-checkbox"
                      checked={checked}
                      onChange={() => toggle(c.value)}
                    />
                    <span style={{ fontSize: 14, fontWeight: 500, color: NEAR_BLACK }}>{c.label}</span>
                  </label>
                );
              })}
            </div>
          ) : demo.accountabilityFinal.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {demo.accountabilityFinal.map((v) => (
                <ReadOnlyChip key={v} label={acctFinalLabel(v)} tone={v === "Product" ? "yellow" : "blue"} />
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>Not finalised yet.</p>
          )}
        </Section>

        {/* Actions */}
        {canFinalize && (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", marginTop: 20, flexWrap: "wrap" }}>
            {isFinalised && (
              <button
                type="button"
                onClick={onClear}
                disabled={busy}
                className="pill"
                style={{
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: busy ? "not-allowed" : "pointer",
                  background: "#fff",
                  color: "#c13030",
                  border: "1px solid #f5c6c6",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                Clear finalisation
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="pill"
              style={{
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                cursor: busy ? "not-allowed" : "pointer",
                background: "#fff",
                color: NEAR_BLACK,
                border: "1px solid #e8e8ed",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saveDisabled}
              className="pill pill-blue"
              style={{
                padding: "8px 18px",
                fontSize: 13,
                fontWeight: 600,
                cursor: saveDisabled ? "not-allowed" : "pointer",
                opacity: saveDisabled ? 0.55 : 1,
              }}
            >
              {busy ? "Saving…" : isFinalised ? "Update" : "Save"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
