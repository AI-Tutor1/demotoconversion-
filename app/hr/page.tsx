"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { BLUE, CURRICULA, GRADES, LEVELS, LIGHT_GRAY, MUTED, SUBJECTS, TEACHER_TIERS, type TeacherProfile, type TeacherProfileStatus } from "@/lib/types";
import { teacherFullName } from "@/lib/teacher-transforms";
import HrCandidateForm from "@/components/hr-candidate-form";
import HrInterviewDrawer from "@/components/hr-interview-drawer";

/**
 * /hr — HR workspace.
 *
 * Tabs: Candidates · Pending · Approved · Rejected (counts in chips)
 * Row click → HrInterviewDrawer (interview + rates + schedule + decision).
 * "+ New Candidate" → HrCandidateForm (intake form).
 *
 * Route-gated by middleware.ts to hr + manager. Analysts / sales never see
 * this page even via direct URL.
 */

type TabKey = "candidates" | "pending" | "approved" | "rejected";

const TABS: { key: TabKey; label: string; statuses: TeacherProfileStatus[] }[] = [
  { key: "candidates", label: "Candidates", statuses: ["candidate", "interview_scheduled"] },
  { key: "pending",    label: "Pending",    statuses: ["pending"] },
  { key: "approved",   label: "Approved",   statuses: ["approved"] },
  { key: "rejected",   label: "Rejected",   statuses: ["rejected", "archived"] },
];

export default function HrPage() {
  const { teacherProfiles, user } = useStore();
  const [tab, setTab] = useState<TabKey>("candidates");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [openProfile, setOpenProfile] = useState<TeacherProfile | null>(null);
  const [fSubject, setFSubject] = useState("");
  const [fLevel, setFLevel] = useState("");
  const [fCurriculum, setFCurriculum] = useState("");
  const [fGrade, setFGrade] = useState("");
  const [fTier, setFTier] = useState("");

  const canAccess = user?.role === "hr" || user?.role === "manager";

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
      if (fTier && (p.tier ?? "") !== fTier) return false;
      if (fSubject && !p.subjectsInterested.includes(fSubject) && !p.teachingMatrix.some((m) => m.subject === fSubject)) return false;
      if (fCurriculum && !p.teachingMatrix.some((m) => m.curriculum === fCurriculum)) return false;
      if (fLevel && !p.teachingMatrix.some((m) => m.level === fLevel)) return false;
      if (fGrade && !p.teachingMatrix.some((m) => (m.grade ?? "") === fGrade)) return false;
      return true;
    });
  }, [byTab, tab, search, fSubject, fLevel, fCurriculum, fGrade, fTier]);

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
            Intake, interview, and approve tutors. Only approved tutors surface
            to analyst + sales.
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
                      padding: "10px 16px",
                      border: "none",
                      background: "none",
                      borderBottom: active ? `2px solid ${BLUE}` : "2px solid transparent",
                      color: active ? BLUE : MUTED,
                      fontSize: 14,
                      fontWeight: active ? 600 : 500,
                      cursor: "pointer",
                      marginBottom: -1,
                    }}
                  >
                    {t.label}
                    <span style={{
                      marginLeft: 8,
                      fontSize: 11,
                      background: active ? BLUE : "#e5e5e5",
                      color: active ? "#fff" : MUTED,
                      padding: "1px 8px",
                      borderRadius: 980,
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

          {/* Search + filters */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24, alignItems: "center" }}>
            <input
              className="apple-input"
              placeholder="Search by name, HR#, phone, email, tutor ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 340 }}
            />
            <select className="apple-select" value={fTier} onChange={(e) => setFTier(e.target.value)} style={{ width: 130 }}>
              <option value="">All tiers</option>
              {TEACHER_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="apple-select" value={fSubject} onChange={(e) => setFSubject(e.target.value)} style={{ width: 160 }}>
              <option value="">All subjects</option>
              {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="apple-select" value={fCurriculum} onChange={(e) => setFCurriculum(e.target.value)} style={{ width: 140 }}>
              <option value="">All curricula</option>
              {CURRICULA.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="apple-select" value={fLevel} onChange={(e) => setFLevel(e.target.value)} style={{ width: 140 }}>
              <option value="">All levels</option>
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <select className="apple-select" value={fGrade} onChange={(e) => setFGrade(e.target.value)} style={{ width: 130 }}>
              <option value="">All grades</option>
              {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            {(fTier || fSubject || fCurriculum || fLevel || fGrade) && (
              <button
                onClick={() => { setFTier(""); setFSubject(""); setFCurriculum(""); setFLevel(""); setFGrade(""); }}
                style={{ background: "none", border: "none", color: MUTED, fontSize: 13, cursor: "pointer", textDecoration: "underline" }}
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Rows */}
          {filtered.length === 0 ? (
            <div style={{ padding: 60, textAlign: "center", color: MUTED, background: LIGHT_GRAY, borderRadius: 12 }}>
              {search.trim() ? "No candidates match your search." : `No ${tab}.`}
            </div>
          ) : (
            <div style={{ border: "1px solid #f0f0f0", borderRadius: 12, overflow: "hidden" }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 140px 180px 100px 140px 80px",
                gap: 8,
                padding: "10px 16px",
                background: "#fafafa",
                fontSize: 11,
                fontWeight: 600,
                color: MUTED,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}>
                <div>Name</div>
                <div>HR#</div>
                <div>Phone</div>
                <div>Tier</div>
                <div>Status</div>
                <div>Tutor ID</div>
              </div>
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setOpenProfile(p)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 140px 180px 100px 140px 80px",
                    gap: 8,
                    width: "100%",
                    padding: "12px 16px",
                    background: "#fff",
                    border: "none",
                    borderTop: "1px solid #f5f5f7",
                    textAlign: "left",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#fafafa"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
                >
                  <div style={{ fontWeight: 500 }}>{teacherFullName(p)}</div>
                  <div style={{ color: MUTED }}>{p.hrApplicationNumber}</div>
                  <div style={{ color: MUTED }}>{p.phoneNumber.startsWith("UNKNOWN-") ? "—" : p.phoneNumber}</div>
                  <div>
                    {p.tier ? (
                      <span style={{ fontSize: 11, fontWeight: 600, background: BLUE, color: "#fff", padding: "2px 8px", borderRadius: 980 }}>
                        {p.tier}
                      </span>
                    ) : (
                      <span style={{ color: MUTED }}>—</span>
                    )}
                  </div>
                  <div style={{ color: MUTED }}>{p.status.replace("_", " ")}</div>
                  <div style={{ color: MUTED }}>{p.tid ?? "—"}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {showForm && <HrCandidateForm onClose={() => setShowForm(false)} />}
      {openProfile && <HrInterviewDrawer profile={openProfile} onClose={() => setOpenProfile(null)} />}
    </>
  );
}
