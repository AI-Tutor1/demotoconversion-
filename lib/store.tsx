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
import { Demo, ActivityEntry, Notification } from "./types";
import { SEED_ACTIVITY } from "./data";
import { inDateRange, ageDays } from "./utils";
import { supabase } from "./supabase";
import {
  dbRowToDemo,
  demoToInsertRow,
  demoUpdatesToDb,
  pourToDbRows,
  type DemoRow,
} from "./transforms";

export interface UserProfile {
  id: string;
  email: string;
  role: "analyst" | "sales_agent" | "manager";
  full_name: string;
}

interface StoreContextType {
  demos: Demo[];
  setDemos: React.Dispatch<React.SetStateAction<Demo[]>>;
  rangedDemos: Demo[];
  dateRange: string;
  setDateRange: (range: string) => void;
  activity: ActivityEntry[];
  logActivity: (action: string, user: string, target: string) => void;
  notifications: Notification[];
  toast: string | null;
  flash: (msg: string) => void;
  confirm: { title: string; msg: string; onConfirm: () => void } | null;
  setConfirm: (
    c: { title: string; msg: string; onConfirm: () => void } | null
  ) => void;
  loading: boolean;
  user: UserProfile | null;
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

// Short-TTL write dedupe to absorb React Strict Mode double-invocation of
// state updater functions in dev. Production runs once; dev fires twice and
// the second fire short-circuits here.
const DEDUPE_WINDOW_MS = 1500;

// Compute per-row diff excluding `pour` (handled separately).
function diffDemoFields(prev: Demo, next: Demo): Partial<Demo> {
  const diff: Partial<Demo> = {};
  (Object.keys(next) as (keyof Demo)[]).forEach((key) => {
    if (key === "pour") return;
    if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) {
      (diff as Record<string, unknown>)[key] = next[key];
    }
  });
  return diff;
}

