"use client";

import type { SessionProcessingStatus } from "@/lib/types";

const LABELS: Record<SessionProcessingStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  scored: "Scored",
  approved: "Approved",
  failed: "Failed",
};

export default function SessionStatusBadge({
  status,
}: {
  status: SessionProcessingStatus;
}) {
  return (
    <span className={`session-badge session-badge-${status}`}>
      {LABELS[status] ?? status}
    </span>
  );
}
