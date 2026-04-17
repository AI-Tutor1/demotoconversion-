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
  ActivityEntry,
  Notification,
  DemoDraft,
  DemoDraftStatus,
  ApprovedSession,
} from "./types";
import { SEED_ACTIVITY } from "./data";
import { inDateRange, ageDays } from "./utils";
import { supabase } from "./supabase";
import { dbRowToDemo, demoToInsertRow, pourToDbRows, type DemoRow } from "./transforms";
import { dbRowToApprovedSession } from "./review-transforms";
import { createSupabaseSync } from "./supabase-sync";

export interface UserProfile {
  id: string;
  email: string;
  role: "analyst" | "sales_agent" | "manager";
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
  processingDemoIds: Set<number>;
  approvedSessions: ApprovedSession[];
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
      .select("*, pour_issues ( category, description )")
      .order("ts", { ascending: false });
    if (error) {
      flash(`Failed to load demos: ${error.message}`);
      setDemosRaw([]);
    } else {
      setDemosRaw((data as unknown as DemoRow[]).map(dbRowToDemo));
    }
    setLoading(false);
  }, [flash]);

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
    } else {
      const profile = profileRes.data as UserProfile;
      setUser(profile);
      fetchApprovedSessions(profile.role);
    }
    setSalesAgents((agentsRes.data as UserProfile[] | null) ?? []);
  }, [fetchApprovedSessions]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED"
      ) {
        fetchDemos();
        syncUserProfile();
        fetchDrafts();
        fetchProcessingDemoIds();
      } else if (event === "SIGNED_OUT") {
        setDemosRaw([]);
        setUser(null);
        setSalesAgents([]);
        setDrafts([]);
        setProcessingDemoIds(new Set());
        setApprovedSessions([]);
        setLoading(false);
      }
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, [fetchDemos, syncUserProfile, fetchDrafts, fetchProcessingDemoIds]);

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
          const { data: pours } = await supabase
            .from("pour_issues")
            .select("category, description")
            .eq("demo_id", newId);
          const row = {
            ...(payload.new as unknown as DemoRow),
            pour_issues: pours ?? [],
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
          const { data: pours } = await supabase
            .from("pour_issues")
            .select("category, description")
            .eq("demo_id", newId);
          const row = {
            ...(payload.new as unknown as DemoRow),
            pour_issues: pours ?? [],
          };
          setDemosRaw((prev) =>
            prev.map((d) => (d.id === newId ? dbRowToDemo(row) : d))
          );
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
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "session_drafts" },
        () => {
          fetchApprovedSessions(user.role);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.role, fetchApprovedSessions]);

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
        processingDemoIds,
        approvedSessions,
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