function pourChanged(prev: Demo, next: Demo): boolean {
  return JSON.stringify(prev.pour) !== JSON.stringify(next.pour);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [demos, setDemosRaw] = useState<Demo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState("all");
  const [toast, setToast] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<StoreContextType["confirm"]>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>(SEED_ACTIVITY);
  const [user, setUser] = useState<UserProfile | null>(null);

  const writeHashes = useRef<Map<string, number>>(new Map());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const logActivity = useCallback(
    (action: string, user: string, target: string) => {
      setActivity((prev) =>
        [
          { id: Date.now(), action, user, target, time: "Just now" },
          ...prev,
        ].slice(0, 20)
      );
    },
    []
  );

  // ─── Dedupe helper (prevents Strict-Mode double writes) ───────
  const shouldFire = useCallback((hash: string): boolean => {
    const now = Date.now();
    const last = writeHashes.current.get(hash);
    if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return false;
    writeHashes.current.set(hash, now);
    // GC old entries
    for (const [k, t] of writeHashes.current.entries()) {
      if (now - t > DEDUPE_WINDOW_MS * 2) writeHashes.current.delete(k);
    }
    return true;
  }, []);

  // ─── Async write helpers ──────────────────────────────────────
  const fireInsert = useCallback(
    async (demo: Demo) => {
      const hash = `insert:${demo.id}`;
      if (!shouldFire(hash)) return;
      const { error: demoErr } = await supabase
        .from("demos")
        .insert(demoToInsertRow(demo));
      if (demoErr) {
        flash(`Save failed: ${demoErr.message}`);
        setDemosRaw((prev) => prev.filter((d) => d.id !== demo.id));
        return;
      }
      if (demo.pour.length > 0) {
        const { error: pourErr } = await supabase
          .from("pour_issues")
          .insert(pourToDbRows(demo.id, demo.pour));
        if (pourErr) flash(`POUR save failed: ${pourErr.message}`);
      }
    },
    [flash, shouldFire]
  );

  const fireUpdateGroup = useCallback(
    async (ids: number[], changes: Partial<Demo>, prevSnapshot: Demo[]) => {
      const hash = `update:${ids.slice().sort().join(",")}:${JSON.stringify(
        changes
      )}`;
      if (!shouldFire(hash)) return;
      const payload = demoUpdatesToDb(changes);
      if (Object.keys(payload).length === 0) return;
      const query = supabase.from("demos").update(payload);
      const { error } =
        ids.length === 1
          ? await query.eq("id", ids[0])
          : await query.in("id", ids);
      if (error) {
        flash(`Save failed: ${error.message}`);
        const prevById = new Map(prevSnapshot.map((d) => [d.id, d]));
        setDemosRaw((cur) =>
          cur.map((d) => {
            if (!ids.includes(d.id)) return d;
            const original = prevById.get(d.id);
            return original ?? d;
          })
        );
      }
    },
    [flash, shouldFire]
  );

  const firePourSync = useCallback(
    async (demoId: number, nextPour: Demo["pour"], prevSnapshot: Demo[]) => {
      const hash = `pour:${demoId}:${JSON.stringify(nextPour)}`;
      if (!shouldFire(hash)) return;
      const { error: delErr } = await supabase
        .from("pour_issues")
        .delete()
        .eq("demo_id", demoId);
      if (delErr) {
        flash(`POUR update failed: ${delErr.message}`);
        const prev = prevSnapshot.find((d) => d.id === demoId);
        if (prev) setDemosRaw((cur) => cur.map((d) => (d.id === demoId ? prev : d)));
        return;
      }
      if (nextPour.length > 0) {
        const { error: insErr } = await supabase
          .from("pour_issues")
          .insert(pourToDbRows(demoId, nextPour));
        if (insErr) flash(`POUR insert failed: ${insErr.message}`);
      }
    },
    [flash, shouldFire]
  );

  const fireDelete = useCallback(
    async (demoId: number, prevSnapshot: Demo[]) => {
      const hash = `delete:${demoId}`;
      if (!shouldFire(hash)) return;
      const { error } = await supabase.from("demos").delete().eq("id", demoId);
      if (error) {
        flash(`Delete failed: ${error.message}`);
        const original = prevSnapshot.find((d) => d.id === demoId);
        if (original) setDemosRaw((cur) => [original, ...cur]);
      }
    },
    [flash, shouldFire]
  );

  // ─── Diff prev vs next, dispatch async writes (with batching) ──
  const syncChanges = useCallback(
    (prev: Demo[], next: Demo[]) => {
      if (prev === next) return;
      const prevById = new Map(prev.map((d) => [d.id, d]));
      const nextById = new Map(next.map((d) => [d.id, d]));

      // INSERTs
      for (const [id, nextDemo] of nextById) {
        if (!prevById.has(id)) fireInsert(nextDemo);
      }

      // UPDATEs — group by identical field-diff for bulk batching
      const groups = new Map<
        string,
        { ids: number[]; changes: Partial<Demo> }
      >();
      const pourEdits: { id: number; pour: Demo["pour"] }[] = [];
      for (const [id, nextDemo] of nextById) {
        const prevDemo = prevById.get(id);
        if (!prevDemo) continue;
        if (prevDemo === nextDemo) continue;
        const fieldDiff = diffDemoFields(prevDemo, nextDemo);
        if (Object.keys(fieldDiff).length > 0) {
          const sig = JSON.stringify(fieldDiff);
          if (!groups.has(sig)) groups.set(sig, { ids: [], changes: fieldDiff });
          groups.get(sig)!.ids.push(id);
        }
        if (pourChanged(prevDemo, nextDemo)) {
          pourEdits.push({ id, pour: nextDemo.pour });
        }
      }
      for (const { ids, changes } of groups.values()) {
        fireUpdateGroup(ids, changes, prev);
      }
      for (const { id, pour } of pourEdits) {
        firePourSync(id, pour, prev);
      }

      // DELETEs
      for (const id of prevById.keys()) {
        if (!nextById.has(id)) fireDelete(id, prev);
      }
    },
    [fireInsert, fireUpdateGroup, firePourSync, fireDelete]
  );

  // Wrapped setDemos exposed to pages — keeps same signature, adds sync.
  const setDemos: React.Dispatch<React.SetStateAction<Demo[]>> = useCallback(
    (arg) => {
      setDemosRaw((prev) => {
        const next =
          typeof arg === "function"
            ? (arg as (p: Demo[]) => Demo[])(prev)
            : arg;
        syncChanges(prev, next);
        return next;
      });
    },
    [syncChanges]
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

  const syncUserProfile = useCallback(async () => {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      setUser(null);
      return;
    }
    const { data, error } = await supabase
      .from("users")
      .select("id, email, role, full_name")
      .eq("id", authUser.id)
      .single();
    if (error || !data) {
      setUser(null);
      return;
    }
    setUser(data as UserProfile);
  }, []);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED"
      ) {
        fetchDemos();
        syncUserProfile();
      } else if (event === "SIGNED_OUT") {
        setDemosRaw([]);
        setUser(null);
        setLoading(false);
      }
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, [fetchDemos, syncUserProfile]);

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

  // ─── Realtime subscription (bypasses wrapped setDemos) ────────
  useEffect(() => {
    const channel = supabase
      .channel("demos-sync")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "demos" },
        async (payload) => {
          const newId = Number(
            (payload.new as unknown as { id: number }).id
          );
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
          const newId = Number(
            (payload.new as unknown as { id: number }).id
          );
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

  // ─── Derived memos (unchanged from Phase 1) ───────────────────
  const rangedDemos = useMemo(
    () => demos.filter((d) => inDateRange(d.date, dateRange)),
    [demos, dateRange]
  );

  const notifications = useMemo(() => {
    return demos
      .filter((d) => d.status === "Pending" && ageDays(d.ts) >= 3)
      .map((d) => ({
        id: d.id,
        text: `${d.student} pending ${ageDays(d.ts)} days`,
        time: `${ageDays(d.ts)}d`,
      }));
  }, [demos]);

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
