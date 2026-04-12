const DAY = 864e5;
const NOW = Date.now();

export function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("");
}

export function ageDays(ts: number): number {
  return Math.max(0, Math.floor((NOW - ts) / DAY));
}

export function ageColor(d: number): string {
  return d <= 1 ? "#E8F5E9" : d <= 3 ? "#FFF8E1" : "#FFEBEE";
}

export function ageTextColor(d: number): string {
  return d <= 1 ? "#1B5E20" : d <= 3 ? "#8B6914" : "#B71C1C";
}

export function formatMonth(dateStr: string): string {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const parts = dateStr.split("-");
  return months[parseInt(parts[1]) - 1] + " " + parts[0];
}

export function inDateRange(dateStr: string, range: string): boolean {
  if (range === "all") return true;
  const d = new Date(dateStr);
  const today = new Date("2026-04-12");
  const diff = (today.getTime() - d.getTime()) / DAY;
  if (range === "7d") return diff <= 7;
  if (range === "30d") return diff <= 30;
  if (range === "90d") return diff <= 90;
  return true;
}

export function exportCSV(data: Record<string, unknown>[]): void {
  const headers = [
    "Date", "Teacher", "Student", "Level", "Subject",
    "POUR", "Rating", "Status", "Agent", "Accountability",
  ];
  const rows = data.map((d: Record<string, unknown>) => [
    d.date, d.teacher, d.student, d.level, d.subject,
    Array.isArray(d.pour) ? d.pour.map((p: { cat: string }) => p.cat).join("; ") : "",
    d.analystRating, d.status, d.agent, d.acctType,
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "demo_export.csv";
  a.click();
  URL.revokeObjectURL(url);
}
