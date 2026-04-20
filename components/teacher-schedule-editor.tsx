"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useStore } from "@/lib/store";
import { BLUE, LIGHT_GRAY, MUTED, NEAR_BLACK, WEEKDAYS, type TeacherAvailabilitySlot } from "@/lib/types";
import { dbRowToTeacherAvailability } from "@/lib/teacher-transforms";

/**
 * Weekly recurring availability editor for `public.teacher_availability`.
 * Mon=0 … Sun=6. Multiple slots per day allowed (a tutor may bracket a break).
 *
 * Refresh strategy:
 *   - `initialLoading` is true only on first mount — background re-fetches
 *     (realtime INSERT, explicit post-delete sync) never show the loading state.
 *   - Time inputs use local draft state + onBlur to persist so there are no
 *     per-keystroke DB round-trips and no realtime churn while typing.
 *   - Selects (timezone) persist on onChange — a single click, so one round-trip.
 *   - Delete is optimistic: slot removed from local state immediately, then
 *     fetchSlots() syncs server truth (realtime DELETE filter can't match
 *     without REPLICA IDENTITY FULL).
 */
interface Props {
  profileId: string;
  canEdit?: boolean;
}

const DEFAULT_TZ = "Asia/Karachi";
const TZ_OPTIONS = [
  "Asia/Karachi", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore",
  "Europe/London", "America/New_York", "Australia/Sydney",
];

function toTime(value: string): string {
  if (/^\d{2}:\d{2}$/.test(value)) return `${value}:00`;
  return value;
}

