"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  Demo,
  Lead,
  ActivityEntry,
  Notification,
  DemoDraft,
  DemoDraftStatus,
  ApprovedSession,
  TeacherSession,
  TeacherProfile,
} from "./types";
import { SEED_ACTIVITY } from "./data";
import { inDateRange, ageDays } from "./utils";
import { supabase } from "./supabase";
import { dbRowToDemo, dbRowToLead, demoToInsertRow, pourToDbRows, type DemoRow, type RawLeadRow } from "./transforms";
import { dbRowToApprovedSession, dbRowToTeacherSession } from "./review-transforms";
import { dbRowToTeacherProfile } from "./teacher-transforms";
import { createSupabaseSync } from "./supabase-sync";

export interface UserProfile {
  id: string;
  email: string;
  role: "analyst" | "sales_agent" | "manager" | "hr";
  full_name: string;
}

export type AnalyzeResult =
  | { ok: true; draft: DemoDraft }
  | { ok: false; error: string };

export type ProcessRecordingResult =
  | {
      ok: true;
      demoId: number;
      transcriptLength: number;
      durationSeconds: number;
      analysisDraftId: string | null;
      status: "transcribed_and_analyzed" | "transcription_only";
    }
  | { ok: false; error: string };

export type CreateDemoResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

export type CreateLeadResult =
  | { ok: true; id: number; leadNumber: string }
  | { ok: false; error: string };

