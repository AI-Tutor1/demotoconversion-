"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { Field } from "@/components/ui";
import {
  BLUE,
  LIGHT_GRAY,
  MUTED,
  SUBJECTS,
  type TeacherProfile,
} from "@/lib/types";
import { teacherFullName } from "@/lib/teacher-transforms";
import TeacherRatesEditor from "@/components/teacher-rates-editor";
import TeacherScheduleEditor from "@/components/teacher-schedule-editor";

/**
 * /teachers/[id] — teacher profile page.
 *
 * Tabs: Profile · Rates · Schedule · Demos · Interview
 *
 * Edit rights per permission matrix:
 *   hr, manager → everything (including interview fields)
 *   analyst     → non-sensitive fields via update_teacher_profile RPC
 *                (tid, status, approval columns blocked server-side)
 *   sales_agent → read-only
 *
 * The Demos tab reuses the existing `demos` state from the store, filtered
 * by tid. Product log is deferred — it ties to sessions data and requires
 * the /teachers page refactor we do in Phase 8.
 */

type Tab = "profile" | "rates" | "schedule" | "demos" | "interview";

const TABS: { key: Tab; label: string }[] = [
  { key: "profile",   label: "Profile" },
  { key: "rates",     label: "Rates" },
  { key: "schedule",  label: "Schedule" },
  { key: "demos",     label: "Demos" },
  { key: "interview", label: "Interview" },
];

type PageProps = { params: Promise<{ id: string }> };

