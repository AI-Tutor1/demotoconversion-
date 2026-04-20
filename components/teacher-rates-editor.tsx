"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useStore } from "@/lib/store";
import {
  BLUE,
  CURRICULA,
  GRADE_OPTIONS_BY_LEVEL,
  GRADES,
  LEVELS,
  MUTED,
  NEAR_BLACK,
  SUBJECTS,
  type TeacherRate,
} from "@/lib/types";
import { dbRowToTeacherRate } from "@/lib/teacher-transforms";

/**
 * Row-level add / edit / delete grid for `public.teacher_rates`.
 *
 * The tutor quotes a rate per (curriculum, level, grade, subject) — each
 * combination is unique per profile (DB UNIQUE constraint). CHECK enforces
 * rate_per_hour > 0. RLS lets hr / manager / analyst mutate rates on an
 * approved profile; hr / manager can also mutate on unapproved profiles.
 *
 * Mutations use direct `supabase.from('teacher_rates')` calls — side table
 * has no sensitive columns so raw SQL is safe (cf. teacher_profiles which
 * goes through an RPC to protect tid / status).
 */
interface Props {
  profileId: string;
  // When false, renders locked rows (view-only). Used by Sales/Conducted views.
  canEdit?: boolean;
}

const CURRENCIES = ["PKR", "USD", "GBP", "EUR", "AED"];