interface StoreContextType {
  demos: Demo[];
  setDemos: React.Dispatch<React.SetStateAction<Demo[]>>;
  rangedDemos: Demo[];
  dateRange: string;
  setDateRange: (range: string) => void;
  activity: ActivityEntry[];
  logActivity: (action: string, target: string) => void;
  notifications: Notification[];
  toast: string | null;
  flash: (msg: string) => void;
  confirm: { title: string; msg: string; onConfirm: () => void } | null;
  setConfirm: (
    c: { title: string; msg: string; onConfirm: () => void } | null
  ) => void;
  confirmDeleteDemo: (demo: Demo, opts?: { onAfterDelete?: () => void }) => void;
  loading: boolean;
  user: UserProfile | null;
  salesAgents: UserProfile[];
  drafts: DemoDraft[];
  draftsByDemoId: Record<number, DemoDraft | undefined>;
  fetchDraft: (demoId: number) => Promise<DemoDraft | null>;
  triggerAnalyze: (demoId: number) => Promise<AnalyzeResult>;
  triggerProcessRecording: (demoId: number) => Promise<ProcessRecordingResult>;
  createDemo: (demo: Demo) => Promise<CreateDemoResult>;
  approveDraft: (
    draftId: string,
    approvalRate: number,
    status: Extract<DemoDraftStatus, "approved" | "partially_edited">
  ) => Promise<void>;
  rejectDraft: (draftId: string) => Promise<void>;
  finalizeAccountability: (demoId: number, categories: string[]) => Promise<{ ok: true } | { ok: false; error: string }>;
  clearAccountability: (demoId: number) => Promise<{ ok: true } | { ok: false; error: string }>;
  processingDemoIds: Set<number>;
  approvedSessions: ApprovedSession[];
  teacherSessions: TeacherSession[];
  sessionTeachers: { teacherUserName: string; teacherUserId: string | null }[];
  // HR / Teacher onboarding
  teacherProfiles: TeacherProfile[];
  approvedTeachers: TeacherProfile[];
  createTeacherCandidate: (
    payload: Partial<TeacherProfile> & { hrApplicationNumber: string; phoneNumber: string; firstName: string; lastName: string }
  ) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  submitInterview: (
    profileId: string,
    recordingLink: string,
    teachingMatrix: { level: string; subject: string; curriculum: string }[],
    notes: string,
    rubric?: import("./types").InterviewRubric | null
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  finalizeTeacherDecision: (
    profileId: string,
    outcome: "approved" | "pending" | "rejected",
    tid: number | null,
    rejectReason: string | null
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  updateTeacherProfile: (
    profileId: string,
    payload: Partial<TeacherProfile>
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  processHrRecording: (profileId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  leads: Lead[];
  createLead: (studentName: string, leadNumber?: string) => Promise<CreateLeadResult>;
  stats: {
    total: number;
    converted: number;
    pending: number;
    notConv: number;
    rate: number;
    avgR: string;
    pourRate: number;
  };
}

const StoreContext = createContext<StoreContextType | null>(null);

const AI_BACKEND_URL =
  process.env.NEXT_PUBLIC_AI_BACKEND_URL ?? "http://localhost:8000";

export function StoreProvider({ children }: { children: ReactNode }) {
  const [demos, setDemosRaw] = useState<Demo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState("all");
  const [toast, setToast] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<StoreContextType["confirm"]>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>(SEED_ACTIVITY);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [salesAgents, setSalesAgents] = useState<UserProfile[]>([]);
  const [drafts, setDrafts] = useState<DemoDraft[]>([]);
  const [processingDemoIds, setProcessingDemoIds] = useState<Set<number>>(new Set());
  const [approvedSessions, setApprovedSessions] = useState<ApprovedSession[]>([]);
  const [teacherSessions, setTeacherSessions] = useState<TeacherSession[]>([]);
  const [sessionTeachers, setSessionTeachers] = useState<{ teacherUserName: string; teacherUserId: string | null }[]>([]);
  const [teacherProfiles, setTeacherProfiles] = useState<TeacherProfile[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);

  const processedRealtimeIds = useRef<Set<number>>(new Set());
  const processedRealtimeDraftIds = useRef<Set<string>>(new Set());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const logActivity = useCallback(
    (action: string, target: string) => {
      const now = Date.now();
      setActivity((prev) =>
        [
          {
            id: now,
            action,
            user: user?.full_name ?? "System",
            target,
            ts: now,
          },
          ...prev,
        ].slice(0, 20)
      );
    },
    [user]
  );

  // Sync machinery extracted to lib/supabase-sync.ts. Stable identity across
  // renders because deps (`setDemosRaw`, `flash`) are themselves stable.
  const syncApi = useMemo(
    () => createSupabaseSync({ setDemosRaw, flash }),
    [flash]
  );

  // Wrapped setDemos exposed to pages — same signature as useState setter.
  const setDemos: React.Dispatch<React.SetStateAction<Demo[]>> = useCallback(
    (arg) => {
      setDemosRaw((prev) => {
        const next =
          typeof arg === "function"
            ? (arg as (p: Demo[]) => Demo[])(prev)
            : arg;
        syncApi.syncChanges(prev, next);
        return next;
      });
    },
    [syncApi]
  );

  // ─── Initial fetch + auth-change re-fetch ─────────────────────
  const fetchDemos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("demos")
      .select("*, pour_issues ( category, description ), demo_accountability ( category ), leads ( lead_number )")
      .order("ts", { ascending: false });
    if (error) {
      flash(`Failed to load demos: ${error.message}`);
      setDemosRaw([]);
    } else {
      setDemosRaw((data as unknown as DemoRow[]).map(dbRowToDemo));
    }
    setLoading(false);
  }, [flash]);

  const fetchLeads = useCallback(async () => {
    const { data } = await supabase
      .from("leads")
      .select("id, lead_number, student_name, created_by, created_at, updated_at")
      .order("id", { ascending: false })
      .limit(2000);
    setLeads((data ?? []).map((r) => dbRowToLead(r as RawLeadRow)));
  }, []);

  const fetchDrafts = useCallback(async () => {
    const { data, error } = await supabase
      .from("demo_drafts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      // Non-fatal — drafts may not be relevant to every role
      setDrafts([]);
      return;
    }
    setDrafts((data as DemoDraft[] | null) ?? []);
  }, []);

  // Approved sessions + their latest approved draft — powers the /teachers Product log tab
  // and the future /students/[id] profile. RLS already restricts to analyst + manager, so
  // sales queries silently return nothing; we skip the call entirely as an optimization.
  const fetchApprovedSessions = useCallback(async (role: UserProfile["role"] | null) => {
    if (role !== "analyst" && role !== "manager") {
      setApprovedSessions([]);
      return;
    }
    const { data, error } = await supabase
      .from("sessions")
      .select(
        "*, session_drafts!inner ( draft_data, status, reviewed_at )"
      )
      .eq("processing_status", "approved")
      .in("session_drafts.status", ["approved", "partially_edited"])
      .order("session_date", { ascending: false })
      .limit(500);
    if (error) {
      setApprovedSessions([]);
      return;
    }
    const mapped = (data ?? [])
      .map((r) => dbRowToApprovedSession(r as Parameters<typeof dbRowToApprovedSession>[0]))
      .filter((s): s is ApprovedSession => s !== null);
    setApprovedSessions(mapped);
  }, []);

  // Every session + optional draft — powers the /teachers Product log so
  // pending / scored / approved rows all surface. Matches by teacher_user_id
  // downstream (stable FK), not by teacher_user_name (lossy string).
  const fetchTeacherSessions = useCallback(async (role: UserProfile["role"] | null) => {
    if (role !== "analyst" && role !== "manager") {
      setTeacherSessions([]);
      return;
    }
    const { data, error } = await supabase
      .from("sessions")
      .select(
        "*, session_drafts ( draft_data, status, reviewed_at )"
      )
      .order("session_date", { ascending: false })
      .limit(1000);
    if (error) {
      setTeacherSessions([]);
      return;
    }
    const mapped = (data ?? []).map((r) =>
      dbRowToTeacherSession(r as Parameters<typeof dbRowToTeacherSession>[0])
    );
    setTeacherSessions(mapped);
  }, []);

  // Distinct session teachers (all statuses) — powers the /teachers card grid so
  // every tutor with any session gets a card, not only those with approved sessions.
  const fetchSessionTeachers = useCallback(async (role: UserProfile["role"] | null) => {
    if (role !== "analyst" && role !== "manager") {
      setSessionTeachers([]);
      return;
    }
    const { data } = await supabase
      .from("sessions")
      .select("teacher_user_name, teacher_user_id")
      .not("teacher_user_name", "is", null);
    const seen = new Set<string>();
    const unique: { teacherUserName: string; teacherUserId: string | null }[] = [];
    for (const row of (data ?? []) as { teacher_user_name: string; teacher_user_id: string | null }[]) {
      const key = (row.teacher_user_name ?? "").toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push({ teacherUserName: row.teacher_user_name, teacherUserId: row.teacher_user_id ?? null });
    }
    setSessionTeachers(unique);
  }, []);

  // Teacher profiles — approved teachers are visible to every role; candidates
  // / pending / rejected rows are only visible to hr and manager (RLS-enforced).
  const fetchTeacherProfiles = useCallback(async () => {
    const { data, error } = await supabase
      .from("teacher_profiles")
      .select("*")
      .order("last_name", { ascending: true });
    if (error) {
      setTeacherProfiles([]);
      return;
    }
    setTeacherProfiles((data ?? []).map(dbRowToTeacherProfile));
  }, []);

  const fetchProcessingDemoIds = useCallback(async () => {
    const { data } = await supabase
      .from("task_queue")
      .select("demo_id")
      .in("status", ["running", "queued"]);
    const ids = new Set<number>((data ?? []).map((r: { demo_id: number }) => Number(r.demo_id)));
    setProcessingDemoIds(ids);
  }, []);

  const syncUserProfile = useCallback(async () => {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      setUser(null);
      setSalesAgents([]);
      return;
    }
    const [profileRes, agentsRes] = await Promise.all([
      supabase.from("users").select("id, email, role, full_name").eq("id", authUser.id).single(),
      supabase.from("users").select("id, email, role, full_name").eq("role", "sales_agent").eq("is_active", true),
    ]);
    if (profileRes.error || !profileRes.data) {
      setUser(null);
      fetchApprovedSessions(null);
      fetchTeacherSessions(null);
      fetchSessionTeachers(null);
    } else {
      const profile = profileRes.data as UserProfile;
      setUser(profile);
      fetchApprovedSessions(profile.role);
      fetchTeacherSessions(profile.role);
      fetchSessionTeachers(profile.role);
    }
    setSalesAgents((agentsRes.data as UserProfile[] | null) ?? []);
  }, [fetchApprovedSessions, fetchTeacherSessions, fetchSessionTeachers]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED"
      ) {
        fetchDemos();
        fetchLeads();
        syncUserProfile();
        fetchDrafts();
        fetchProcessingDemoIds();
        fetchTeacherProfiles();
      } else if (event === "SIGNED_OUT") {
        setDemosRaw([]);
        setLeads([]);
        setUser(null);
        setSalesAgents([]);
        setDrafts([]);
        setProcessingDemoIds(new Set());
        setApprovedSessions([]);
        setTeacherSessions([]);
        setSessionTeachers([]);
        setTeacherProfiles([]);
        setLoading(false);
      }
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, [fetchDemos, fetchLeads, syncUserProfile, fetchDrafts, fetchProcessingDemoIds, fetchTeacherProfiles]);

