import { ActivityEntry } from "./types";

// Phase 2: activity feed is client-side only, in-memory per session.
// Cross-user activity will move to a Supabase table in a later phase.
// Seed is empty so a fresh DB yields a fresh log.
export const SEED_ACTIVITY: ActivityEntry[] = [];
