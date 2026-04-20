"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import {
  BLUE, CURRICULA, GRADES, LEVELS, LIGHT_GRAY, MUTED, SUBJECTS, TEACHER_TIERS,
  type TeacherAvailabilitySlot, type TeacherProfile, type TeacherProfileStatus, type TeacherRate,
} from "@/lib/types";
import {
  dbRowToTeacherAvailability, dbRowToTeacherRate, teacherFullName,
} from "@/lib/teacher-transforms";
import { supabase } from "@/lib/supabase";
import { SearchableSelect } from "@/components/searchable-select";
import HrCandidateForm from "@/components/hr-candidate-form";
import HrInterviewDrawer from "@/components/hr-interview-drawer";

/**
 * /hr — HR workspace.
 * Tabs: Candidates · Pending · Approved · Rejected (counts in chips)
 * Row click → HrInterviewDrawer. "+ New Candidate" → HrCandidateForm.
 * Route-gated by middleware.ts to hr + manager.
 */

type TabKey = "candidates" | "pending" | "approved" | "rejected";

const TABS: { key: TabKey; label: string; statuses: TeacherProfileStatus[] }[] = [
  { key: "candidates", label: "Candidates", statuses: ["candidate", "interview_scheduled"] },
  { key: "pending",    label: "Pending",    statuses: ["pending"] },
  { key: "approved",   label: "Approved",   statuses: ["approved"] },
  { key: "rejected",   label: "Rejected",   statuses: ["rejected", "archived"] },
];

const GRID = "1.4fr 110px 200px 170px 120px 150px 80px 120px 70px";

function slotHours(s: TeacherAvailabilitySlot): number {
  const [sh, sm] = s.startTime.split(":").map(Number);
  const [eh, em] = s.endTime.split(":").map(Number);
  return (eh * 60 + em - sh * 60 - sm) / 60;
}

function weeklyHoursSummary(slots: TeacherAvailabilitySlot[]): { label: string; hasSlots: boolean } {
  if (!slots.length) return { label: "No vacant slots", hasSlots: false };
  const total = slots.reduce((sum, s) => sum + slotHours(s), 0);
  return { label: `${Math.round(total)} hrs / wk`, hasSlots: true };
}

function rateSummary(rates: TeacherRate[]): string {
  if (!rates.length) return "—";
  const min = Math.min(...rates.map((r) => r.ratePerHour));
  const max = Math.max(...rates.map((r) => r.ratePerHour));
  const currency = rates[0].currency ?? "PKR";
  return min === max ? `${currency} ${min}` : `${currency} ${min}–${max}`;
}

const FILTER_ITEMS = [
  { key: "tier",       placeholder: "Tier",       clearLabel: "All tiers",     options: TEACHER_TIERS },
  { key: "subject",    placeholder: "Subject",    clearLabel: "All subjects",  options: SUBJECTS },
  { key: "curriculum", placeholder: "Curriculum", clearLabel: "All curricula", options: CURRICULA },
  { key: "level",      placeholder: "Level",      clearLabel: "All levels",    options: LEVELS },
  { key: "grade",      placeholder: "Grade",      clearLabel: "All grades",    options: GRADES },
] as const;

type FilterKey = typeof FILTER_ITEMS[number]["key"];

function toOpts(arr: readonly string[]) {
  return arr.map((v) => ({ value: v, label: v }));
}