export default function TeacherProfilePage({ params }: PageProps) {
  const { id } = use(params);
  const { teacherProfiles, user, demos, updateTeacherProfile, flash } = useStore();
  const [tab, setTab] = useState<Tab>("profile");

  const profile = useMemo(
    () => teacherProfiles.find((p) => p.id === id),
    [teacherProfiles, id]
  );

  if (!profile) {
    return (
      <section style={{ padding: 92, textAlign: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 600 }}>Profile not found.</h1>
        <p style={{ color: MUTED, marginTop: 12 }}>
          This profile may not exist or your role does not permit reading it.
        </p>
        <Link href="/teachers" style={{ color: BLUE }}>← Back to teachers</Link>
      </section>
    );
  }

  const canEdit = user?.role === "hr" || user?.role === "manager" || user?.role === "analyst";
  const canSeeInterview = user?.role === "hr" || user?.role === "manager";
  const displayTabs = TABS.filter((t) => t.key !== "interview" || canSeeInterview);

  const teacherDemos = useMemo(
    () => (profile.tid == null ? [] : demos.filter((d) => d.tid === profile.tid)),
    [demos, profile.tid]
  );

  return (
    <>
      <section style={{ background: LIGHT_GRAY, paddingTop: 92, paddingBottom: 32 }}>
        <div className="animate-fade-up" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
          <Link href="/teachers" style={{ color: BLUE, fontSize: 13 }}>← All teachers</Link>
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 36, fontWeight: 600, lineHeight: 1.1, margin: 0 }}>
              {teacherFullName(profile)}
            </h1>
            <StatusChip status={profile.status} />
          </div>
          <div style={{ display: "flex", gap: 20, marginTop: 10, color: MUTED, fontSize: 13, flexWrap: "wrap" }}>
            <div>Tutor ID · <strong style={{ color: "#1d1d1f" }}>{profile.tid ?? "—"}</strong></div>
            <div>HR# · {profile.hrApplicationNumber}</div>
            {profile.approvedAt && (
              <div>Approved · {new Date(profile.approvedAt).toLocaleDateString()}</div>
            )}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginTop: 24, borderBottom: "1px solid #e5e5e5", marginBottom: -1 }}>
            {displayTabs.map((t) => {
              const active = t.key === tab;
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
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section style={{ background: "#fff", padding: "32px 24px 80px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          {tab === "profile" && (
            <ProfileTab profile={profile} canEdit={canEdit} onSave={updateTeacherProfile} flash={flash} />
          )}
          {tab === "rates"    && <TeacherRatesEditor profileId={profile.id} canEdit={canEdit} />}
          {tab === "schedule" && <TeacherScheduleEditor profileId={profile.id} canEdit={canEdit} />}
          {tab === "demos"    && <DemosTab teacherName={teacherFullName(profile)} demos={teacherDemos} />}
          {tab === "interview" && canSeeInterview && <InterviewTab profile={profile} />}
        </div>
      </section>
    </>
  );
}

// ─── Tabs ──────────────────────────────────────────────────

function StatusChip({ status }: { status: TeacherProfile["status"] }) {
  const map: Record<string, { bg: string; c: string }> = {
    candidate:           { bg: "#E3F2FD", c: "#0D47A1" },
    interview_scheduled: { bg: "#FFF3E0", c: "#E65100" },
    pending:             { bg: "#FFF8E1", c: "#8B6914" },
    approved:            { bg: "#E8F5E9", c: "#1B5E20" },
    rejected:            { bg: "#FFEBEE", c: "#B71C1C" },
    archived:            { bg: "#ECEFF1", c: "#37474F" },
  };
  const s = map[status] ?? map.candidate;
  return (
    <span style={{ padding: "4px 12px", borderRadius: 980, fontSize: 12, fontWeight: 500, background: s.bg, color: s.c }}>
      {status.replace("_", " ")}
    </span>
  );
}

interface ProfileTabProps {
  profile: TeacherProfile;
  canEdit: boolean;
  onSave: (id: string, payload: Partial<TeacherProfile>) => Promise<{ ok: true } | { ok: false; error: string }>;
  flash: (msg: string) => void;
}

function ProfileTab({ profile, canEdit, onSave, flash }: ProfileTabProps) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    firstName: profile.firstName,
    lastName: profile.lastName === "—" ? "" : profile.lastName,
    email: profile.email ?? "",
    phoneNumber: profile.phoneNumber.startsWith("UNKNOWN-") ? "" : profile.phoneNumber,
    cvLink: profile.cvLink ?? "",
    qualification: profile.qualification ?? "",
    subjectsInterested: profile.subjectsInterested,
  });

  const update = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const toggleSubject = (s: string) =>
    setForm((prev) => ({
      ...prev,
      subjectsInterested: prev.subjectsInterested.includes(s)
        ? prev.subjectsInterested.filter((x) => x !== s)
        : [...prev.subjectsInterested, s],
    }));

  const save = async () => {
    setBusy(true);
    const res = await onSave(profile.id, {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim() || "—",
      email: form.email.trim() || null,
      phoneNumber: form.phoneNumber.trim() || profile.phoneNumber,
      cvLink: form.cvLink.trim() || null,
      qualification: form.qualification.trim() || null,
      subjectsInterested: form.subjectsInterested,
    });
    setBusy(false);
    if (!res.ok) {
      flash(`Save failed: ${res.error}`);
      return;
    }
    flash("Profile updated");
    setEditing(false);
  };

  if (!editing) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Profile</div>
          {canEdit && (
            <button onClick={() => setEditing(true)} className="pill pill-outline" style={{ border: "1px solid #d2d2d7", cursor: "pointer" }}>
              Edit
            </button>
          )}
        </div>
        <div style={{ display: "grid", gap: 10, fontSize: 13 }}>
          <InfoLine label="First name"    value={profile.firstName} />
          <InfoLine label="Last name"     value={profile.lastName === "—" ? "" : profile.lastName} />
          <InfoLine label="Email"         value={profile.email ?? ""} />
          <InfoLine label="Phone"         value={profile.phoneNumber.startsWith("UNKNOWN-") ? "" : profile.phoneNumber} />
          <InfoLine label="Qualification" value={profile.qualification ?? ""} />
          <InfoLine label="CV link"       value={profile.cvLink ?? ""} href={profile.cvLink ?? undefined} />
          <InfoLine label="Subjects"      value={profile.subjectsInterested.join(", ")} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Edit profile</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="First name *"><input className="apple-input" value={form.firstName} onChange={(e) => update("firstName", e.target.value)} /></Field>
        <Field label="Last name"><input className="apple-input" value={form.lastName} onChange={(e) => update("lastName", e.target.value)} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Phone"><input className="apple-input" value={form.phoneNumber} onChange={(e) => update("phoneNumber", e.target.value)} placeholder="+92 …" /></Field>
        <Field label="Email"><input className="apple-input" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} /></Field>
      </div>
      <Field label="Qualification"><input className="apple-input" value={form.qualification} onChange={(e) => update("qualification", e.target.value)} /></Field>
      <Field label="CV link"><input className="apple-input" value={form.cvLink} onChange={(e) => update("cvLink", e.target.value)} placeholder="https://…" /></Field>
      <Field label={`Subjects${form.subjectsInterested.length ? ` (${form.subjectsInterested.length})` : ""}`}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {SUBJECTS.map((s) => {
            const active = form.subjectsInterested.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleSubject(s)}
                className={active ? "pill pill-blue" : "pill pill-outline"}
                style={{ border: active ? "none" : "1px solid #d2d2d7", cursor: "pointer" }}
              >
                {s}
              </button>
            );
          })}
        </div>
      </Field>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={() => setEditing(false)} className="pill pill-outline" style={{ border: "1px solid #d2d2d7", cursor: "pointer" }}>Cancel</button>
        <button onClick={save} disabled={busy} className="pill pill-blue" style={{ border: "none", background: BLUE, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 }}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function InfoLine({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12 }}>
      <div style={{ color: MUTED, fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 13 }}>
        {href ? <a href={href} target="_blank" rel="noreferrer" style={{ color: BLUE }}>{value || "—"}</a> : (value || "—")}
      </div>
    </div>
  );
}

