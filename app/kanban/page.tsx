"use client";
import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import { Stars, EmptyState } from "@/components/ui";
import { LIGHT_GRAY, MUTED, BLUE, type WorkflowStage } from "@/lib/types";
import { ageDays, ageColor, ageTextColor } from "@/lib/utils";

const KCOLS: { key: string; label: string; color: string; stage: WorkflowStage; status: "Pending" | "Converted" | "Not Converted" }[] = [
  { key: "new",       label: "New",           color: "#0071e3", stage: "new",           status: "Pending" },
  { key: "review",    label: "Under review",  color: "#AF52DE", stage: "under_review",  status: "Pending" },
  { key: "pending",   label: "Pending sales", color: "#FF9F0A", stage: "pending_sales", status: "Pending" },
  { key: "converted", label: "Converted",     color: "#30D158", stage: "converted",     status: "Converted" },
  { key: "lost",      label: "Not converted", color: "#E24B4A", stage: "lost",          status: "Not Converted" },
];

// Reverse lookup: workflowStage → kanban column key
const STAGE_TO_COL: Record<WorkflowStage, string> = {
  new: "new",
  assigned: "review",
  under_review: "review",
  pending_sales: "pending",
  contacted: "pending",
  converted: "converted",
  lost: "lost",
};

export default function KanbanPage() {
  const { rangedDemos, setDemos, flash, setConfirm, logActivity } = useStore();
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ card: typeof rangedDemos[0]; from: string } | null>(null);

  const board = useMemo(() => {
    const b: Record<string, typeof rangedDemos> = { new: [], review: [], pending: [], converted: [], lost: [] };
    rangedDemos.forEach((d) => {
      const card = { ...d, age: ageDays(d.ts) } as typeof d & { age: number };
      const col = STAGE_TO_COL[d.workflowStage] ?? "new";
      b[col].push(card);
    });
    return b;
  }, [rangedDemos]);

  const onDrop = (toCol: string) => {
    if (!dragging) { setDragOver(null); return; }
    const target = KCOLS.find((c) => c.key === toCol);
    if (!target) { setDragging(null); setDragOver(null); return; }
    const newStatus = target.status;
    const newStage = target.stage;
    if (newStage !== dragging.card.workflowStage) {
      if (toCol === "converted" || toCol === "lost") {
        setConfirm({ title: "Move to " + (toCol === "converted" ? "Converted" : "Not Converted") + "?", msg: dragging.card.student + " status will change.", onConfirm: () => {
          setDemos((p) => p.map((d) => d.id === dragging.card.id ? { ...d, status: newStatus, workflowStage: newStage } : d));
          logActivity(toCol === "converted" ? "converted" : "not converted", "Kanban", dragging.card.student);
          flash(dragging.card.student + " moved");
        }});
      } else {
        setDemos((p) => p.map((d) => d.id === dragging.card.id ? { ...d, status: newStatus, workflowStage: newStage } : d));
      }
    }
    setDragging(null); setDragOver(null);
  };

  const total = Object.values(board).reduce((s, c) => s + c.length, 0);

  return (
    <>
      <section style={{ background: LIGHT_GRAY, padding: "88px 24px 12px" }}>
        <div className="animate-fade-up" style={{ maxWidth: 1200, margin: "0 auto" }}>
          <p className="section-label">Workflow</p>
          <h1 style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>Kanban board.</h1>
          <p style={{ fontSize: 15, color: MUTED, marginTop: 6 }}>{total} demos across {KCOLS.length} stages. Drag cards to update status.</p>
        </div>
      </section>
      <section style={{ background: LIGHT_GRAY, padding: "8px 24px 60px", minHeight: 460, overflowX: "auto" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(5, minmax(170px, 1fr))", gap: 8, alignItems: "start" }}>
          {KCOLS.map((col) => (
            <div key={col.key} onDragOver={(e) => { e.preventDefault(); setDragOver(col.key); }} onDragLeave={() => setDragOver(null)} onDrop={() => onDrop(col.key)}
              style={{ background: dragOver === col.key ? "rgba(0,113,227,.06)" : "rgba(232,232,237,.35)", borderRadius: 14, padding: "8px 6px", minHeight: 340, transition: "background .2s", border: dragOver === col.key ? "2px dashed " + BLUE : "2px solid transparent" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 6px 8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: col.color }} /><span style={{ fontSize: 12, fontWeight: 600 }}>{col.label}</span></div>
                <span style={{ fontSize: 11, fontWeight: 600, color: MUTED, background: "#fff", borderRadius: 980, padding: "2px 8px" }}>{board[col.key].length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {board[col.key].map((card) => {
                  const age = ageDays(card.ts);
                  return (
                    <div key={card.id} className="kanban-card" draggable onDragStart={() => setDragging({ card, from: col.key })}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                        <div><div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>{card.student}</div><div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>{card.teacher}</div></div>
                        <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 980, background: ageColor(age), color: ageTextColor(age), flexShrink: 0 }}>{age === 0 ? "Today" : age + "d"}</span>
                      </div>
                      <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>{card.level} {card.subject}</div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 5 }}>
                        <div>{card.pour.length > 0 ? card.pour.map((pp) => <span key={pp.cat} className="pour-tag" style={{ fontSize: 9 }}>{pp.cat}</span>) : <span style={{ fontSize: 9, color: MUTED, fontStyle: "italic" }}>No issues</span>}</div>
                        <Stars value={card.analystRating} readOnly onChange={() => {}} />
                      </div>
                    </div>
                  );
                })}
                {board[col.key].length === 0 && <EmptyState text="Drop here" />}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
