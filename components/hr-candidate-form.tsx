"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Field } from "@/components/ui";
import { BLUE, MUTED, SUBJECTS, TEACHER_TIERS } from "@/lib/types";

/**
 * HrCandidateForm — drawer form for creating (or updating) a teacher candidate.
 *
 * Fields match the HR intake diagram exactly:
 *   HR application number, phone, email, first name, last name, qualification,
 *   CV link, subjects interested.
 *
 * Uniqueness: `hr_application_number` is the primary dedup key (UNIQUE).
 * Re-submitting the same HR# UPDATEs the row instead of erroring.
 */
interface Props {
  onClose: () => void;
  onSuccess?: (id: string) => void;
}

interface FormState {
  hrApplicationNumber: string;
  phoneNumber: string;
  email: string;
  firstName: string;
  lastName: string;
  qualification: string;
  cvLink: string;
  subjectsInterested: string[];
  tier: string;
}

const EMPTY: FormState = {
  hrApplicationNumber: "",
  phoneNumber: "",
  email: "",
  firstName: "",
  lastName: "",
  qualification: "",
  cvLink: "",
  subjectsInterested: [],
  tier: "",
};

export default function HrCandidateForm({ onClose, onSuccess }: Props) {
  const { createTeacherCandidate, flash, logActivity } = useStore();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [busy, setBusy] = useState(false);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
    if (errors[k]) setErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  const toggleSubject = (s: string) => {
    setForm((prev) => {
      const has = prev.subjectsInterested.includes(s);
      return {
        ...prev,
        subjectsInterested: has
          ? prev.subjectsInterested.filter((x) => x !== s)
          : [...prev.subjectsInterested, s],
      };
    });
  };

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.hrApplicationNumber.trim()) e.hrApplicationNumber = "Required";
    if (!form.phoneNumber.trim()) e.phoneNumber = "Required";
    else if (!/^[+\d][\d\s()-]{6,}$/.test(form.phoneNumber.trim())) e.phoneNumber = "Looks invalid";
    if (!form.firstName.trim()) e.firstName = "Required";
    if (!form.lastName.trim()) e.lastName = "Required";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Invalid email";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) {
      flash("Fix the highlighted fields before saving");
      return;
    }
    setBusy(true);
    const res = await createTeacherCandidate({
      hrApplicationNumber: form.hrApplicationNumber.trim(),
      phoneNumber: form.phoneNumber.trim(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim() || null,
      qualification: form.qualification.trim() || null,
      cvLink: form.cvLink.trim() || null,
      subjectsInterested: form.subjectsInterested,
      tier: form.tier || null,
    });
    setBusy(false);
    if (!res.ok) {
      flash(`Save failed: ${res.error}`);
      return;
    }
    flash("Candidate saved");
    logActivity("added HR candidate", `${form.firstName} ${form.lastName}`);
    onSuccess?.(res.id);
    onClose();
  };

  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 100 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" }} />
      <div
        className="animate-slide-in"
        style={{
          position: "absolute", right: 0, top: 0, bottom: 0,
          width: "100%", maxWidth: 520, background: "#fff",
          boxShadow: "-8px 0 28px rgba(0,0,0,0.12)",
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>New candidate</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>Stored against HR application number + phone</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: MUTED }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          <Field label="HR application number *" error={errors.hrApplicationNumber}>
            <input
              className="apple-input"
              value={form.hrApplicationNumber}
              onChange={(e) => update("hrApplicationNumber", e.target.value)}
              placeholder="e.g. HR-2026-001"
            />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="First name *" error={errors.firstName}>
              <input
                className="apple-input"
                value={form.firstName}
                onChange={(e) => update("firstName", e.target.value)}
              />
            </Field>
            <Field label="Last name *" error={errors.lastName}>
              <input
                className="apple-input"
                value={form.lastName}
                onChange={(e) => update("lastName", e.target.value)}
              />
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Phone *" error={errors.phoneNumber}>
              <input
                className="apple-input"
                value={form.phoneNumber}
                onChange={(e) => update("phoneNumber", e.target.value)}
                placeholder="+92 300 1234567"
              />
            </Field>
            <Field label="Email" error={errors.email}>
              <input
                className="apple-input"
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
              />
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Qualification">
              <input
                className="apple-input"
                value={form.qualification}
                onChange={(e) => update("qualification", e.target.value)}
                placeholder="e.g. MSc Physics, LUMS"
              />
            </Field>
            <Field label="Tier allocated">
              <select
                className="apple-select"
                value={form.tier}
                onChange={(e) => update("tier", e.target.value)}
              >
                <option value="">— Select tier —</option>
                {TEACHER_TIERS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="CV link">
            <input
              className="apple-input"
              value={form.cvLink}
              onChange={(e) => update("cvLink", e.target.value)}
              placeholder="https://…"
            />
          </Field>

          <Field label={`Subjects interested${form.subjectsInterested.length ? ` (${form.subjectsInterested.length} selected)` : ""}`}>
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

          <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>
            Interview recording + teaching matrix + scorecard are captured later, in the candidate&apos;s interview drawer.
          </div>
        </div>

        <div style={{ padding: 16, borderTop: "1px solid #f0f0f0", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="pill pill-outline" style={{ border: "1px solid #d2d2d7", cursor: "pointer" }}>Cancel</button>
          <button
            onClick={submit}
            disabled={busy}
            className="pill pill-blue"
            style={{ border: "none", background: BLUE, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 }}
          >
            {busy ? "Saving…" : "Save candidate"}
          </button>
        </div>
      </div>
    </div>
  );
}
