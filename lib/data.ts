import { ActivityEntry } from "./types";

// SEED_DEMOS was removed in Phase 2 — demos are now fetched from Supabase.
// SEED_ACTIVITY remains here because the activity feed is still local state
// for Phase 2; cross-user activity will move to a table in a later phase.

export const SEED_ACTIVITY: ActivityEntry[] = [
  { id: 1, action: "submitted", user: "Analyst", target: "Alina Farooq demo", time: "2 min ago" },
  { id: 2, action: "converted", user: "Hoor", target: "Bilal Ahmed", time: "1 hour ago" },
  { id: 3, action: "flagged POUR", user: "Analyst", target: "Hassan Raza", time: "3 hours ago" },
];