function DemosTab({ teacherName, demos }: { teacherName: string; demos: import("@/lib/types").Demo[] }) {
  if (demos.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: MUTED, background: LIGHT_GRAY, borderRadius: 12 }}>
        No demos on record for {teacherName}.
      </div>
    );
  }
  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Demos ({demos.length})</div>
      <div style={{ display: "grid", gap: 8 }}>
        {demos.slice(0, 50).map((d) => (
          <div key={d.id} style={{ padding: "10px 14px", border: "1px solid #f0f0f0", borderRadius: 10, display: "grid", gridTemplateColumns: "110px 1fr 140px 120px", gap: 12, fontSize: 13 }}>
            <div style={{ color: MUTED }}>{d.date}</div>
            <div>{d.student} · {d.subject}</div>
            <div style={{ color: MUTED }}>{d.level}</div>
            <div style={{ color: MUTED }}>{d.status}</div>
          </div>
        ))}
        {demos.length > 50 && (
          <div style={{ color: MUTED, fontSize: 12, textAlign: "center", marginTop: 8 }}>
            Showing 50 of {demos.length}. Use /analyst or /conducted for the full list.
          </div>
        )}
      </div>
    </div>
  );
}

function InterviewTab({ profile }: { profile: TeacherProfile }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {profile.interviewRecordingLink ? (
        <InfoLine label="Recording" value={profile.interviewRecordingLink} href={profile.interviewRecordingLink} />
      ) : (
        <div style={{ color: MUTED }}>No interview recording on file.</div>
      )}
      {profile.interviewNotes && (
        <div>
          <div style={{ color: MUTED, fontSize: 12, marginBottom: 6 }}>Interview notes</div>
          <pre style={{ padding: 12, background: "#fafafa", borderRadius: 8, fontSize: 12, whiteSpace: "pre-wrap" }}>{profile.interviewNotes}</pre>
        </div>
      )}
      {profile.teachingMatrix && profile.teachingMatrix.length > 0 && (
        <div>
          <div style={{ color: MUTED, fontSize: 12, marginBottom: 6 }}>Teaching matrix</div>
          <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
            {profile.teachingMatrix.map((m, i) => (
              <div key={i}>{m.curriculum} · {m.level} · {m.subject}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