function toHm(value: string): string {
  return value.slice(0, 5);
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function slotMinutes(start: string, end: string): number {
  return Math.max(0, minutesOf(end) - minutesOf(start));
}

function formatHours(mins: number): string {
  if (mins <= 0) return "0h";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${h}h`;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export default function TeacherScheduleEditor({ profileId, canEdit = true }: Props) {
  const { flash } = useStore();
  const [slots, setSlots] = useState<TeacherAvailabilitySlot[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [addingDay, setAddingDay] = useState<number | null>(null);

  // Local draft state for time inputs being edited.
  // Keyed by slot ID. Cleared on blur after persisting.
  // This prevents per-keystroke DB round-trips and the realtime churn they cause.
  const [draftTimes, setDraftTimes] = useState<Record<string, { start?: string; end?: string }>>({});

  const fetchSlots = useCallback(async () => {
    const { data, error } = await supabase
      .from("teacher_availability")
      .select("*")
      .eq("teacher_profile_id", profileId)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true });
    if (error) {
      flash(`Failed to load schedule: ${error.message}`);
      setSlots([]);
    } else {
      setSlots((data ?? []).map(dbRowToTeacherAvailability));
    }
    setInitialLoading(false);
  }, [profileId, flash]);

  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  useEffect(() => {
    const channel = supabase
      .channel(`teacher-availability-${profileId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "teacher_availability", filter: `teacher_profile_id=eq.${profileId}` },
        () => { fetchSlots(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profileId, fetchSlots]);

  const byDay = useMemo(() => {
    const m: Record<number, TeacherAvailabilitySlot[]> = {};
    for (let d = 0; d < 7; d++) m[d] = [];
    for (const s of slots) m[s.dayOfWeek]?.push(s);
    return m;
  }, [slots]);

  const dayTotals = useMemo(() => {
    const out: Record<number, number> = {};
    for (let d = 0; d < 7; d++) {
      out[d] = (byDay[d] ?? []).reduce((sum, s) => {
        const start = draftTimes[s.id]?.start ?? s.startTime;
        const end   = draftTimes[s.id]?.end   ?? s.endTime;
        return sum + slotMinutes(start, end);
      }, 0);
    }
    return out;
  }, [byDay, draftTimes]);

  const weekTotal = useMemo(
    () => Object.values(dayTotals).reduce((a, b) => a + b, 0),
    [dayTotals]
  );

  const addSlot = async (dayOfWeek: number) => {
    setAddingDay(dayOfWeek);
    const { error } = await supabase.from("teacher_availability").insert({
      teacher_profile_id: profileId,
      day_of_week: dayOfWeek,
      start_time: "16:00:00",
      end_time: "18:00:00",
      timezone: DEFAULT_TZ,
    });
    setAddingDay(null);
    if (error) flash(`Save failed: ${error.message}`);
  };

  const persistSlot = async (id: string, patch: Partial<Omit<TeacherAvailabilitySlot, "id" | "teacherProfileId">>) => {
    const current = slots.find((s) => s.id === id);
    if (!current) return;

    const nextStart = patch.startTime !== undefined ? toTime(patch.startTime) : current.startTime;
    const nextEnd   = patch.endTime   !== undefined ? toTime(patch.endTime)   : current.endTime;
    if (minutesOf(nextEnd) <= minutesOf(nextStart)) {
      flash("End time must be after start time");
      // Reset draft to server values so the input snaps back.
      setDraftTimes((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }

    setSaving(id);
    const dbPatch: Record<string, unknown> = {};
    if (patch.dayOfWeek !== undefined) dbPatch.day_of_week = patch.dayOfWeek;
    if (patch.startTime !== undefined) dbPatch.start_time = toTime(patch.startTime);
    if (patch.endTime !== undefined) dbPatch.end_time = toTime(patch.endTime);
    if (patch.timezone !== undefined) dbPatch.timezone = patch.timezone;
    if (patch.notes !== undefined) dbPatch.notes = patch.notes;
    const { error } = await supabase.from("teacher_availability").update(dbPatch).eq("id", id);
    setSaving(null);
    if (error) {
      if (error.message.includes("check")) flash("End time must be after start time");
      else flash(`Save failed: ${error.message}`);
      setDraftTimes((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const deleteSlot = async (id: string) => {
    setSlots((prev) => prev.filter((s) => s.id !== id));
    setDraftTimes((prev) => { const next = { ...prev }; delete next[id]; return next; });
    const { error } = await supabase.from("teacher_availability").delete().eq("id", id);
    if (error) {
      flash(`Delete failed: ${error.message}`);
      fetchSlots();
    } else {
      // Explicit sync: DELETE realtime events carry only the PK so the
      // teacher_profile_id filter never matches without REPLICA IDENTITY FULL.
      fetchSlots();
    }
  };

  if (initialLoading) return <div style={{ color: MUTED, padding: 16 }}>Loading schedule…</div>;

  return (
    <div>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        marginBottom: 14,
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: NEAR_BLACK }}>Weekly availability</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
            Recurring time slots per day. Multiple slots per day are allowed.
          </div>
        </div>
        <div style={{
          padding: "6px 14px",
          background: LIGHT_GRAY,
          borderRadius: 980,
          fontSize: 12,
          fontWeight: 500,
          color: weekTotal === 0 ? MUTED : NEAR_BLACK,
          whiteSpace: "nowrap",
        }}>
          Total · <span style={{ color: weekTotal === 0 ? MUTED : BLUE }}>{formatHours(weekTotal)}</span> / week
        </div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {WEEKDAYS.map((label, dow) => {
          const daySlots = byDay[dow];
          const minutes = dayTotals[dow];
          const empty = daySlots.length === 0;
          return (
            <div
              key={dow}
              style={{
                border: "1px solid #e8e8ed",
                borderRadius: 10,
                padding: 12,
                background: empty ? "#fafafa" : "#fff",
              }}
            >
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
                marginBottom: empty ? 0 : 10,
              }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: NEAR_BLACK }}>{label}</span>
                  {!empty && (
                    <span style={{ fontSize: 11, color: MUTED }}>
                      {daySlots.length} slot{daySlots.length === 1 ? "" : "s"} · {formatHours(minutes)}
                    </span>
                  )}
                  {empty && (
                    <span style={{ fontSize: 11, color: MUTED, fontStyle: "italic" }}>Not available</span>
                  )}
                </div>
                {canEdit && (
                  <button
                    onClick={() => addSlot(dow)}
                    disabled={addingDay === dow}
                    style={{
                      background: "none",
                      border: `1px solid ${BLUE}`,
                      color: BLUE,
                      padding: "4px 12px",
                      borderRadius: 980,
                      fontSize: 11,
                      fontWeight: 500,
                      cursor: addingDay === dow ? "wait" : "pointer",
                    }}
                  >
                    {addingDay === dow ? "Adding…" : "+ Add slot"}
                  </button>
                )}
              </div>

              {!empty && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {daySlots.map((s) => {
                    const isSaving = saving === s.id;
                    const draftStart = draftTimes[s.id]?.start ?? toHm(s.startTime);
                    const draftEnd   = draftTimes[s.id]?.end   ?? toHm(s.endTime);
                    const invalid = minutesOf(draftEnd) <= minutesOf(draftStart);
                    return (
                      <div
                        key={s.id}
                        style={{
                          position: "relative",
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          gap: 8,
                          padding: "10px 36px 10px 12px",
                          background: LIGHT_GRAY,
                          border: `1px solid ${invalid ? "#E24B4A" : "#e8e8ed"}`,
                          borderRadius: 8,
                          opacity: isSaving ? 0.6 : 1,
                          transition: "opacity 120ms, border-color 120ms",
                        }}
                      >
                        <input
                          className="apple-input"
                          type="time"
                          value={draftStart}
                          onChange={(e) =>
                            setDraftTimes((prev) => ({
                              ...prev,
                              [s.id]: { ...prev[s.id], start: e.target.value },
                            }))
                          }
                          onBlur={(e) => {
                            const val = e.target.value;
                            setDraftTimes((prev) => {
                              const next = { ...prev };
                              delete next[s.id];
                              return next;
                            });
                            if (val !== toHm(s.startTime)) persistSlot(s.id, { startTime: val });
                          }}
                          disabled={!canEdit || isSaving}
                          aria-label="Start time"
                          style={{ width: 120, fontSize: 13 }}
                        />
                        <span style={{ color: MUTED, fontSize: 13 }}>—</span>
                        <input
                          className="apple-input"
                          type="time"
                          value={draftEnd}
                          onChange={(e) =>
                            setDraftTimes((prev) => ({
                              ...prev,
                              [s.id]: { ...prev[s.id], end: e.target.value },
                            }))
                          }
                          onBlur={(e) => {
                            const val = e.target.value;
                            setDraftTimes((prev) => {
                              const next = { ...prev };
                              delete next[s.id];
                              return next;
                            });
                            if (val !== toHm(s.endTime)) persistSlot(s.id, { endTime: val });
                          }}
                          disabled={!canEdit || isSaving}
                          aria-label="End time"
                          style={{ width: 120, fontSize: 13 }}
                        />
                        <select
                          className="apple-input apple-select"
                          value={s.timezone}
                          onChange={(e) => persistSlot(s.id, { timezone: e.target.value })}
                          disabled={!canEdit || isSaving}
                          aria-label="Timezone"
                          style={{ fontSize: 13, flex: "1 1 160px", minWidth: 160 }}
                        >
                          {TZ_OPTIONS.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                        </select>
                        {!invalid && (
                          <span style={{ fontSize: 11, color: MUTED, whiteSpace: "nowrap" }}>
                            {formatHours(slotMinutes(draftStart, draftEnd))}
                          </span>
                        )}
                        {invalid && (
                          <span style={{ fontSize: 11, color: "#B71C1C", whiteSpace: "nowrap", fontWeight: 500 }}>
                            End must be after start
                          </span>
                        )}
                        {canEdit && (
                          <button
                            onClick={() => deleteSlot(s.id)}
                            disabled={isSaving}
                            aria-label="Delete slot"
                            title="Delete slot"
                            style={{
                              position: "absolute",
                              top: 6,
                              right: 6,
                              width: 26,
                              height: 26,
                              background: "none",
                              border: "none",
                              color: isSaving ? MUTED : "#B71C1C",
                              fontSize: 20,
                              lineHeight: 1,
                              padding: 0,
                              borderRadius: 6,
                              cursor: isSaving ? "wait" : "pointer",
                            }}
                          >×</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {canEdit && (
        <div style={{ marginTop: 12, padding: 10, background: LIGHT_GRAY, borderRadius: 8, fontSize: 11, color: MUTED }}>
          Tip: times are in the timezone picked per slot — no conversion is applied. Overlaps inside the same day are allowed (v1).
        </div>
      )}
    </div>
  );
}