export default function HrPage() {
  const { teacherProfiles, user } = useStore();
  const [tab, setTab] = useState<TabKey>("candidates");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [openProfile, setOpenProfile] = useState<TeacherProfile | null>(null);
  const [filters, setFilters] = useState<Record<FilterKey, string>>({
    tier: "", subject: "", curriculum: "", level: "", grade: "",
  });
  const [ratesByProfileId, setRatesByProfileId] = useState<Record<string, TeacherRate[]>>({});
  const [availByProfileId, setAvailByProfileId] = useState<Record<string, TeacherAvailabilitySlot[]>>({});

  const canAccess = user?.role === "hr" || user?.role === "manager";
  const hasFilters = Object.values(filters).some(Boolean);

  const setFilter = (key: FilterKey, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));
  const clearFilters = () =>
    setFilters({ tier: "", subject: "", curriculum: "", level: "", grade: "" });

  const fetchRatesAndAvailability = useCallback(async () => {
    const [{ data: rateRows }, { data: availRows }] = await Promise.all([
      supabase.from("teacher_rates").select("*"),
      supabase.from("teacher_availability").select("*"),
    ]);
    if (rateRows) {
      const map: Record<string, TeacherRate[]> = {};
      for (const r of rateRows) {
        const id = r.teacher_profile_id as string;
        if (!map[id]) map[id] = [];
        map[id].push(dbRowToTeacherRate(r));
      }
      setRatesByProfileId(map);
    }
    if (availRows) {
      const map: Record<string, TeacherAvailabilitySlot[]> = {};
      for (const r of availRows) {
        const id = r.teacher_profile_id as string;
        if (!map[id]) map[id] = [];
        map[id].push(dbRowToTeacherAvailability(r));
      }
      setAvailByProfileId(map);
    }
  }, []);

  useEffect(() => {
    if (canAccess) fetchRatesAndAvailability();
  }, [canAccess, fetchRatesAndAvailability]);

  const byTab = useMemo(() => {
    const m: Record<TabKey, TeacherProfile[]> = {
      candidates: [], pending: [], approved: [], rejected: [],
    };
    for (const t of TABS) {
      for (const p of teacherProfiles) {
        if (t.statuses.includes(p.status)) m[t.key].push(p);
      }
    }
    return m;
  }, [teacherProfiles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return byTab[tab].filter((p) => {
      if (q) {
        const name = teacherFullName(p).toLowerCase();
        const textMatch =
          name.includes(q) ||
          (p.hrApplicationNumber ?? "").toLowerCase().includes(q) ||
          (p.phoneNumber ?? "").toLowerCase().includes(q) ||
          (p.email ?? "").toLowerCase().includes(q) ||
          (p.tid?.toString() ?? "").includes(q);
        if (!textMatch) return false;
      }
      if (filters.tier && (p.tier ?? "") !== filters.tier) return false;
      if (filters.subject && !p.subjectsInterested.includes(filters.subject) && !p.teachingMatrix.some((m) => m.subject === filters.subject)) return false;
      if (filters.curriculum && !p.teachingMatrix.some((m) => m.curriculum === filters.curriculum)) return false;
      if (filters.level && !p.teachingMatrix.some((m) => m.level === filters.level)) return false;
      if (filters.grade && !p.teachingMatrix.some((m) => (m.grade ?? "") === filters.grade)) return false;
      return true;
    });
  }, [byTab, tab, search, filters]);

  if (!canAccess) {
    return (
      <section style={{ padding: 80, textAlign: "center", color: MUTED }}>
        You do not have access to this page.
      </section>
    );
  }

  return (
    <>
      <section style={{ background: LIGHT_GRAY, paddingTop: 92, paddingBottom: 40 }}>
        <div className="animate-fade-up" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>
          <p className="section-label">HR</p>
          <h1 style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>Teacher onboarding.</h1>
          <p style={{ color: MUTED, marginTop: 8, fontSize: 15 }}>
            Intake, interview, and approve tutors. Only approved tutors surface to analyst + sales.
          </p>
        </div>
      </section>

      <section style={{ background: "#fff", padding: "40px 24px 80px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>

          {/* Tabs */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #f0f0f0" }}>
              {TABS.map((t) => {
                const active = t.key === tab;
                const count = byTab[t.key].length;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    style={{
                      padding: "10px 16px", border: "none", background: "none",
                      borderBottom: active ? `2px solid ${BLUE}` : "2px solid transparent",
                      color: active ? BLUE : MUTED,
                      fontSize: 14, fontWeight: active ? 600 : 500,
                      cursor: "pointer", marginBottom: -1,
                    }}
                  >
                    {t.label}
                    <span style={{
                      marginLeft: 8, fontSize: 11,
                      background: active ? BLUE : "#e5e5e5",
                      color: active ? "#fff" : MUTED,
                      padding: "1px 8px", borderRadius: 980,
                    }}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setShowForm(true)} className="pill pill-blue" style={{ border: "none", background: BLUE, cursor: "pointer" }}>
              + New candidate
            </button>
          </div>

          {/* Search + count */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 14, alignItems: "center" }}>
            <input
              className="apple-input"
              placeholder="Search by name, HR#, phone, email, tutor ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: 340, fontSize: 14, flex: "1 1 260px" }}
            />
            <span style={{ color: MUTED, fontSize: 13, marginLeft: "auto" }}>
              {filtered.length} candidate{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Inline pill filters */}
          <div style={{
            display: "flex", flexWrap: "wrap", gap: 8,
            marginBottom: 20, alignItems: "center",
          }}>
            {FILTER_ITEMS.map(({ key, placeholder, clearLabel, options }) => {
              const active = !!filters[key];
              return (
                <SearchableSelect
                  key={key}
                  options={toOpts(options)}
                  value={filters[key]}
                  onChange={(v) => setFilter(key, v)}
                  placeholder={placeholder}
                  clearLabel={clearLabel}
                  variant="light"
                  buttonClassName={active ? "pill pill-blue" : "pill pill-outline"}
                />
              );
            })}
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                style={{
                  border: "none", background: "transparent",
                  color: MUTED, fontSize: 13, fontWeight: 500,
                  padding: "6px 10px", cursor: "pointer",
                  marginLeft: 4,
                }}
              >
                ✕ Clear all
              </button>
            )}
          </div>

          {/* Table — header always visible; rows OR in-table empty message below */}
          <div style={{ border: "1px solid #f0f0f0", borderRadius: 12, overflow: "hidden", overflowX: "auto" }}>
            <div style={{ minWidth: 980 }}>
              {/* Header */}
              <div style={{
                display: "grid", gridTemplateColumns: GRID, gap: 8,
                padding: "10px 16px", background: "#fafafa",
                fontSize: 11, fontWeight: 600, color: MUTED,
                textTransform: "uppercase", letterSpacing: "0.04em",
              }}>
                <div>Name</div>
                <div>HR#</div>
                <div>Subjects</div>
                <div>Curricula</div>
                <div>Rate / hr</div>
                <div>Availability</div>
                <div>Tier</div>
                <div>Status</div>
                <div>Tutor ID</div>
              </div>

              {/* Rows OR empty state */}
              {filtered.length === 0 ? (
                <div style={{
                  padding: "48px 24px",
                  textAlign: "center",
                  color: MUTED,
                  background: "#fff",
                  borderTop: "1px solid #f5f5f7",
                  fontSize: 14,
                }}>
                  {search.trim() || hasFilters
                    ? "No candidates match your filters."
                    : `No ${tab}.`}
                </div>
              ) : (
                filtered.map((p) => {
                  const subjects  = [...new Set(p.teachingMatrix.map((m) => m.subject).filter(Boolean))];
                  const curricula = [...new Set(p.teachingMatrix.map((m) => m.curriculum).filter(Boolean))];
                  const rates     = ratesByProfileId[p.id] ?? [];
                  const slots     = availByProfileId[p.id] ?? [];
                  const avail     = weeklyHoursSummary(slots);
                  return (
                    <button
                      key={p.id}
                      onClick={() => setOpenProfile(p)}
                      style={{
                        display: "grid", gridTemplateColumns: GRID, gap: 8,
                        width: "100%", minWidth: 980,
                        padding: "12px 16px", background: "#fff",
                        border: "none", borderTop: "1px solid #f5f5f7",
                        textAlign: "left", cursor: "pointer", fontSize: 13,
                        alignItems: "center",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#fafafa"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
                    >
                      {/* Name */}
                      <div style={{ fontWeight: 500 }}>{teacherFullName(p)}</div>

                      {/* HR# */}
                      <div style={{ color: MUTED, fontSize: 12 }}>{p.hrApplicationNumber}</div>

                      {/* Subjects */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                        {subjects.length === 0 ? (
                          <span style={{ color: MUTED }}>—</span>
                        ) : (
                          <>
                            {subjects.slice(0, 2).map((s) => (
                              <span key={s} style={{
                                fontSize: 11, background: "#e8f0fd", color: BLUE,
                                padding: "2px 7px", borderRadius: 980, fontWeight: 500,
                              }}>{s}</span>
                            ))}
                            {subjects.length > 2 && (
                              <span style={{ fontSize: 11, color: MUTED }}>+{subjects.length - 2}</span>
                            )}
                          </>
                        )}
                      </div>

                      {/* Curricula */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                        {curricula.length === 0 ? (
                          <span style={{ color: MUTED }}>—</span>
                        ) : (
                          <>
                            {curricula.slice(0, 2).map((c) => (
                              <span key={c} style={{
                                fontSize: 11, background: LIGHT_GRAY, color: "#1d1d1f",
                                padding: "2px 7px", borderRadius: 980, fontWeight: 500,
                              }}>{c}</span>
                            ))}
                            {curricula.length > 2 && (
                              <span style={{ fontSize: 11, color: MUTED }}>+{curricula.length - 2}</span>
                            )}
                          </>
                        )}
                      </div>

                      {/* Rate / hr */}
                      <div style={{ fontSize: 12, fontWeight: rates.length > 0 ? 500 : 400, color: rates.length > 0 ? "#1d1d1f" : MUTED }}>
                        {rateSummary(rates)}
                      </div>

                      {/* Availability */}
                      <div>
                        <span style={{
                          fontSize: 11, fontWeight: 500,
                          padding: "3px 9px", borderRadius: 980,
                          background: avail.hasSlots ? "#e8f0fd" : LIGHT_GRAY,
                          color: avail.hasSlots ? BLUE : MUTED,
                        }}>
                          {avail.label}
                        </span>
                      </div>

                      {/* Tier */}
                      <div>
                        {p.tier ? (
                          <span style={{
                            fontSize: 11, fontWeight: 600,
                            background: BLUE, color: "#fff",
                            padding: "2px 8px", borderRadius: 980,
                          }}>
                            {p.tier}
                          </span>
                        ) : (
                          <span style={{ color: MUTED }}>—</span>
                        )}
                      </div>

                      {/* Status */}
                      <div style={{ color: MUTED, fontSize: 12, textTransform: "capitalize" }}>
                        {p.status.replace(/_/g, " ")}
                      </div>

                      {/* Tutor ID */}
                      <div style={{ color: MUTED, fontSize: 12 }}>{p.tid ?? "—"}</div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </section>

      {showForm && <HrCandidateForm onClose={() => setShowForm(false)} />}
      {openProfile && <HrInterviewDrawer profile={openProfile} onClose={() => setOpenProfile(null)} />}
    </>
  );
}