export default function TeacherRatesEditor({ profileId, canEdit = true }: Props) {
  const { flash } = useStore();
  const [rates, setRates] = useState<TeacherRate[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null); // row id being saved

  const fetchRates = useCallback(async () => {
    const { data, error } = await supabase
      .from("teacher_rates")
      .select("*")
      .eq("teacher_profile_id", profileId)
      .order("level", { ascending: true })
      .order("grade", { ascending: true })
      .order("subject", { ascending: true });
    if (error) {
      flash(`Failed to load rates: ${error.message}`);
      setRates([]);
    } else {
      setRates((data ?? []).map(dbRowToTeacherRate));
    }
    setInitialLoading(false);
  }, [profileId, flash]);

  useEffect(() => { fetchRates(); }, [fetchRates]);

  // Realtime — one row added elsewhere surfaces here
  useEffect(() => {
    const channel = supabase
      .channel(`teacher-rates-${profileId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "teacher_rates", filter: `teacher_profile_id=eq.${profileId}` },
        () => { fetchRates(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profileId, fetchRates]);

  const addRow = async () => {
    const row = {
      teacher_profile_id: profileId,
      curriculum: CURRICULA[0],
      level: LEVELS[0],
      grade: (GRADE_OPTIONS_BY_LEVEL[LEVELS[0]] ?? GRADES)[0],
      subject: SUBJECTS[0],
      rate_per_hour: 1000,
      currency: "PKR",
    };
    setSaving("new");
    const { error } = await supabase.from("teacher_rates").insert(row);
    setSaving(null);
    if (error) {
      if (error.message.includes("unique")) flash("A rate already exists for this combination");
      else flash(`Save failed: ${error.message}`);
      return;
    }
    flash("Rate added");
  };

  const updateRow = async (id: string, patch: Partial<Omit<TeacherRate, "id" | "teacherProfileId">>) => {
    setSaving(id);
    const dbPatch: Record<string, unknown> = {};
    if (patch.curriculum !== undefined) dbPatch.curriculum = patch.curriculum;
    if (patch.level !== undefined) dbPatch.level = patch.level;
    if (patch.grade !== undefined) dbPatch.grade = patch.grade;
    if (patch.subject !== undefined) dbPatch.subject = patch.subject;
    if (patch.ratePerHour !== undefined) dbPatch.rate_per_hour = patch.ratePerHour;
    if (patch.currency !== undefined) dbPatch.currency = patch.currency;
    if (patch.notes !== undefined) dbPatch.notes = patch.notes;
    const { error } = await supabase.from("teacher_rates").update(dbPatch).eq("id", id);
    setSaving(null);
    if (error) {
      if (error.message.includes("unique")) flash("A rate already exists for this combination");
      else if (error.message.includes("check")) flash("Rate must be greater than 0");
      else flash(`Save failed: ${error.message}`);
    }
  };

  const deleteRow = async (id: string) => {
    const { error } = await supabase.from("teacher_rates").delete().eq("id", id);
    if (error) flash(`Delete failed: ${error.message}`);
    else flash("Rate removed");
  };

  const totalByLevel = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rates) m.set(r.level, (m.get(r.level) ?? 0) + 1);
    return m;
  }, [rates]);

  if (initialLoading) return <div style={{ color: MUTED, padding: 16 }}>Loading rates…</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#1d1d1f" }}>Per-hour rates</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
            {rates.length === 0 ? "No rates yet" : `${rates.length} rate${rates.length === 1 ? "" : "s"} across ${totalByLevel.size} level${totalByLevel.size === 1 ? "" : "s"}`}
          </div>
        </div>
        {canEdit && (
          <button
            onClick={addRow}
            disabled={saving === "new"}
            className="pill pill-blue"
            style={{ border: "none", cursor: saving === "new" ? "wait" : "pointer" }}
          >
            + Add rate
          </button>
        )}
      </div>

      {rates.length === 0 ? (
        <div style={{ color: MUTED, fontSize: 13, padding: "24px 16px", textAlign: "center", background: "#fafafa", borderRadius: 8 }}>
          {canEdit ? "Click + Add rate to quote a per-hour charge for a (curriculum, level, grade, subject) combination." : "No rates set."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rates.map((r) => {
            const gradeOptions = GRADE_OPTIONS_BY_LEVEL[r.level] ?? GRADES;
            const locked = !canEdit;
            const isSaving = saving === r.id;
            return (
              <div
                key={r.id}
                style={{
                  position: "relative",
                  background: "#fff",
                  border: "1px solid #e8e8ed",
                  borderRadius: 10,
                  padding: "14px 14px 12px",
                  opacity: isSaving ? 0.6 : 1,
                  transition: "opacity 120ms",
                }}
              >
                {canEdit && (
                  <button
                    onClick={() => deleteRow(r.id)}
                    disabled={isSaving}
                    aria-label="Delete rate"
                    title="Delete rate"
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      width: 26,
                      height: 26,
                      background: "none",
                      border: "none",
                      color: isSaving ? MUTED : "#B71C1C",
                      fontSize: 20,
                      lineHeight: 1,
                      cursor: isSaving ? "wait" : "pointer",
                      padding: 0,
                      borderRadius: 6,
                    }}
                  >
                    ×
                  </button>
                )}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: 10,
                  paddingRight: canEdit ? 26 : 0,
                }}>
                  <RateField label="Curriculum">
                    <select
                      className="apple-input apple-select"
                      value={r.curriculum}
                      onChange={(e) => updateRow(r.id, { curriculum: e.target.value })}
                      disabled={locked || isSaving}
                      style={{ fontSize: 13 }}
                    >
                      {CURRICULA.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </RateField>
                  <RateField label="Level">
                    <select
                      className="apple-input apple-select"
                      value={r.level}
                      onChange={(e) => updateRow(r.id, { level: e.target.value })}
                      disabled={locked || isSaving}
                      style={{ fontSize: 13 }}
                    >
                      {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </RateField>
                  <RateField label="Grade">
                    <select
                      className="apple-input apple-select"
                      value={r.grade}
                      onChange={(e) => updateRow(r.id, { grade: e.target.value })}
                      disabled={locked || isSaving}
                      style={{ fontSize: 13 }}
                    >
                      {gradeOptions.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </RateField>
                  <RateField label="Subject">
                    <select
                      className="apple-input apple-select"
                      value={r.subject}
                      onChange={(e) => updateRow(r.id, { subject: e.target.value })}
                      disabled={locked || isSaving}
                      style={{ fontSize: 13 }}
                    >
                      {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </RateField>
                  <RateField label="Rate / hr">
                    <input
                      className="apple-input"
                      type="number"
                      min={1}
                      step={50}
                      value={r.ratePerHour}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n) && n > 0) updateRow(r.id, { ratePerHour: n });
                      }}
                      disabled={locked || isSaving}
                      style={{ fontSize: 13, fontWeight: 600, color: NEAR_BLACK }}
                    />
                  </RateField>
                  <RateField label="Currency">
                    <select
                      className="apple-input apple-select"
                      value={r.currency}
                      onChange={(e) => updateRow(r.id, { currency: e.target.value })}
                      disabled={locked || isSaving}
                      style={{ fontSize: 13 }}
                    >
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </RateField>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canEdit && (
        <div style={{ marginTop: 12, padding: 10, background: "#f5f5f7", borderRadius: 8, fontSize: 11, color: MUTED }}>
          Tip: same subject can be quoted at different rates per grade (e.g. IGCSE Biology Grade 9 vs Grade 10).
          Uniqueness key = curriculum + level + grade + subject.
          <br />
          Rates accept a fresh currency per row. No FX conversion is applied.
        </div>
      )}

      {saving && saving !== "new" && (
        <div style={{ position: "fixed", bottom: 16, right: 16, background: BLUE, color: "#fff", padding: "6px 12px", borderRadius: 6, fontSize: 12 }}>
          Saving…
        </div>
      )}
    </div>
  );
}

function RateField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 11, color: MUTED, fontWeight: 500, letterSpacing: 0.2 }}>{label}</span>
      {children}
    </label>
  );
}
