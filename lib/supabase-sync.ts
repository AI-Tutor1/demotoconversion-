/**
 * Supabase write sync for the Demos table.
 *
 * Extracted from lib/store.tsx (Phase 3 Step 5 cleanup). The store's wrapped
 * `setDemos` delegates here. This module owns:
 *   - diff between prev / next demo arrays (by id + reference equality)
 *   - batched UPDATEs when multiple rows share the same field diff
 *   - POUR sync via DELETE + INSERT on pour_issues
 *   - INSERTs, DELETEs
 *   - Strict-Mode-safe write dedup (hashes recent writes; dev double-invocation lands as no-op)
 *   - optimistic error rollback via the setDemosRaw passed in
 *
 * Call pattern:
 *   const sync = createSupabaseSync({ setDemosRaw, flash });
 *   sync.syncChanges(prev, next);
 */

import type { Demo } from "./types";
import { supabase } from "./supabase";
import { demoToInsertRow, demoUpdatesToDb, pourToDbRows } from "./transforms";

const DEDUPE_WINDOW_MS = 1500;

export interface SyncDeps {
  setDemosRaw: React.Dispatch<React.SetStateAction<Demo[]>>;
  flash: (msg: string) => void;
}

export interface SyncAPI {
  /** Diff `prev` → `next` and fire the appropriate Supabase writes (INSERT / UPDATE / POUR / DELETE). */
  syncChanges: (prev: Demo[], next: Demo[]) => void;
}

// ─── pure diff helpers ───────────────────────────────────────

function diffDemoFields(prev: Demo, next: Demo): Partial<Demo> {
  const diff: Partial<Demo> = {};
  (Object.keys(next) as (keyof Demo)[]).forEach((key) => {
    if (key === "pour") return; // handled separately
    if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) {
      (diff as Record<string, unknown>)[key] = next[key];
    }
  });
  return diff;
}

function pourChanged(prev: Demo, next: Demo): boolean {
  return JSON.stringify(prev.pour) !== JSON.stringify(next.pour);
}

// ─── factory ──────────────────────────────────────────────────

export function createSupabaseSync({ setDemosRaw, flash }: SyncDeps): SyncAPI {
  // Write-hash dedup absorbs React Strict Mode double-invocation of state
  // updater functions in dev. Production fires once; dev would fire twice and
  // the second call short-circuits here.
  const writeHashes = new Map<string, number>();

  function shouldFire(hash: string): boolean {
    const now = Date.now();
    const last = writeHashes.get(hash);
    if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return false;
    writeHashes.set(hash, now);
    // GC stale entries
    for (const [k, t] of writeHashes.entries()) {
      if (now - t > DEDUPE_WINDOW_MS * 2) writeHashes.delete(k);
    }
    return true;
  }

  async function fireInsert(demo: Demo): Promise<void> {
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
  }

  async function fireUpdateGroup(
    ids: number[],
    changes: Partial<Demo>,
    prevSnapshot: Demo[]
  ): Promise<void> {
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
  }

  async function firePourSync(
    demoId: number,
    nextPour: Demo["pour"],
    prevSnapshot: Demo[]
  ): Promise<void> {
    const hash = `pour:${demoId}:${JSON.stringify(nextPour)}`;
    if (!shouldFire(hash)) return;
    const { error: delErr } = await supabase
      .from("pour_issues")
      .delete()
      .eq("demo_id", demoId);
    if (delErr) {
      flash(`POUR update failed: ${delErr.message}`);
      const prev = prevSnapshot.find((d) => d.id === demoId);
      if (prev)
        setDemosRaw((cur) => cur.map((d) => (d.id === demoId ? prev : d)));
      return;
    }
    if (nextPour.length > 0) {
      const { error: insErr } = await supabase
        .from("pour_issues")
        .insert(pourToDbRows(demoId, nextPour));
      if (insErr) flash(`POUR insert failed: ${insErr.message}`);
    }
  }

  async function fireDelete(demoId: number, prevSnapshot: Demo[]): Promise<void> {
    const hash = `delete:${demoId}`;
    if (!shouldFire(hash)) return;
    const { error } = await supabase.from("demos").delete().eq("id", demoId);
    if (error) {
      flash(`Delete failed: ${error.message}`);
      const original = prevSnapshot.find((d) => d.id === demoId);
      if (original) setDemosRaw((cur) => [original, ...cur]);
    }
  }

  function syncChanges(prev: Demo[], next: Demo[]): void {
    if (prev === next) return;
    const prevById = new Map(prev.map((d) => [d.id, d]));
    const nextById = new Map(next.map((d) => [d.id, d]));

    // INSERTs
    for (const [id, nextDemo] of nextById) {
      if (!prevById.has(id)) fireInsert(nextDemo);
    }

    // UPDATEs — group identical field-diffs for bulk batching via .in('id', ids)
    const groups = new Map<
      string,
      { ids: number[]; changes: Partial<Demo> }
    >();
    const pourEdits: { id: number; pour: Demo["pour"] }[] = [];
    for (const [id, nextDemo] of nextById) {
      const prevDemo = prevById.get(id);
      if (!prevDemo || prevDemo === nextDemo) continue;
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
  }

  return { syncChanges };
}