  // Flash reader for middleware route-denied redirects (?denied=<prefix>)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const denied = params.get("denied");
    if (!denied) return;
    flash(`Access denied to /${denied} — your role doesn't have permission.`);
    const url = new URL(window.location.href);
    url.searchParams.delete("denied");
    window.history.replaceState({}, "", url.toString());
  }, [flash]);

  // ─── Realtime: demos + pour_issues (bypasses wrapped setDemos) ───
  useEffect(() => {
    const channel = supabase
      .channel("demos-sync")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "demos" },
        async (payload) => {
          const newId = Number((payload.new as unknown as { id: number }).id);
          if (processedRealtimeIds.current.has(newId)) return;
          processedRealtimeIds.current.add(newId);
          if (processedRealtimeIds.current.size > 500) {
            processedRealtimeIds.current = new Set(
              Array.from(processedRealtimeIds.current).slice(-250)
            );
          }
          const [{ data: pours }, { data: accts }] = await Promise.all([
            supabase.from("pour_issues").select("category, description").eq("demo_id", newId),
            supabase.from("demo_accountability").select("category").eq("demo_id", newId),
          ]);
          const row = {
            ...(payload.new as unknown as DemoRow),
            pour_issues: pours ?? [],
            demo_accountability: accts ?? [],
          };
          setDemosRaw((prev) =>
            prev.some((d) => d.id === newId)
              ? prev
              : [dbRowToDemo(row), ...prev]
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "demos" },
        async (payload) => {
          const newId = Number((payload.new as unknown as { id: number }).id);
          const [{ data: pours }, { data: accts }] = await Promise.all([
            supabase.from("pour_issues").select("category, description").eq("demo_id", newId),
            supabase.from("demo_accountability").select("category").eq("demo_id", newId),
          ]);
          setDemosRaw((prev) => {
            const existing = prev.find((d) => d.id === newId);
            const row: DemoRow = {
              ...(payload.new as unknown as DemoRow),
              // Carry forward the joined lead_number — realtime payload is a flat row
              leads: existing?.leadNumber ? { lead_number: existing.leadNumber } : null,
              pour_issues: pours ?? [],
              demo_accountability: accts ?? [],
            };
            return prev.map((d) => (d.id === newId ? dbRowToDemo(row) : d));
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "demos" },
        (payload) => {
          const oldId = Number(
            (payload.old as unknown as { id: number }).id
          );
          setDemosRaw((prev) => prev.filter((d) => d.id !== oldId));
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pour_issues" },
        async (payload) => {
          const newRec = payload.new as unknown as { demo_id?: number };
          const oldRec = payload.old as unknown as { demo_id?: number };
          const demoId = Number(newRec?.demo_id ?? oldRec?.demo_id);
          if (!demoId) return;
          const { data: pours } = await supabase
            .from("pour_issues")
            .select("category, description")
            .eq("demo_id", demoId);
          setDemosRaw((prev) =>
            prev.map((d) =>
              d.id === demoId
                ? {
                    ...d,
                    pour: (pours ?? []).map((p) => ({
                      cat: p.category,
                      desc: p.description,
                    })),
                  }
                : d
            )
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "demo_accountability" },
        async (payload) => {
          const newRec = payload.new as unknown as { demo_id?: number };
          const oldRec = payload.old as unknown as { demo_id?: number };
          const demoId = Number(newRec?.demo_id ?? oldRec?.demo_id);
          if (!demoId) return;
          const { data: accts } = await supabase
            .from("demo_accountability")
            .select("category")
            .eq("demo_id", demoId);
          setDemosRaw((prev) =>
            prev.map((d) =>
              d.id === demoId
                ? { ...d, accountabilityFinal: (accts ?? []).map((r) => r.category) }
                : d
            )
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ─── Realtime: teacher_profiles ──────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("teacher-profiles-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "teacher_profiles" },
        () => {
          // Simple refetch on any change — volume is low (< 300 rows) and
          // the query is cheap. The alternative (per-event merge) adds
          // complexity for no user-visible benefit here.
          fetchTeacherProfiles();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTeacherProfiles]);

  // ─── Realtime: leads ─────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("leads-sync")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "leads" },
        (payload) => {
          const row = payload.new as unknown as RawLeadRow;
          setLeads((prev) =>
            prev.some((l) => l.id === row.id) ? prev : [dbRowToLead(row), ...prev]
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "leads" },
        (payload) => {
          const row = payload.new as unknown as RawLeadRow;
          setLeads((prev) =>
            prev.map((l) => (l.id === row.id ? dbRowToLead(row) : l))
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ─── HR / Teacher onboarding action creators ─────────────────

  const createTeacherCandidate = useCallback(
    async (payload: Partial<TeacherProfile> & { hrApplicationNumber: string; phoneNumber: string; firstName: string; lastName: string }) => {
      const rpcPayload = {
        hr_application_number: payload.hrApplicationNumber,
        phone_number: payload.phoneNumber,
        first_name: payload.firstName,
        last_name: payload.lastName,
        email: payload.email ?? null,
        cv_link: payload.cvLink ?? null,
        qualification: payload.qualification ?? null,
        subjects_interested: payload.subjectsInterested ?? [],
        tier: payload.tier ?? null,
      };
      const { data, error } = await supabase.rpc("upsert_teacher_candidate", { payload: rpcPayload });
      if (error) return { ok: false as const, error: error.message };
      const id = (data as { id: string } | null)?.id ?? "";
      fetchTeacherProfiles();
      return { ok: true as const, id };
    },
    [fetchTeacherProfiles]
  );

  const submitInterview = useCallback(
    async (
      profileId: string,
      recordingLink: string,
      teachingMatrix: { level: string; subject: string; curriculum: string }[],
      notes: string,
      rubric?: import("./types").InterviewRubric | null
    ) => {
      const { error } = await supabase.rpc("submit_interview", {
        p_id: profileId,
        p_recording_link: recordingLink,
        p_teaching_matrix: teachingMatrix,
        p_notes: notes,
        p_interview_rubric: rubric ?? null,
      });
      if (error) return { ok: false as const, error: error.message };
      fetchTeacherProfiles();
      return { ok: true as const };
    },
    [fetchTeacherProfiles]
  );

  const finalizeTeacherDecision = useCallback(
    async (profileId: string, outcome: "approved" | "pending" | "rejected", tid: number | null, rejectReason: string | null) => {
      const { error } = await supabase.rpc("finalize_teacher_decision", {
        p_id: profileId,
        outcome,
        p_tid: tid,
        p_reject_reason: rejectReason,
      });
      if (error) return { ok: false as const, error: error.message };
      fetchTeacherProfiles();
      return { ok: true as const };
    },
    [fetchTeacherProfiles]
  );

  const updateTeacherProfile = useCallback(
    async (profileId: string, payload: Partial<TeacherProfile>) => {
      // Camel → snake for the JSONB payload the RPC expects. Only whitelisted
      // columns reach the UPDATE — the RPC silently drops status/tid/approval.
      const rpcPayload: Record<string, unknown> = {};
      if (payload.firstName !== undefined) rpcPayload.first_name = payload.firstName;
      if (payload.lastName !== undefined) rpcPayload.last_name = payload.lastName;
      if (payload.email !== undefined) rpcPayload.email = payload.email;
      if (payload.phoneNumber !== undefined) rpcPayload.phone_number = payload.phoneNumber;
      if (payload.cvLink !== undefined) rpcPayload.cv_link = payload.cvLink;
      if (payload.qualification !== undefined) rpcPayload.qualification = payload.qualification;
      if (payload.subjectsInterested !== undefined) rpcPayload.subjects_interested = payload.subjectsInterested;
      if (payload.teachingMatrix !== undefined) rpcPayload.teaching_matrix = payload.teachingMatrix;
      if (payload.interviewNotes !== undefined) rpcPayload.interview_notes = payload.interviewNotes;
      if (payload.interviewRubric !== undefined) rpcPayload.interview_rubric = payload.interviewRubric;
      if (payload.tier !== undefined) rpcPayload.tier = payload.tier;
      const { error } = await supabase.rpc("update_teacher_profile", { p_id: profileId, payload: rpcPayload });
      if (error) return { ok: false as const, error: error.message };
      fetchTeacherProfiles();
      return { ok: true as const };
    },
    [fetchTeacherProfiles]
  );

  const processHrRecording = useCallback(
    async (profileId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return { ok: false as const, error: "Not authenticated" };
      try {
        const res = await fetch(`${AI_BACKEND_URL}/api/v1/hr-interviews/${profileId}/process-recording`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return { ok: false as const, error: body.detail ?? `HTTP ${res.status}` };
        }
        return { ok: true as const };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "Network error" };
      }
    },
    []
  );

  // ─── Realtime: demo_drafts ────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("drafts-sync")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "demo_drafts" },
        (payload) => {
          const row = payload.new as unknown as DemoDraft;
          if (processedRealtimeDraftIds.current.has(row.id)) return;
          processedRealtimeDraftIds.current.add(row.id);
          if (processedRealtimeDraftIds.current.size > 500) {
            processedRealtimeDraftIds.current = new Set(
              Array.from(processedRealtimeDraftIds.current).slice(-250)
            );
          }
          setDrafts((prev) =>
            prev.some((d) => d.id === row.id) ? prev : [row, ...prev]
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "demo_drafts" },
        (payload) => {
          const row = payload.new as unknown as DemoDraft;
          setDrafts((prev) =>
            prev.map((d) => (d.id === row.id ? row : d))
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "demo_drafts" },
        (payload) => {
          const oldId = (payload.old as unknown as { id: string }).id;
          setDrafts((prev) => prev.filter((d) => d.id !== oldId));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ─── Realtime: approved sessions ─────────────────────────────
  // Any session flipping to processing_status='approved' (or a draft status
  // flipping away from approved) triggers a refetch. Cheap — limit(500) with
  // an inner join. Refetch model keeps the join logic in one place.
  useEffect(() => {
    if (user?.role !== "analyst" && user?.role !== "manager") return;
    const channel = supabase
      .channel("approved-sessions-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions" },
        () => {
          fetchApprovedSessions(user.role);
          fetchTeacherSessions(user.role);
          fetchSessionTeachers(user.role);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "session_drafts" },
        () => {
          fetchApprovedSessions(user.role);
          fetchTeacherSessions(user.role);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.role, fetchApprovedSessions, fetchTeacherSessions, fetchSessionTeachers]);

  // ─── Realtime: task_queue (keep processingDemoIds in sync) ──────
  useEffect(() => {
    const channel = supabase
      .channel("task-queue-sync")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "task_queue" },
        (payload) => {
          const row = payload.new as unknown as { demo_id: number; status: string };
          if (row.status === "running" || row.status === "queued") {
            setProcessingDemoIds((prev) => new Set([...prev, Number(row.demo_id)]));
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "task_queue" },
        (payload) => {
          const row = payload.new as unknown as { demo_id: number; status: string };
          const demoId = Number(row.demo_id);
          if (row.status === "running" || row.status === "queued") {
            setProcessingDemoIds((prev) => new Set([...prev, demoId]));
          } else {
            // completed / failed — remove from set (re-fetch to confirm no other active tasks for this demo)
            setProcessingDemoIds((prev) => {
              const next = new Set(prev);
              next.delete(demoId);
              return next;
            });
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ─── Draft operations ─────────────────────────────────────────
  const fetchDraft = useCallback(
    async (demoId: number): Promise<DemoDraft | null> => {
      const { data, error } = await supabase
        .from("demo_drafts")
        .select("*")
        .eq("demo_id", demoId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error || !data || data.length === 0) return null;
      const latest = data[0] as DemoDraft;
      // Merge into local cache if absent
      setDrafts((prev) =>
        prev.some((d) => d.id === latest.id) ? prev : [latest, ...prev]
      );
      return latest;
    },
    []
  );

  const triggerAnalyze = useCallback(
    async (demoId: number): Promise<AnalyzeResult> => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token ?? "";
        const res = await fetch(
          `${AI_BACKEND_URL}/api/v1/demos/${demoId}/analyze`,
          {
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }
        );
        if (!res.ok) {
          let detail = `HTTP ${res.status}`;
          try {
            const body = await res.json();
            if (body?.detail) detail = String(body.detail);
          } catch {
            /* response not JSON */
          }
          return { ok: false, error: detail };
        }
        const draft = (await res.json()) as DemoDraft;
        // Optimistically inject so the review page finds it even before realtime fires
        setDrafts((prev) =>
          prev.some((d) => d.id === draft.id) ? prev : [draft, ...prev]
        );
        return { ok: true, draft };
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : "AI backend not reachable (is the Python server running on :8000?)",
        };
      }
    },
    []
  );

  const triggerProcessRecording = useCallback(
    async (demoId: number): Promise<ProcessRecordingResult> => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token ?? "";
        const res = await fetch(
          `${AI_BACKEND_URL}/api/v1/demos/${demoId}/process-recording`,
          {
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }
        );
        if (!res.ok) {
          let detail = `HTTP ${res.status}`;
          try {
            const body = await res.json();
            if (body?.detail) detail = String(body.detail);
          } catch {
            /* non-JSON body */
          }
          return { ok: false, error: detail };
        }
        const body = (await res.json()) as {
          demo_id: number;
          transcript_length: number;
          duration_seconds: number;
          analysis_draft_id: string | null;
          status: "transcribed_and_analyzed" | "transcription_only";
        };
        return {
          ok: true,
          demoId: body.demo_id,
          transcriptLength: body.transcript_length,
          durationSeconds: body.duration_seconds,
          analysisDraftId: body.analysis_draft_id,
          status: body.status,
        };
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : "AI backend not reachable (is the Python server running on :8000?)",
        };
      }
    },
    []
  );

  const createDemo = useCallback(
    async (demo: Demo): Promise<CreateDemoResult> => {
      const pourPayload = pourToDbRows(demo.id, demo.pour).map(
        ({ category, description }) => ({ category, description })
      );
      const { data, error } = await supabase.rpc("create_demo_with_pour", {
        demo_payload: demoToInsertRow(demo),
        pour_payload: pourPayload,
      });
      if (error) {
        return { ok: false, error: error.message };
      }
      const serverId = data as number;
      // Bypass diff-sync — the DB row already exists. Insert with real server id.
      setDemosRaw((prev) => [{ ...demo, id: serverId }, ...prev]);
      return { ok: true, id: serverId };
    },
    []
  );

  const approveDraft = useCallback(
    async (
      draftId: string,
      approvalRate: number,
      status: Extract<DemoDraftStatus, "approved" | "partially_edited">
    ): Promise<void> => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("demo_drafts")
        .update({
          status,
          approval_rate: approvalRate,
          reviewed_by: authUser?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", draftId);
      if (error) {
        flash(`Failed to update draft: ${error.message}`);
      }
    },
    [flash]
  );

  const rejectDraft = useCallback(
    async (draftId: string): Promise<void> => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("demo_drafts")
        .update({
          status: "rejected" as const,
          approval_rate: 0,
          reviewed_by: authUser?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", draftId);
      if (error) {
        flash(`Failed to reject draft: ${error.message}`);
      }
    },
    [flash]
  );

  // ─── Lead creation ────────────────────────────────────────────
  const createLead = useCallback(
    async (studentName: string, leadNumber?: string): Promise<CreateLeadResult> => {
      const { data, error } = await supabase.rpc("create_lead", {
        p_student_name: studentName,
        p_lead_number: leadNumber ?? null,
      });
      if (error) return { ok: false, error: error.message };
      const r = data as { id: number; lead_number: string };
      const newLead: Lead = {
        id: r.id,
        leadNumber: r.lead_number,
        studentName,
        createdBy: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setLeads((prev) => [newLead, ...prev]);
      return { ok: true, id: r.id, leadNumber: r.lead_number };
    },
    []
  );

  // ─── Accountability finalisation ──────────────────────────────
  // Bypass setDemos' diff engine — accountability is owned by the RPC
  // (atomic DELETE + INSERT + UPDATE), realtime fills state back in.
  // Optimistic update keeps the UI snappy; realtime is the source of truth.
  const finalizeAccountability = useCallback(
    async (demoId: number, categories: string[]) => {
      if (categories.length === 0) {
        return { ok: false as const, error: "At least one category required" };
      }
      const { error } = await supabase.rpc("finalize_demo_accountability", {
        p_demo_id: demoId,
        p_categories: categories,
      });
      if (error) {
        flash(`Failed to finalise accountability: ${error.message}`);
        return { ok: false as const, error: error.message };
      }
      const nowIso = new Date().toISOString();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      setDemosRaw((prev) =>
        prev.map((d) =>
          d.id === demoId
            ? {
                ...d,
                accountabilityFinal: [...categories],
                accountabilityFinalAt: nowIso,
                accountabilityFinalBy: authUser?.id ?? d.accountabilityFinalBy,
              }
            : d
        )
      );
      return { ok: true as const };
    },
    [flash]
  );

  const clearAccountability = useCallback(
    async (demoId: number) => {
      const { error } = await supabase.rpc("clear_demo_accountability", {
        p_demo_id: demoId,
      });
      if (error) {
        flash(`Failed to clear accountability: ${error.message}`);
        return { ok: false as const, error: error.message };
      }
      setDemosRaw((prev) =>
        prev.map((d) =>
          d.id === demoId
            ? {
                ...d,
                accountabilityFinal: [],
                accountabilityFinalAt: null,
                accountabilityFinalBy: null,
              }
            : d
        )
      );
      return { ok: true as const };
    },
    [flash]
  );

  const confirmDeleteDemo = useCallback(
    (demo: Demo, opts?: { onAfterDelete?: () => void }) => {
      setConfirm({
        title: `Delete demo for ${demo.student}?`,
        msg: "This permanently removes the demo, its POUR issues, AI scorecard draft, accountability record, and any pending processing tasks. This cannot be undone.",
        onConfirm: () => {
          setDemos((prev) => prev.filter((d) => d.id !== demo.id));
          logActivity("deleted", `Demo ${demo.id} · ${demo.student}`);
          flash("Demo deleted");
          opts?.onAfterDelete?.();
        },
      });
    },
    [setDemos, logActivity, flash]
  );

  // ─── Derived memos ────────────────────────────────────────────
  const rangedDemos = useMemo(
    () => demos.filter((d) => !d.isDraft && inDateRange(d.date, dateRange)),
    [demos, dateRange]
  );

  const notifications = useMemo(() => {
    // Pending demos aged 3+ days — positive IDs = demo.id
    const pending: Notification[] = demos
      .filter((d) => d.status === "Pending" && ageDays(d.ts) >= 3)
      .map((d) => ({
        id: d.id,
        text: `${d.student} pending ${ageDays(d.ts)} days`,
        time: `${ageDays(d.ts)}d`,
      }));

    // Pending demos with a recording URL but no transcript — analyst hasn't
    // clicked Process Recording yet. Offset IDs to a disjoint negative range
    // so they don't collide with the draft notifications below or demo.id.
    const unprocessedRecording: Notification[] = demos
      .filter(
        (d) =>
          d.status === "Pending" &&
          !!d.recording &&
          d.recording.trim() !== "" &&
          !(d.transcript && d.transcript.trim()),
      )
      .map((d) => ({
        id: -d.id - 1_000_000_000,
        text: `Recording not yet processed: ${d.student}`,
        time: "Process",
      }));

    // AI drafts awaiting review — negative IDs to avoid collision with
    // demo.id (Date.now() ms ~1.7e12; negatives are out of that range).
    const demoById = new Map(demos.map((d) => [d.id, d]));
    const draftReady: Notification[] = drafts
      .filter((d) => d.status === "pending_review")
      .map((d) => {
        const demo = demoById.get(d.demo_id);
        return {
          id: -d.demo_id,
          text: `AI draft ready: ${demo?.student ?? `Demo ${d.demo_id}`}`,
          time: "Review",
        };
      });

    return [...draftReady, ...unprocessedRecording, ...pending];
  }, [demos, drafts]);

  const stats = useMemo(() => {
    const ds = rangedDemos;
    const t = ds.length;
    const c = ds.filter((d) => d.status === "Converted").length;
    const p = ds.filter((d) => d.status === "Pending").length;
    return {
      total: t,
      converted: c,
      pending: p,
      notConv: t - c - p,
      rate: t ? Math.round((c / t) * 100) : 0,
      avgR: t
        ? (ds.reduce((s, d) => s + d.analystRating, 0) / t).toFixed(1)
        : "0",
      pourRate: t
        ? Math.round(
            (ds.filter((d) => d.pour.length > 0).length / t) * 100
          )
        : 0,
    };
  }, [rangedDemos]);

  // Latest draft per demo_id — O(1) lookup for the UI
  const draftsByDemoId = useMemo(() => {
    const m: Record<number, DemoDraft | undefined> = {};
    for (const d of drafts) {
      const existing = m[d.demo_id];
      if (!existing || d.created_at > existing.created_at) m[d.demo_id] = d;
    }
    return m;
  }, [drafts]);

  // Visible-to-analyst teacher list — used by /analyst dropdown and /teachers grid
  // once Phase 8 swaps consumers off the hardcoded TEACHERS array in lib/types.ts.
  const approvedTeachers = useMemo(
    () =>
      teacherProfiles
        .filter((p) => p.status === "approved")
        .sort((a, b) => (a.lastName || "").localeCompare(b.lastName || "")),
    [teacherProfiles]
  );

  return (
    <StoreContext.Provider
      value={{
        demos,
        setDemos,
        rangedDemos,
        dateRange,
        setDateRange,
        activity,
        logActivity,
        notifications,
        toast,
        flash,
        confirm,
        setConfirm,
        loading,
        user,
        salesAgents,
        drafts,
        draftsByDemoId,
        fetchDraft,
        triggerAnalyze,
        triggerProcessRecording,
        createDemo,
        approveDraft,
        rejectDraft,
        finalizeAccountability,
        clearAccountability,
        confirmDeleteDemo,
        processingDemoIds,
        approvedSessions,
        teacherSessions,
        sessionTeachers,
        leads,
        createLead,
        teacherProfiles,
        approvedTeachers,
        createTeacherCandidate,
        submitInterview,
        finalizeTeacherDecision,
        updateTeacherProfile,
        processHrRecording,
        stats,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
