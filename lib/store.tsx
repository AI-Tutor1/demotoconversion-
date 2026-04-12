"use client";

import { createContext, useContext, useState, useMemo, ReactNode } from "react";
import { Demo, ActivityEntry, Notification } from "./types";
import { SEED_DEMOS, SEED_ACTIVITY } from "./data";
import { inDateRange, ageDays } from "./utils";

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
  setConfirm: (c: { title: string; msg: string; onConfirm: () => void } | null) => void;
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

export function StoreProvider({ children }: { children: ReactNode }) {
  const [demos, setDemos] = useState<Demo[]>(SEED_DEMOS);
  const [dateRange, setDateRange] = useState("all");
  const [toast, setToast] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<StoreContextType["confirm"]>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>(SEED_ACTIVITY);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const logActivity = (action: string, user: string, target: string) => {
    setActivity((prev) => [
      { id: Date.now(), action, user, target, time: "Just now" },
      ...prev,
    ].slice(0, 20));
  };

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
