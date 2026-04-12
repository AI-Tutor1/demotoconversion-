import { useState, useMemo, useEffect, useRef } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Area, AreaChart
} from "recharts";

const B = "#0071e3";
const N = "#1d1d1f";
const G = "#f5f5f7";
const GR = "#86868b";

const TEACHERS = [
  { id: 1, name: "Shoaib Ghani", uid: 62 },
  { id: 2, name: "Rizwan Anwer", uid: 90 },
  { id: 3, name: "Sophia Abid", uid: 107 },
  { id: 4, name: "Nageena Arif", uid: 598 },
  { id: 5, name: "Inayat Karim", uid: 543 },
  { id: 6, name: "Rameesha Saleem", uid: 599 },
  { id: 7, name: "Hira Zafar", uid: 594 },
  { id: 8, name: "Maryam Imran", uid: 547 },
];
const LEVELS = ["IGCSE","A Level","A2 Level","O Level","AS Level","IB","IB DP","Grade 1-8","GCSE","AP","University"];
const SUBJECTS = ["Mathematics","Physics","Chemistry","Biology","English","Computer Science","Economics","Business Studies","Psychology","Further Mathematics","Statistics"];
const POUR_CATS = ["Video","Interaction","Technical","Cancellation","Resources","Time","No Show"];
const AGENTS = ["Maryam","Hoor","Muhammad"];
const ACCT_TYPES = ["Sales","Product","Consumer"];

const DAY = 864e5;
const NOW = Date.now();

const SEED = [
  { id:1, date:"2026-04-10", teacher:"Shoaib Ghani", tid:62, student:"Ahmed Khan", level:"IGCSE", subject:"Mathematics", pour:[{cat:"Video",desc:"Camera off 10 min"}], review:"Strong methodology but camera issues.", studentRaw:8, analystRating:4, status:"Pending", suggestions:"Keep camera on.", agent:"", comments:"", verbatim:"", acctType:"", link:"", marketing:false, ts:NOW-2*DAY },
  { id:2, date:"2026-04-09", teacher:"Nageena Arif", tid:598, student:"Sara Ali", level:"O Level", subject:"Chemistry", pour:[], review:"Excellent engagement throughout.", studentRaw:9, analystRating:5, status:"Pending", suggestions:"Add practice problems.", agent:"", comments:"", verbatim:"", acctType:"", link:"", marketing:false, ts:NOW-3*DAY },
  { id:3, date:"2026-04-08", teacher:"Rizwan Anwer", tid:90, student:"Hanna Mahmood", level:"A2 Level", subject:"Further Mathematics", pour:[{cat:"Resources",desc:"No visual aids"}], review:"Good pace, limited whiteboard.", studentRaw:7, analystRating:3, status:"Converted", suggestions:"Use whiteboard for proofs.", agent:"Maryam", comments:"Parent impressed. Closed same day.", verbatim:"The teacher was really smart.", acctType:"", link:"", marketing:false, ts:NOW-4*DAY },
  { id:4, date:"2026-04-07", teacher:"Sophia Abid", tid:107, student:"Omar Raza", level:"IGCSE", subject:"Physics", pour:[{cat:"Interaction",desc:"One-directional"},{cat:"Time",desc:"Ended early"}], review:"Rushed and one-directional.", studentRaw:5, analystRating:2, status:"Not Converted", suggestions:"Build rapport first.", agent:"Muhammad", comments:"Student found it too fast.", verbatim:"Too fast, did not understand.", acctType:"Product", link:"", marketing:false, ts:NOW-5*DAY },
  { id:5, date:"2026-04-11", teacher:"Inayat Karim", tid:543, student:"Layla Sheikh", level:"IB", subject:"Biology", pour:[], review:"Very interactive with great examples.", studentRaw:9, analystRating:5, status:"Pending", suggestions:"No improvements needed.", agent:"", comments:"", verbatim:"", acctType:"", link:"", marketing:false, ts:NOW-DAY },
  { id:6, date:"2026-04-08", teacher:"Maryam Imran", tid:547, student:"Zara Malik", level:"IGCSE", subject:"English", pour:[{cat:"Interaction",desc:"Did not adapt"},{cat:"Resources",desc:"Too advanced"}], review:"Prepared but inflexible.", studentRaw:6, analystRating:3, status:"Pending", suggestions:"Assess level before preparing.", agent:"", comments:"", verbatim:"", acctType:"", link:"", marketing:false, ts:NOW-4*DAY },
  { id:7, date:"2026-04-06", teacher:"Hira Zafar", tid:594, student:"Hassan Raza", level:"A Level", subject:"Physics", pour:[{cat:"Time",desc:"Ended 15 min early"}], review:"Good knowledge, ended early.", studentRaw:7, analystRating:4, status:"Pending", suggestions:"Use full session time.", agent:"", comments:"", verbatim:"", acctType:"", link:"", marketing:false, ts:NOW-6*DAY },
  { id:8, date:"2026-04-12", teacher:"Rameesha Saleem", tid:599, student:"Alina Farooq", level:"A Level", subject:"Economics", pour:[], review:"Excellent demo. Perfect structure.", studentRaw:10, analystRating:5, status:"Pending", suggestions:"Use as training example.", agent:"", comments:"", verbatim:"", acctType:"", link:"", marketing:true, ts:NOW },
  { id:9, date:"2026-03-15", teacher:"Shoaib Ghani", tid:62, student:"Bilal Ahmed", level:"IGCSE", subject:"Mathematics", pour:[], review:"Solid algebra session.", studentRaw:8, analystRating:4, status:"Converted", suggestions:"Add word problems.", agent:"Hoor", comments:"Quick close.", verbatim:"Very patient teacher.", acctType:"", link:"", marketing:false, ts:NOW-28*DAY },
  { id:10, date:"2026-03-10", teacher:"Inayat Karim", tid:543, student:"Fatima Noor", level:"IB", subject:"Biology", pour:[{cat:"Technical",desc:"Zoom disconnected"}], review:"Content great when connected.", studentRaw:6, analystRating:4, status:"Not Converted", suggestions:"Test connection.", agent:"Maryam", comments:"Chose local tutor.", verbatim:"Internet kept cutting out.", acctType:"Product", link:"", marketing:false, ts:NOW-33*DAY },
  { id:11, date:"2026-03-20", teacher:"Nageena Arif", tid:598, student:"Amina Shah", level:"IGCSE", subject:"Chemistry", pour:[], review:"Great session.", studentRaw:9, analystRating:5, status:"Converted", suggestions:"Continue.", agent:"Muhammad", comments:"Enrolled 3 months.", verbatim:"Loved the style.", acctType:"", link:"", marketing:false, ts:NOW-23*DAY },
  { id:12, date:"2026-03-05", teacher:"Sophia Abid", tid:107, student:"Tariq Hassan", level:"O Level", subject:"Physics", pour:[{cat:"Interaction",desc:"No questions"}], review:"Monotone delivery.", studentRaw:4, analystRating:2, status:"Not Converted", suggestions:"Style overhaul needed.", agent:"Hoor", comments:"Child was bored.", verbatim:"It was boring.", acctType:"Product", link:"", marketing:false, ts:NOW-38*DAY },
];

// Helpers
function ini(n) { return n.split(" ").map(w => w[0]).join(""); }
function ageDays(ts) { return Math.max(0, Math.floor((NOW - ts) / DAY)); }
function ageClr(d) { return d <= 1 ? "#E8F5E9" : d <= 3 ? "#FFF8E1" : "#FFEBEE"; }
function ageTxt(d) { return d <= 1 ? "#1B5E20" : d <= 3 ? "#8B6914" : "#B71C1C"; }
function fmtMonth(d) { const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; const p = d.split("-"); return m[parseInt(p[1]) - 1] + " " + p[0]; }
function inRange(dateStr, range) {
  if (range === "all") return true;
  const d = new Date(dateStr);
  const today = new Date("2026-04-12");
  const diff = (today - d) / DAY;
  if (range === "7d") return diff <= 7;
  if (range === "30d") return diff <= 30;
  if (range === "90d") return diff <= 90;
  return true;
}

function Badge({ status }) {
  const map = {
    Pending: { bg: "#FFF8E1", c: "#8B6914", d: "#F5A623" },
    Converted: { bg: "#E8F5E9", c: "#1B5E20", d: "#4CAF50" },
    "Not Converted": { bg: "#FFEBEE", c: "#B71C1C", d: "#E53935" },
  };
  const s = map[status] || map.Pending;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 12px", borderRadius: 980, fontSize: 12, fontWeight: 500, background: s.bg, color: s.c }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.d }} />
      {status}
    </span>
  );
}

function Field({ label, error, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: GR, marginBottom: 5 }}>{label}</label>
      {children}
      {error && <div style={{ fontSize: 11, color: "#E24B4A", marginTop: 3, fontWeight: 500 }}>{error}</div>}
    </div>
  );
}

function Stars({ value, onChange, readOnly }) {
  return (
    <div style={{ display: "flex", gap: 4 }} role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map(n => (
        <span
          key={n}
          tabIndex={readOnly ? -1 : 0}
          role={readOnly ? undefined : "radio"}
          aria-label={n + " stars"}
          onClick={() => !readOnly && onChange(n)}
          onKeyDown={e => {
            if (readOnly) return;
            if (e.key === "Enter" || e.key === " ") onChange(n);
            if (e.key === "ArrowRight" && value < 5) onChange(value + 1);
            if (e.key === "ArrowLeft" && value > 1) onChange(value - 1);
          }}
          style={{ cursor: readOnly ? "default" : "pointer", fontSize: readOnly ? 13 : 22, color: n <= value ? "#FF9F0A" : "#d2d2d7", outline: "none" }}
        >
          {n <= value ? "\u2605" : "\u2606"}
        </span>
      ))}
      {!readOnly && <span style={{ fontSize: 14, color: GR, marginLeft: 6, alignSelf: "center" }}>{value}/5</span>}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px", color: GR }}>
      <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.3 }}>&#9678;</div>
      <p style={{ fontSize: 14 }}>{text}</p>
    </div>
  );
}

function ConfirmModal({ title, msg, onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 250, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(6px)" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "28px 32px", maxWidth: 400, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
        <h3 style={{ fontSize: 19, fontWeight: 600, marginBottom: 8 }}>{title}</h3>
        <p style={{ fontSize: 14, color: GR, lineHeight: 1.5, marginBottom: 24 }}>{msg}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="pill po" onClick={onCancel} style={{ fontSize: 13 }}>Cancel</button>
          <button className="pill pb" onClick={onConfirm} style={{ fontSize: 13 }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════
export default function App() {
  const [view, setView] = useState("dashboard");
  const [demos, setDemos] = useState(SEED);
  const [selDemo, setSelDemo] = useState(null);
  const [toast, setToast] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const [drillT, setDrillT] = useState(null);
  const [bulkSel, setBulkSel] = useState([]);
  const [dateRange, setDateRange] = useState("all");
  const [confirm, setConfirm] = useState(null);
  const [activity, setActivity] = useState([
    { id: 1, action: "submitted", user: "Analyst", target: "Alina Farooq demo", time: "2 min ago" },
    { id: 2, action: "converted", user: "Hoor", target: "Bilal Ahmed", time: "1 hour ago" },
    { id: 3, action: "flagged POUR", user: "Analyst", target: "Hassan Raza", time: "3 hours ago" },
  ]);
  const notifRef = useRef(null);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 3500); };
  const logAct = (action, user, target) => setActivity(p => [{ id: Date.now(), action, user, target, time: "Just now" }, ...p].slice(0, 20));
  const nav = (v) => { setView(v); setSelDemo(null); setDrillT(null); setBulkSel([]); window.scrollTo(0, 0); };

  const rangedDemos = useMemo(() => demos.filter(d => inRange(d.date, dateRange)), [demos, dateRange]);
  const searchResults = useMemo(() => {
    if (!searchQ.trim()) return [];
    const q = searchQ.toLowerCase();
    return demos.filter(d => d.student.toLowerCase().includes(q) || d.teacher.toLowerCase().includes(q) || d.subject.toLowerCase().includes(q));
  }, [searchQ, demos]);

  const stats = useMemo(() => {
    const ds = rangedDemos;
    const t = ds.length;
    const c = ds.filter(d => d.status === "Converted").length;
    const p = ds.filter(d => d.status === "Pending").length;
    return {
      total: t, converted: c, pending: p, notConv: t - c - p,
      rate: t ? Math.round(c / t * 100) : 0,
      avgR: t ? (ds.reduce((s, d) => s + d.analystRating, 0) / t).toFixed(1) : "0",
      pourRate: t ? Math.round(ds.filter(d => d.pour.length > 0).length / t * 100) : 0,
    };
  }, [rangedDemos]);

  const notifs = useMemo(() => {
    return demos.filter(d => d.status === "Pending" && ageDays(d.ts) >= 3).map(d => ({
      id: d.id, text: d.student + " pending " + ageDays(d.ts) + " days", time: ageDays(d.ts) + "d",
    }));
  }, [demos]);

  useEffect(() => {
    if (!notifOpen) return;
    const h = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [notifOpen]);

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape" && searchOpen) setSearchOpen(false); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [searchOpen]);

  const exportCSV = (data) => {
    const h = ["Date","Teacher","Student","Level","Subject","POUR","Rating","Status","Agent","Accountability"];
    const rows = data.map(d => [d.date, d.teacher, d.student, d.level, d.subject, d.pour.map(p => p.cat).join("; "), d.analystRating, d.status, d.agent, d.acctType]);
    const csv = [h, ...rows].map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "demo_export.csv"; a.click();
    URL.revokeObjectURL(url);
    flash("CSV exported");
  };

  return (
    <div style={{ fontFamily: "-apple-system, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", color: N, background: "#fff", minHeight: "100vh" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input, select, textarea, button { font-family: inherit; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes toastA { 0% { transform: translateX(-50%) translateY(20px); opacity: 0; } 10% { transform: translateX(-50%) translateY(0); opacity: 1; } 85% { opacity: 1; } 100% { transform: translateX(-50%) translateY(-10px); opacity: 0; } }
        .fu { animation: fadeUp .5s ease both; }
        .fu1 { animation: fadeUp .5s ease .08s both; }
        .fu2 { animation: fadeUp .5s ease .16s both; }
        .si { animation: slideIn .4s ease both; }
        .ai { width: 100%; padding: 10px 14px; border-radius: 10px; border: 1px solid #d2d2d7; background: #fff; font-size: 15px; color: ${N}; outline: none; transition: border-color .2s, box-shadow .2s; }
        .ai:focus { border-color: ${B}; box-shadow: 0 0 0 3px rgba(0,113,227,.15); }
        .ai::placeholder { color: #86868b; }
        .ai.err { border-color: #E24B4A; }
        .at { min-height: 72px; resize: vertical; line-height: 1.47; }
        .as { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%2386868b' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 14px center; padding-right: 36px; }
        .pill { display: inline-flex; align-items: center; padding: 8px 20px; border-radius: 980px; font-size: 14px; cursor: pointer; transition: all .25s; border: none; }
        .pb { background: ${B}; color: #fff; }
        .pb:hover { background: #0077ED; }
        .po { background: transparent; color: ${B}; border: 1px solid ${B}; }
        .po:hover { background: ${B}; color: #fff; }
        .pw { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.4); }
        .pw:hover { background: rgba(255,255,255,.15); }
        .nb { font-size: 12px; font-weight: 400; color: rgba(255,255,255,.7); cursor: pointer; padding: 0 10px; line-height: 48px; background: none; border: none; transition: color .15s; }
        .nb:hover { color: #fff; }
        .nb.on { color: #fff; font-weight: 600; }
        .cc { background: #fff; border-radius: 16px; border: 1px solid #e8e8ed; padding: 24px; }
        .dc { background: #fff; border-radius: 12px; padding: 14px 18px; cursor: pointer; transition: all .2s; border: 1px solid #e8e8ed; }
        .dc:hover { transform: translateY(-1px); box-shadow: 0 2px 12px rgba(0,0,0,.06); }
        .dc.sel { border-color: ${B}; box-shadow: 0 0 0 3px rgba(0,113,227,.12); }
        .pt { display: inline-block; padding: 1px 8px; border-radius: 980px; font-size: 10px; font-weight: 600; background: #FFF3E0; color: #B25000; margin: 1px; }
        .ck { width: 18px; height: 18px; border-radius: 4px; border: 1.5px solid #d2d2d7; appearance: none; cursor: pointer; transition: all .15s; position: relative; vertical-align: middle; flex-shrink: 0; }
        .ck:checked { background: ${B}; border-color: ${B}; }
        .ck:checked::after { content: ''; position: absolute; top: 2px; left: 5px; width: 5px; height: 9px; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg); }
        .kc { background: #fff; border-radius: 12px; padding: 12px 14px; border: 1px solid #e8e8ed; cursor: grab; transition: box-shadow .2s, transform .15s; }
        .kc:hover { box-shadow: 0 3px 12px rgba(0,0,0,.08); transform: translateY(-1px); }
        .fs { background: rgba(255,255,255,.1); color: #fff; border: 1px solid rgba(255,255,255,.15); border-radius: 10px; padding: 6px 12px; font-size: 12px; outline: none; }
        .fs option { color: #000; }
        .fsl { background: #fff; color: ${N}; border: 1px solid #d2d2d7; border-radius: 10px; padding: 6px 12px; font-size: 12px; outline: none; }
        .toast { position: fixed; bottom: 32px; left: 50%; background: ${N}; color: #fff; padding: 12px 28px; border-radius: 980px; font-size: 14px; font-weight: 500; z-index: 300; animation: toastA 3.5s ease both; box-shadow: 0 4px 24px rgba(0,0,0,.2); }
      `}</style>

      {/* ═══ NAV ═══ */}
      <nav style={{ position: "sticky", top: 0, zIndex: 100, height: 48, display: "flex", justifyContent: "center", background: "rgba(0,0,0,.85)", backdropFilter: "saturate(180%) blur(20px)" }}>
        <div style={{ display: "flex", alignItems: "center", maxWidth: 1200, width: "100%", padding: "0 16px" }}>
          <svg width="14" height="17" viewBox="0 0 17 21" fill="#fff" style={{ marginRight: 16, flexShrink: 0 }}>
            <path d="M15.5 17.4c-.8 1.2-1.7 2.4-3 2.4-1.3 0-1.7-.8-3.2-.8s-2 .8-3.2.8c-1.3 0-2.3-1.3-3.1-2.5C1.2 14.6.2 11 1.5 8.6c.9-1.6 2.4-2.7 4-2.7 1.3 0 2.3.9 3.1.9.8 0 2-.9 3.4-.8.6 0 2.2.2 3.2 1.7-2.8 1.7-2.3 5.9.3 7.1zM12 3.6c.7-.9 1.2-2.1 1.1-3.3-1.1.1-2.3.7-3.1 1.6-.7.8-1.3 2-1.1 3.2 1.2.1 2.3-.6 3.1-1.5z" />
          </svg>
          <div style={{ display: "flex", alignItems: "center", flex: 1, overflow: "auto" }}>
            {["Dashboard", "Analyst", "Sales", "Kanban", "Analytics", "Teachers"].map(v => (
              <button key={v} className={"nb" + (view === v.toLowerCase() ? " on" : "")} onClick={() => nav(v.toLowerCase())}>{v}</button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <select value={dateRange} onChange={e => setDateRange(e.target.value)} className="fs" style={{ fontSize: 11, padding: "4px 8px" }}>
              <option value="all">All time</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
              <option value="90d">90 days</option>
            </select>
            <button onClick={() => { setSearchOpen(true); setSearchQ(""); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
              <svg width="15" height="15" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="1.5"><circle cx="6.5" cy="6.5" r="5" /><line x1="10" y1="10" x2="14" y2="14" strokeLinecap="round" /></svg>
            </button>
            <div ref={notifRef} style={{ position: "relative" }}>
              <button onClick={() => setNotifOpen(p => !p)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, position: "relative" }}>
                <svg width="15" height="15" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="1.5"><path d="M7.5 1a4 4 0 014 4c0 2.7 1.5 3.5 1.5 3.5H2S3.5 7.7 3.5 5a4 4 0 014-4zM6 12a1.5 1.5 0 003 0" strokeLinecap="round" /></svg>
                {notifs.length > 0 && <span style={{ position: "absolute", top: -1, right: -3, width: 14, height: 14, borderRadius: "50%", background: "#FF3B30", color: "#fff", fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{notifs.length}</span>}
              </button>
              {notifOpen && (
                <div className="si" style={{ position: "absolute", right: 0, top: 40, width: 280, background: "#fff", borderRadius: 14, boxShadow: "0 12px 40px rgba(0,0,0,.2)", overflow: "hidden", zIndex: 150 }}>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid #e8e8ed", fontSize: 13, fontWeight: 600 }}>Notifications ({notifs.length})</div>
                  {notifs.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: GR, fontSize: 13 }}>All clear</div> : notifs.map(n => (
                    <div key={n.id} style={{ padding: "10px 16px", borderBottom: "1px solid #f5f5f7", display: "flex", gap: 10, alignItems: "start" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#FF9F0A", flexShrink: 0, marginTop: 5 }} />
                      <div>
                        <div style={{ fontSize: 13, lineHeight: 1.4 }}>{n.text}</div>
                        <div style={{ fontSize: 11, color: GR, marginTop: 1 }}>{n.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => exportCSV(rangedDemos)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }} title="Export CSV">
              <svg width="15" height="15" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="1.5" strokeLinecap="round"><path d="M7.5 2v8M4 7l3.5 3 3.5-3M2 12h11" /></svg>
            </button>
          </div>
        </div>
      </nav>

      {/* Search overlay */}
      {searchOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 80, backdropFilter: "blur(8px)" }} onClick={() => setSearchOpen(false)}>
          <div style={{ width: "100%", maxWidth: 560, background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,.25)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", padding: "12px 18px", gap: 10, borderBottom: "1px solid #e8e8ed" }}>
              <svg width="16" height="16" fill="none" stroke={GR} strokeWidth="1.5"><circle cx="7" cy="7" r="5.5" /><line x1="11" y1="11" x2="15" y2="15" strokeLinecap="round" /></svg>
              <input autoFocus value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search students, teachers, subjects..." style={{ flex: 1, border: "none", outline: "none", fontSize: 16 }} />
              <button onClick={() => setSearchOpen(false)} style={{ background: G, border: "none", borderRadius: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer", color: GR }}>ESC</button>
            </div>
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {searchQ.trim() && searchResults.length === 0 && <EmptyState text="No results found" />}
              {searchResults.slice(0, 8).map(d => (
                <div key={d.id} style={{ padding: "10px 18px", borderBottom: "1px solid #f5f5f7", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                  onClick={() => { setSearchOpen(false); setView("sales"); setSelDemo(d.id); }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{d.student}</div>
                    <div style={{ fontSize: 12, color: GR }}>{d.teacher} · {d.subject} · {d.date}</div>
                  </div>
                  <Badge status={d.status} />
                </div>
              ))}
              {!searchQ.trim() && <div style={{ padding: 28, textAlign: "center", color: GR, fontSize: 14 }}>Type to search across all demos</div>}
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
      {confirm && <ConfirmModal title={confirm.title} msg={confirm.msg} onConfirm={() => { confirm.onConfirm(); setConfirm(null); }} onCancel={() => setConfirm(null)} />}

      {view === "dashboard" && <DashView stats={stats} demos={rangedDemos} nav={nav} activity={activity} dateRange={dateRange} />}
      {view === "analyst" && <AnalystV setDemos={setDemos} flash={flash} logAct={logAct} />}
      {view === "sales" && <SalesV demos={rangedDemos} setDemos={setDemos} selDemo={selDemo} setSelDemo={setSelDemo} flash={flash} bulkSel={bulkSel} setBulkSel={setBulkSel} setConfirm={setConfirm} logAct={logAct} exportCSV={exportCSV} />}
      {view === "kanban" && <KanbanV demos={rangedDemos} setDemos={setDemos} flash={flash} setConfirm={setConfirm} logAct={logAct} />}
      {view === "analytics" && <AnalyticsV demos={rangedDemos} />}
      {view === "teachers" && <TeachersV demos={rangedDemos} drill={drillT} setDrill={setDrillT} />}
    </div>
  );
}

// ═══════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════
function DashView({ stats, demos, nav, activity, dateRange }) {
  return (
    <>
      <section style={{ background: "#000", color: "#fff", paddingTop: 104, paddingBottom: 64, textAlign: "center" }}>
        <div className="fu" style={{ maxWidth: 680, margin: "0 auto", padding: "0 24px" }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: GR, textTransform: "uppercase", letterSpacing: "0.5px" }}>Demo to Conversion</p>
          <h1 style={{ fontSize: 48, fontWeight: 600, lineHeight: 1.07, letterSpacing: "-0.28px", marginTop: 6 }}>Analysis Platform</h1>
          <p style={{ fontSize: 21, fontWeight: 400, lineHeight: 1.19, color: "rgba(255,255,255,.6)", marginTop: 16 }}>Track, evaluate, and convert demo sessions into enrollments.</p>
          <div style={{ marginTop: 28, display: "flex", gap: 12, justifyContent: "center" }}>
            <button className="pill pb" onClick={() => nav("analyst")}>New demo review</button>
            <button className="pill pw" onClick={() => nav("kanban")}>Kanban board</button>
          </div>
          {dateRange !== "all" && <p style={{ fontSize: 12, color: GR, marginTop: 16 }}>Showing: last {dateRange}</p>}
        </div>
      </section>
      <section style={{ background: G, padding: "44px 24px" }}>
        <div className="fu1" style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          {[
            { l: "Total demos", v: stats.total, c: N },
            { l: "Conversion rate", v: stats.rate + "%", c: stats.rate >= 40 ? "#1b8a4a" : "#B25000" },
            { l: "Pending", v: stats.pending, c: "#B25000" },
            { l: "Avg. rating", v: stats.avgR + "/5", c: B },
            { l: "POUR rate", v: stats.pourRate + "%", c: "#AF52DE" },
            { l: "Not converted", v: stats.notConv, c: "#c13030" },
          ].map((m, i) => (
            <div key={i} style={{ background: "#fff", borderRadius: 14, padding: "18px 20px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
              <div style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.1, color: m.c }}>{m.v}</div>
              <div style={{ fontSize: 11, fontWeight: 500, color: GR, marginTop: 5 }}>{m.l}</div>
            </div>
          ))}
        </div>
      </section>
      <section style={{ background: "#fff", padding: "44px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,300px)", gap: 24 }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>Recent demos</h2>
            {demos.slice(0, 6).map(d => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f0f0f0", gap: 8, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: G, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }}>{ini(d.student)}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{d.student}</div>
                    <div style={{ fontSize: 11, color: GR }}>{d.teacher} · {d.subject} · {d.date}</div>
                  </div>
                </div>
                <Badge status={d.status} />
              </div>
            ))}
          </div>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>Activity log</h2>
            {activity.slice(0, 8).map(a => (
              <div key={a.id} style={{ display: "flex", gap: 8, padding: "8px 0", borderBottom: "1px solid #f5f5f7", alignItems: "start" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: a.action === "converted" ? "#30D158" : a.action.includes("escalat") ? "#FF3B30" : B, flexShrink: 0, marginTop: 5 }} />
                <div>
                  <div style={{ fontSize: 13, lineHeight: 1.4 }}><strong>{a.user}</strong> {a.action} <span style={{ color: B }}>{a.target}</span></div>
                  <div style={{ fontSize: 11, color: GR }}>{a.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

// ═══════════════════════════════════════════
// ANALYST
// ═══════════════════════════════════════════
function AnalystV({ setDemos, flash, logAct }) {
  const blank = { date: new Date().toISOString().split("T")[0], teacher: "", student: "", level: "", subject: "", pour: {}, methodology: "", engagement: "", suggestions: "", improvement: "", studentRaw: 7, analystRating: 0 };
  const [f, setF] = useState(blank);
  const [errors, setErrors] = useState({});
  const u = (k, v) => { setF(p => ({ ...p, [k]: v })); setErrors(p => ({ ...p, [k]: undefined })); };
  const togglePour = (cat) => setF(p => { const np = { ...p.pour }; if (np[cat] !== undefined) delete np[cat]; else np[cat] = ""; return { ...p, pour: np }; });

  const validate = () => {
    const e = {};
    if (!f.teacher) e.teacher = "Required";
    if (!f.student || f.student.length < 2) e.student = "Min 2 characters";
    if (!f.level) e.level = "Required";
    if (!f.subject) e.subject = "Required";
    if (!f.analystRating) e.analystRating = "Please rate";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = () => {
    if (!validate()) { flash("Please fix the errors above"); return; }
    const t = TEACHERS.find(x => x.name === f.teacher);
    const pourArr = Object.entries(f.pour).map(([cat, desc]) => ({ cat, desc }));
    setDemos(p => [{
      id: Date.now(), date: f.date, teacher: f.teacher, tid: t ? t.uid : 0, student: f.student, level: f.level, subject: f.subject, pour: pourArr, review: f.methodology, studentRaw: f.studentRaw, analystRating: f.analystRating, status: "Pending", suggestions: f.suggestions, improvement: f.improvement, agent: "", comments: "", verbatim: "", acctType: "", link: "", marketing: false, ts: Date.now(),
    }, ...p]);
    logAct("submitted", "Analyst", f.student + " demo");
    flash("Demo submitted to sales queue");
    setF(blank);
    setErrors({});
  };

  const derivedMonth = f.date ? fmtMonth(f.date) : "";

  return (
    <>
      <section style={{ background: G, paddingTop: 92, paddingBottom: 40 }}>
        <div className="fu" style={{ maxWidth: 640, margin: "0 auto", padding: "0 24px" }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: GR, textTransform: "uppercase", letterSpacing: "0.5px" }}>Steps 1 – 5</p>
          <h1 style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>Analyst review.</h1>
          <p style={{ fontSize: 17, color: GR, lineHeight: 1.47, marginTop: 8 }}>Record your demo evaluation across all dimensions.</p>
        </div>
      </section>
      <section style={{ background: "#fff", padding: "40px 24px 80px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          {/* Session Info */}
          <div style={{ marginBottom: 36 }}>
            <h3 style={{ fontSize: 21, fontWeight: 600, marginBottom: 4 }}><span style={{ color: B, fontSize: 12, fontWeight: 600, marginRight: 12 }}>01</span>Session information</h3>
            <p style={{ fontSize: 14, color: GR, marginBottom: 20 }}>Basic demo data and teacher selection.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field label="Demo date *">
                <input type="date" className="ai" value={f.date} onChange={e => u("date", e.target.value)} />
                {derivedMonth && <div style={{ fontSize: 11, color: B, marginTop: 4, fontWeight: 500 }}>Month: {derivedMonth}</div>}
              </Field>
              <Field label="Teacher *" error={errors.teacher}>
                <select className={"ai as" + (errors.teacher ? " err" : "")} value={f.teacher} onChange={e => u("teacher", e.target.value)}>
                  <option value="">Select teacher...</option>
                  {TEACHERS.map(t => <option key={t.id} value={t.name}>{t.name} (ID: {t.uid})</option>)}
                </select>
              </Field>
            </div>
            <Field label="Student name *" error={errors.student}>
              <input className={"ai" + (errors.student ? " err" : "")} placeholder="Full name" value={f.student} onChange={e => u("student", e.target.value)} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field label="Level *" error={errors.level}>
                <select className={"ai as" + (errors.level ? " err" : "")} value={f.level} onChange={e => u("level", e.target.value)}>
                  <option value="">Select...</option>
                  {LEVELS.map(l => <option key={l}>{l}</option>)}
                </select>
              </Field>
              <Field label="Subject *" error={errors.subject}>
                <select className={"ai as" + (errors.subject ? " err" : "")} value={f.subject} onChange={e => u("subject", e.target.value)}>
                  <option value="">Select...</option>
                  {SUBJECTS.map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
            </div>
          </div>

          {/* POUR */}
          <div style={{ marginBottom: 36 }}>
            <h3 style={{ fontSize: 21, fontWeight: 600, marginBottom: 4 }}><span style={{ color: B, fontSize: 12, fontWeight: 600, marginRight: 12 }}>02</span>POUR issue flags</h3>
            <p style={{ fontSize: 14, color: GR, marginBottom: 20 }}>Flag issues and describe each one.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {POUR_CATS.map(cat => (
                <div key={cat}>
                  <label style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 10, background: f.pour[cat] !== undefined ? "#FFF3E0" : G, border: f.pour[cat] !== undefined ? "1px solid #E8A040" : "1px solid #e8e8ed", cursor: "pointer", fontSize: 14, fontWeight: 500, color: f.pour[cat] !== undefined ? "#8B5000" : N }}>
                    <input type="checkbox" className="ck" checked={f.pour[cat] !== undefined} onChange={() => togglePour(cat)} />{cat}
                  </label>
                  {f.pour[cat] !== undefined && (
                    <input className="ai" style={{ marginTop: 6, fontSize: 13 }} placeholder={"Describe the " + cat.toLowerCase() + " issue..."} value={f.pour[cat]} onChange={e => setF(p => ({ ...p, pour: { ...p.pour, [cat]: e.target.value } }))} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Review */}
          <div style={{ marginBottom: 36 }}>
            <h3 style={{ fontSize: 21, fontWeight: 600, marginBottom: 4 }}><span style={{ color: B, fontSize: 12, fontWeight: 600, marginRight: 12 }}>03</span>Qualitative review</h3>
            <p style={{ fontSize: 14, color: GR, marginBottom: 20 }}>Evaluate across structured dimensions.</p>
            <Field label="Methodology & engagement"><textarea className="ai at" placeholder="Teaching approach, student participation..." value={f.methodology} onChange={e => u("methodology", e.target.value)} /></Field>
            <Field label="Suggestions"><textarea className="ai at" placeholder="Recommendations..." value={f.suggestions} onChange={e => u("suggestions", e.target.value)} /></Field>
            <Field label="Point of improvement"><input className="ai" placeholder="Key focus area" value={f.improvement} onChange={e => u("improvement", e.target.value)} /></Field>
          </div>

          {/* Ratings */}
          <div style={{ marginBottom: 36 }}>
            <h3 style={{ fontSize: 21, fontWeight: 600, marginBottom: 4 }}><span style={{ color: B, fontSize: 12, fontWeight: 600, marginRight: 12 }}>04</span>Feedback & ratings</h3>
            <p style={{ fontSize: 14, color: GR, marginBottom: 20 }}>Student feedback + your analyst rating.</p>
            <Field label={"Student rating: " + f.studentRaw + "/10 \u2192 " + Math.round(f.studentRaw / 2) + "/5"}>
              <input type="range" min="1" max="10" step="1" value={f.studentRaw} onChange={e => u("studentRaw", Number(e.target.value))} style={{ width: "100%", accentColor: B }} />
            </Field>
            <Field label="Analyst rating *" error={errors.analystRating}>
              <Stars value={f.analystRating} onChange={v => u("analystRating", v)} />
            </Field>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <button className="pill po" onClick={() => { setF(blank); setErrors({}); }}>Reset</button>
            <button className="pill pb" style={{ padding: "12px 32px", fontSize: 17 }} onClick={submit}>Submit to sales queue</button>
          </div>
        </div>
      </section>
    </>
  );
}

// ═══════════════════════════════════════════
// SALES
// ═══════════════════════════════════════════
function SalesV({ demos, setDemos, selDemo, setSelDemo, flash, bulkSel, setBulkSel, setConfirm, logAct, exportCSV }) {
  const [fStatus, setFStatus] = useState("All");
  const [fTeacher, setFTeacher] = useState("");
  const [fAgent, setFAgent] = useState("");
  const [sort, setSort] = useState("date-desc");
  const [sf, setSf] = useState({ status: "Converted", agent: "", contact: "", comments: "", verbatim: "", marketing: false, link: "", acctType: "" });

  const filtered = useMemo(() => {
    let d = demos.filter(x => {
      if (fStatus !== "All" && x.status !== fStatus) return false;
      if (fTeacher && x.teacher !== fTeacher) return false;
      if (fAgent && x.agent !== fAgent) return false;
      return true;
    });
    if (sort === "date-desc") d = [...d].sort((a, b) => new Date(b.date) - new Date(a.date));
    if (sort === "date-asc") d = [...d].sort((a, b) => new Date(a.date) - new Date(b.date));
    if (sort === "rating-desc") d = [...d].sort((a, b) => b.analystRating - a.analystRating);
    if (sort === "age-desc") d = [...d].sort((a, b) => a.ts - b.ts);
    return d;
  }, [demos, fStatus, fTeacher, fAgent, sort]);

  const sel = demos.find(d => d.id === selDemo);
  const hasFilters = fStatus !== "All" || fTeacher || fAgent;
  const allSel = filtered.length > 0 && filtered.every(d => bulkSel.includes(d.id));
  const toggleAll = () => { if (allSel) setBulkSel([]); else setBulkSel(filtered.map(d => d.id)); };
  const toggleBulk = (id) => setBulkSel(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const suggestedAcct = useMemo(() => {
    if (!sel) return "";
    if (sel.analystRating <= 2 || sel.pour.length > 0) return "Product";
    if (sel.analystRating >= 4 && sel.studentRaw >= 7) return "Sales";
    return "Consumer";
  }, [sel]);

  const submitSales = () => {
    if (!selDemo) return;
    setConfirm({
      title: "Mark as " + sf.status + "?",
      msg: "This will change " + sel.student + "'s status to \"" + sf.status + "\".",
      onConfirm: () => {
        setDemos(p => p.map(d => d.id === selDemo ? { ...d, status: sf.status, agent: sf.agent, comments: sf.comments, verbatim: sf.verbatim, link: sf.link, acctType: sf.acctType, marketing: sf.marketing } : d));
        logAct(sf.status === "Converted" ? "converted" : "marked not converted", sf.agent || "Sales", sel.student);
        flash("Demo marked as " + sf.status);
        setSelDemo(null);
        setSf({ status: "Converted", agent: "", contact: "", comments: "", verbatim: "", marketing: false, link: "", acctType: "" });
      },
    });
  };

  const bulkUpdate = (ns) => {
    setConfirm({
      title: "Bulk update " + bulkSel.length + " demos?",
      msg: "Mark " + bulkSel.length + " demos as \"" + ns + "\". This cannot be undone.",
      onConfirm: () => {
        setDemos(p => p.map(d => bulkSel.includes(d.id) ? { ...d, status: ns } : d));
        logAct("bulk " + ns.toLowerCase(), "Sales", bulkSel.length + " demos");
        flash(bulkSel.length + " demos marked as " + ns);
        setBulkSel([]);
      },
    });
  };

  return (
    <>
      <section style={{ background: "#000", color: "#fff", paddingTop: 92, paddingBottom: 24 }}>
        <div className="fu" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: GR, textTransform: "uppercase" }}>Step 8 + 10</p>
          <h1 style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>Sales follow-up.</h1>
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            {["All", "Pending", "Converted", "Not Converted"].map(f2 => (
              <button key={f2} className="pill" onClick={() => { setFStatus(f2); setSelDemo(null); setBulkSel([]); }}
                style={{ background: fStatus === f2 ? "rgba(255,255,255,.15)" : "transparent", color: fStatus === f2 ? "#fff" : "rgba(255,255,255,.5)", border: "1px solid " + (fStatus === f2 ? "rgba(255,255,255,.3)" : "rgba(255,255,255,.1)"), fontSize: 12, padding: "5px 14px" }}>{f2}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <select value={fTeacher} onChange={e => setFTeacher(e.target.value)} className="fs"><option value="">All teachers</option>{TEACHERS.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}</select>
            <select value={fAgent} onChange={e => setFAgent(e.target.value)} className="fs"><option value="">All agents</option>{AGENTS.map(a => <option key={a} value={a}>{a}</option>)}</select>
            <select value={sort} onChange={e => setSort(e.target.value)} className="fs"><option value="date-desc">Newest</option><option value="date-asc">Oldest</option><option value="rating-desc">Highest rated</option><option value="age-desc">Longest pending</option></select>
            {hasFilters && <button className="pill" style={{ background: "rgba(255,255,255,.1)", color: "#fff", border: "1px solid rgba(255,255,255,.2)", fontSize: 11, padding: "4px 12px" }} onClick={() => { setFStatus("All"); setFTeacher(""); setFAgent(""); }}>Clear all</button>}
          </div>
          <div style={{ fontSize: 12, color: GR, marginTop: 8 }}>{filtered.length} demos · <button style={{ background: "none", border: "none", color: "#2997ff", cursor: "pointer", fontSize: 12 }} onClick={() => exportCSV(filtered)}>Export filtered CSV</button></div>
        </div>
      </section>
      {bulkSel.length > 0 && (
        <div style={{ background: B, color: "#fff", padding: "8px 24px", display: "flex", alignItems: "center", justifyContent: "center", gap: 14, fontSize: 13, fontWeight: 500 }}>
          <span>{bulkSel.length} selected</span>
          <button className="pill" style={{ background: "#fff", color: B, padding: "5px 14px", fontSize: 12, border: "none" }} onClick={() => bulkUpdate("Converted")}>Mark converted</button>
          <button className="pill" style={{ background: "rgba(255,255,255,.2)", color: "#fff", padding: "5px 14px", fontSize: 12, border: "none" }} onClick={() => bulkUpdate("Not Converted")}>Mark not converted</button>
          <button className="pill" style={{ background: "transparent", color: "#fff", padding: "5px 14px", fontSize: 12, border: "1px solid rgba(255,255,255,.4)" }} onClick={() => setBulkSel([])}>Clear</button>
        </div>
      )}
      <section style={{ background: G, padding: "20px 24px 80px", minHeight: 400 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: sel ? "minmax(0,380px) minmax(0,1fr)" : "1fr", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0 8px" }}>
              <input type="checkbox" className="ck" checked={allSel} onChange={toggleAll} />
              <span style={{ fontSize: 12, color: GR }}>Select all ({filtered.length})</span>
            </div>
            {filtered.length === 0 && <EmptyState text="No demos match filters" />}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {filtered.map(d => {
                const age = ageDays(d.ts);
                return (
                  <div key={d.id} className={"dc" + (selDemo === d.id ? " sel" : "")} style={{ display: "flex", gap: 10, alignItems: "start" }} onClick={() => setSelDemo(d.id)}>
                    <input type="checkbox" className="ck" checked={bulkSel.includes(d.id)} onChange={() => toggleBulk(d.id)} onClick={e => e.stopPropagation()} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 6 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500 }}>{d.student}</div>
                          <div style={{ fontSize: 11, color: GR, marginTop: 1 }}>{d.teacher} · {d.level} {d.subject}</div>
                          <div style={{ fontSize: 11, color: GR }}>
                            {d.date}
                            {d.status === "Pending" && age > 1 && <span style={{ marginLeft: 6, padding: "1px 7px", borderRadius: 980, fontSize: 10, fontWeight: 600, background: ageClr(age), color: ageTxt(age) }}>{age}d</span>}
                          </div>
                        </div>
                        <Badge status={d.status} />
                      </div>
                      {d.pour.length > 0 && <div style={{ marginTop: 4 }}>{d.pour.map(p => <span key={p.cat} className="pt">{p.cat}</span>)}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {sel && (
            <div className="si" style={{ background: "#fff", borderRadius: 16, padding: "24px 28px", border: "1px solid #e8e8ed" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: 22, fontWeight: 600 }}>{sel.student}</h3>
                  <p style={{ fontSize: 13, color: GR, marginTop: 3 }}>{sel.teacher} (ID: {sel.tid}) · {sel.level} {sel.subject} · {fmtMonth(sel.date)}</p>
                </div>
                <button onClick={() => setSelDemo(null)} style={{ background: G, border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 14, color: GR, display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u2715"}</button>
              </div>
              {/* Analyst context */}
              <div style={{ background: G, borderRadius: 12, padding: "14px 18px", marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: GR, textTransform: "uppercase", marginBottom: 6 }}>Analyst review</div>
                <p style={{ fontSize: 13, lineHeight: 1.47 }}>{sel.review || "No review."}</p>
                {sel.pour.length > 0 && <div style={{ marginTop: 8 }}>{sel.pour.map(p => <div key={p.cat} style={{ marginBottom: 4 }}><span className="pt">{p.cat}</span>{p.desc && <span style={{ fontSize: 12, color: GR, marginLeft: 6 }}>{p.desc}</span>}</div>)}</div>}
                <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
                  <span style={{ fontSize: 12, color: GR }}>Student: <strong>{Math.round(sel.studentRaw / 2)}/5</strong></span>
                  <span style={{ fontSize: 12, color: GR }}>Analyst: <strong>{sel.analystRating}/5</strong></span>
                </div>
                {sel.suggestions && <p style={{ fontSize: 12, color: B, marginTop: 6, fontWeight: 500 }}>Suggestion: {sel.suggestions}</p>}
              </div>
              {/* Sales fields */}
              <div style={{ fontSize: 11, fontWeight: 600, color: GR, textTransform: "uppercase", marginBottom: 10 }}>Sales input</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Conversion status"><select className="ai as" value={sf.status} onChange={e => setSf(p => ({ ...p, status: e.target.value }))}><option>Converted</option><option>Not Converted</option><option>Pending</option></select></Field>
                <Field label="Sales agent"><select className="ai as" value={sf.agent} onChange={e => setSf(p => ({ ...p, agent: e.target.value }))}><option value="">Select...</option>{AGENTS.map(a => <option key={a}>{a}</option>)}</select></Field>
              </div>
              <Field label="Sales comments"><textarea className="ai at" placeholder="Analysis..." value={sf.comments} onChange={e => setSf(p => ({ ...p, comments: e.target.value }))} /></Field>
              <Field label="Student review (verbatim)"><textarea className="ai at" placeholder="Exact student words..." value={sf.verbatim} onChange={e => setSf(p => ({ ...p, verbatim: e.target.value }))} /></Field>
              <Field label="Link"><input className="ai" placeholder="https://..." value={sf.link} onChange={e => setSf(p => ({ ...p, link: e.target.value }))} /></Field>
              {/* Step 10 */}
              {sf.status === "Not Converted" && (
                <div style={{ background: "#FFF8E1", borderRadius: 12, padding: "14px 18px", marginTop: 8, border: "1px solid #F5D98E" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#8B6914", textTransform: "uppercase", marginBottom: 6 }}>Step 10 — Accountability</div>
                  {suggestedAcct && <p style={{ fontSize: 12, color: "#8B6914", marginBottom: 8 }}>Suggested: <strong>{suggestedAcct}</strong></p>}
                  <select className="ai as" value={sf.acctType} onChange={e => setSf(p => ({ ...p, acctType: e.target.value }))}>
                    <option value="">Select type...</option>
                    {ACCT_TYPES.map(a => <option key={a}>{a}</option>)}
                  </select>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0" }}>
                <input type="checkbox" className="ck" checked={sf.marketing} onChange={e => setSf(p => ({ ...p, marketing: e.target.checked }))} /><span style={{ fontSize: 14 }}>Marketing lead</span>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                <button className="pill pb" style={{ padding: "10px 24px", fontSize: 15 }} onClick={submitSales}>Update demo</button>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

// ═══════════════════════════════════════════
// KANBAN (derived from demos)
// ═══════════════════════════════════════════
function KanbanV({ demos, setDemos, flash, setConfirm, logAct }) {
  const KCOLS = [
    { key: "new", label: "New", color: B },
    { key: "review", label: "Under review", color: "#AF52DE" },
    { key: "pending", label: "Pending sales", color: "#FF9F0A" },
    { key: "converted", label: "Converted", color: "#30D158" },
    { key: "lost", label: "Not converted", color: "#E24B4A" },
  ];

  const board = useMemo(() => {
    const b = { new: [], review: [], pending: [], converted: [], lost: [] };
    demos.forEach(d => {
      const card = { ...d, age: ageDays(d.ts) };
      if (d.status === "Converted") b.converted.push(card);
      else if (d.status === "Not Converted") b.lost.push(card);
      else if (d.analystRating > 0 && d.review) b.pending.push(card);
      else b.new.push(card);
    });
    return b;
  }, [demos]);

  const [dragOver, setDragOver] = useState(null);
  const [dragging, setDragging] = useState(null);

  const onDrop = (toCol) => {
    if (!dragging) { setDragOver(null); return; }
    const statusMap = { converted: "Converted", lost: "Not Converted", new: "Pending", review: "Pending", pending: "Pending" };
    const newStatus = statusMap[toCol] || "Pending";
    if (newStatus !== dragging.card.status) {
      if (toCol === "converted" || toCol === "lost") {
        setConfirm({
          title: "Move to " + (toCol === "converted" ? "Converted" : "Not Converted") + "?",
          msg: dragging.card.student + "'s status will be changed.",
          onConfirm: () => {
            setDemos(p => p.map(d => d.id === dragging.card.id ? { ...d, status: newStatus } : d));
            logAct(toCol === "converted" ? "converted" : "not converted", "Kanban", dragging.card.student);
            flash(dragging.card.student + " moved");
          },
        });
      } else {
        setDemos(p => p.map(d => d.id === dragging.card.id ? { ...d, status: newStatus } : d));
      }
    }
    setDragging(null);
    setDragOver(null);
  };

  const total = Object.values(board).reduce((s, c) => s + c.length, 0);

  return (
    <>
      <section style={{ background: G, padding: "88px 24px 12px" }}>
        <div className="fu" style={{ maxWidth: 1200, margin: "0 auto" }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: GR, textTransform: "uppercase" }}>Workflow</p>
          <h1 style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>Kanban board.</h1>
          <p style={{ fontSize: 15, color: GR, marginTop: 6 }}>{total} demos across {KCOLS.length} stages. Drag cards to update status.</p>
        </div>
      </section>
      <section style={{ background: G, padding: "8px 24px 60px", minHeight: 460, overflowX: "auto" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(" + KCOLS.length + ", minmax(170px, 1fr))", gap: 8, alignItems: "start" }}>
          {KCOLS.map(col => (
            <div key={col.key}
              onDragOver={e => { e.preventDefault(); setDragOver(col.key); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => onDrop(col.key)}
              style={{ background: dragOver === col.key ? "rgba(0,113,227,.06)" : "rgba(232,232,237,.35)", borderRadius: 14, padding: "8px 6px", minHeight: 340, transition: "background .2s", border: dragOver === col.key ? "2px dashed " + B : "2px solid transparent" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 6px 8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: col.color }} />
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{col.label}</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: GR, background: "#fff", borderRadius: 980, padding: "2px 8px" }}>{board[col.key].length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {board[col.key].map(card => (
                  <div key={card.id} className="kc" draggable onDragStart={() => setDragging({ card, from: col.key })}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>{card.student}</div>
                        <div style={{ fontSize: 10, color: GR, marginTop: 1 }}>{card.teacher}</div>
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 980, background: ageClr(card.age), color: ageTxt(card.age), flexShrink: 0 }}>{card.age === 0 ? "Today" : card.age + "d"}</span>
                    </div>
                    <div style={{ fontSize: 10, color: GR, marginTop: 4 }}>{card.level} {card.subject}</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 5 }}>
                      <div>{card.pour.length > 0 ? card.pour.map(p => <span key={p.cat} className="pt" style={{ fontSize: 9 }}>{p.cat}</span>) : <span style={{ fontSize: 9, color: GR, fontStyle: "italic" }}>No issues</span>}</div>
                      <Stars value={card.analystRating} readOnly onChange={() => {}} />
                    </div>
                  </div>
                ))}
                {board[col.key].length === 0 && <EmptyState text="Drop here" />}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

// ═══════════════════════════════════════════
// ANALYTICS (all computed from live data)
// ═══════════════════════════════════════════
function AnalyticsV({ demos }) {
  const monthly = useMemo(() => {
    const m = {};
    demos.forEach(d => {
      const mo = fmtMonth(d.date);
      if (!m[mo]) m[mo] = { m: mo, demos: 0, converted: 0, ratings: [] };
      m[mo].demos++;
      if (d.status === "Converted") m[mo].converted++;
      m[mo].ratings.push(d.analystRating);
    });
    return Object.values(m).map(v => ({ ...v, rate: v.demos ? Math.round(v.converted / v.demos * 100) : 0, avgR: v.ratings.length ? Number((v.ratings.reduce((a, b) => a + b, 0) / v.ratings.length).toFixed(1)) : 0 }));
  }, [demos]);

  const pourData = useMemo(() => {
    const m = {};
    POUR_CATS.forEach(c => { m[c] = 0; });
    demos.forEach(d => d.pour.forEach(p => { if (m[p.cat] !== undefined) m[p.cat]++; }));
    return POUR_CATS.map(c => ({ name: c, count: m[c] })).filter(x => x.count > 0).sort((a, b) => b.count - a.count);
  }, [demos]);

  const acctData = useMemo(() => {
    const m = { Sales: 0, Product: 0, Consumer: 0 };
    demos.filter(d => d.acctType).forEach(d => { m[d.acctType]++; });
    return Object.entries(m).map(([k, v]) => ({ name: k, count: v }));
  }, [demos]);

  const agentData = useMemo(() => {
    const m = {};
    AGENTS.forEach(a => { m[a] = { name: a, handled: 0, converted: 0 }; });
    demos.filter(d => d.agent).forEach(d => { if (m[d.agent]) { m[d.agent].handled++; if (d.status === "Converted") m[d.agent].converted++; } });
    return Object.values(m).map(a => ({ ...a, rate: a.handled ? Math.round(a.converted / a.handled * 100) : 0 })).sort((a, b) => b.rate - a.rate);
  }, [demos]);

  const funnel = useMemo(() => {
    const t = demos.length;
    const reviewed = demos.filter(d => d.review || d.analystRating > 0).length;
    const contacted = demos.filter(d => d.agent).length;
    const converted = demos.filter(d => d.status === "Converted").length;
    return [{ stage: "Demos", count: t }, { stage: "Reviewed", count: reviewed }, { stage: "Contacted", count: contacted }, { stage: "Converted", count: converted }];
  }, [demos]);

  const subjectData = useMemo(() => {
    const m = {};
    demos.forEach(d => { if (!m[d.subject]) m[d.subject] = { name: d.subject, total: 0, conv: 0 }; m[d.subject].total++; if (d.status === "Converted") m[d.subject].conv++; });
    return Object.values(m).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [demos]);

  const agingData = useMemo(() => {
    const buckets = [{ name: "0-1d", count: 0 }, { name: "2-3d", count: 0 }, { name: "4-5d", count: 0 }, { name: "6d+", count: 0 }];
    demos.filter(d => d.status === "Pending").forEach(d => {
      const a = ageDays(d.ts);
      if (a <= 1) buckets[0].count++; else if (a <= 3) buckets[1].count++; else if (a <= 5) buckets[2].count++; else buckets[3].count++;
    });
    return buckets;
  }, [demos]);

  const PIE_C = [B, "#FF9F0A", GR];
  const ttStyle = { borderRadius: 10, border: "1px solid #e8e8ed", fontSize: 12 };

  return (
    <>
      <section style={{ background: "#000", color: "#fff", padding: "88px 24px 40px", textAlign: "center" }}>
        <div className="fu" style={{ maxWidth: 680, margin: "0 auto" }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: GR, textTransform: "uppercase" }}>Intelligence</p>
          <h1 style={{ fontSize: 44, fontWeight: 600, lineHeight: 1.07, marginTop: 6 }}>Analytics.</h1>
          <p style={{ fontSize: 19, color: "rgba(255,255,255,.6)", marginTop: 12 }}>All metrics from live data. {demos.length} demos.</p>
        </div>
      </section>

      {/* Funnel */}
      <section style={{ background: G, padding: "36px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div className="cc fu1">
            <div style={{ fontSize: 11, fontWeight: 600, color: GR, textTransform: "uppercase" }}>Pipeline</div>
            <div style={{ fontSize: 21, fontWeight: 600, margin: "4px 0 16px" }}>Conversion funnel</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120 }}>
              {funnel.map((f, i) => {
                const pct = funnel[0].count ? f.count / funnel[0].count : 0;
                return (
                  <div key={f.stage} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: N }}>{f.count}</div>
                    <div style={{ width: "100%", background: i === funnel.length - 1 ? "#30D158" : B, borderRadius: "6px 6px 0 0", height: Math.max(12, pct * 100), opacity: 1 - i * 0.15 }} />
                    <div style={{ fontSize: 10, color: GR, textAlign: "center" }}>{f.stage}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Charts */}
      <section style={{ background: "#fff", padding: "32px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          <div className="cc fu1">
            <div style={{ fontSize: 11, fontWeight: 600, color: GR, textTransform: "uppercase" }}>Trend</div>
            <div style={{ fontSize: 21, fontWeight: 600, margin: "4px 0 14px" }}>Conversion rate</div>
            {monthly.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={monthly}>
                  <defs><linearGradient id="cg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={B} stopOpacity={0.15} /><stop offset="100%" stopColor={B} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="m" tick={{ fontSize: 11, fill: GR }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: GR }} axisLine={false} tickLine={false} unit="%" />
                  <Tooltip contentStyle={ttStyle} />
                  <Area type="monotone" dataKey="rate" stroke={B} strokeWidth={2} fill="url(#cg2)" name="Rate" unit="%" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyState text="Need more data" />}
          </div>
          <div className="cc fu2">
            <div style={{ fontSize: 11, fontWeight: 600, color: GR, textTransform: "uppercase" }}>POUR</div>
            <div style={{ fontSize: 21, fontWeight: 600, margin: "4px 0 14px" }}>Issue categories</div>
            {pourData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={pourData} layout="vertical" barSize={12}>
                  <XAxis type="number" tick={{ fontSize: 10, fill: GR }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: N }} axisLine={false} tickLine={false} width={72} />
                  <Tooltip contentStyle={ttStyle} />
                  <Bar dataKey="count" fill={B} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState text="No POUR issues" />}
          </div>
        </div>
      </section>

      <section style={{ background: G, padding: "32px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          <div className="cc">
            <div style={{ fontSize: 11, fontWeight: 600, color: GR, textTransform: "uppercase" }}>Accountability</div>
            <div style={{ fontSize: 21, fontWeight: 600, margin: "4px 0 12px" }}>Loss attribution</div>
            {acctData.some(a => a.count > 0) ? (
              <>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <ResponsiveContainer width={150} height={150}>
                    <PieChart>
                      <Pie data={acctData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="count">
                        {acctData.map((e, i) => <Cell key={i} fill={PIE_C[i]} />)}
                      </Pie>
                      <Tooltip contentStyle={ttStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 4 }}>
                  {acctData.map((a, i) => (
                    <div key={a.name} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: GR }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: PIE_C[i] }} />{a.name} ({a.count})
                    </div>
                  ))}
                </div>
              </>
            ) : <EmptyState text="No accountability data yet" />}
          </div>
          <div className="cc">
            <div style={{ fontSize: 11, fontWeight: 600, color: GR, textTransform: "uppercase" }}>SLA</div>
            <div style={{ fontSize: 21, fontWeight: 600, margin: "4px 0 12px" }}>Pending aging</div>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={agingData} barSize={28}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: GR }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: GR }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={ttStyle} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {agingData.map((e, i) => <Cell key={i} fill={i <= 1 ? B : i === 2 ? "#FF9F0A" : "#E24B4A"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="cc">
            <div style={{ fontSize: 11, fontWeight: 600, color: GR, textTransform: "uppercase" }}>Demand</div>
            <div style={{ fontSize: 21, fontWeight: 600, margin: "4px 0 12px" }}>By subject</div>
            {subjectData.length > 0 ? (
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={subjectData} barSize={16}>
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: GR }} axisLine={false} tickLine={false} interval={0} angle={-25} textAnchor="end" height={45} />
                  <YAxis tick={{ fontSize: 10, fill: GR }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={ttStyle} />
                  <Bar dataKey="total" fill="#d2d2d7" radius={[3, 3, 0, 0]} name="Demos" />
                  <Bar dataKey="conv" fill="#30D158" radius={[3, 3, 0, 0]} name="Converted" />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState text="No data" />}
          </div>
        </div>
      </section>

      {/* Agent leaderboard */}
      <section style={{ background: "#000", color: "#fff", padding: "44px 24px 52px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: GR, textTransform: "uppercase" }}>Performance</p>
            <h2 style={{ fontSize: 32, fontWeight: 600, marginTop: 6 }}>Sales agent leaderboard</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
            {agentData.map((ag, i) => (
              <div key={ag.name} className="fu2" style={{ background: "#1c1c1e", borderRadius: 16, padding: "24px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 36, fontWeight: 600, color: i === 0 ? "#FFD60A" : "rgba(255,255,255,.2)", lineHeight: 1 }}>#{i + 1}</div>
                <div style={{ fontSize: 19, fontWeight: 600, color: "#fff", marginTop: 6 }}>{ag.name}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 16 }}>
                  {[
                    { l: "Conv. rate", v: ag.handled ? ag.rate + "%" : "\u2014", c: ag.rate >= 45 ? "#30D158" : "#FF9F0A" },
                    { l: "Handled", v: ag.handled, c: "#fff" },
                    { l: "Converted", v: ag.converted, c: "#2997ff" },
                  ].map(m => (
                    <div key={m.l} style={{ background: "#2c2c2e", borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: m.c }}>{m.v}</div>
                      <div style={{ fontSize: 10, color: GR, marginTop: 2 }}>{m.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

// ═══════════════════════════════════════════
// TEACHERS (sort + drill-down)
// ═══════════════════════════════════════════
function TeachersV({ demos, drill, setDrill }) {
  const [sortBy, setSortBy] = useState("rate-desc");

  const tStats = useMemo(() => {
    const m = {};
    demos.forEach(d => {
      if (!m[d.teacher]) m[d.teacher] = { tid: d.tid, total: 0, conv: 0, ratings: [], pours: 0, pourCats: {}, demos: [] };
      const t = m[d.teacher];
      t.total++;
      if (d.status === "Converted") t.conv++;
      t.ratings.push(d.analystRating);
      if (d.pour.length > 0) t.pours++;
      d.pour.forEach(p => { t.pourCats[p.cat] = (t.pourCats[p.cat] || 0) + 1; });
      t.demos.push(d);
    });
    let arr = Object.entries(m).map(([name, s]) => ({
      name, ...s,
      avg: s.ratings.length ? (s.ratings.reduce((a, b) => a + b, 0) / s.ratings.length).toFixed(1) : "0",
      rate: s.total ? Math.round(s.conv / s.total * 100) : 0,
    }));
    if (sortBy === "rate-desc") arr.sort((a, b) => b.rate - a.rate);
    if (sortBy === "rate-asc") arr.sort((a, b) => a.rate - b.rate);
    if (sortBy === "rating-desc") arr.sort((a, b) => parseFloat(b.avg) - parseFloat(a.avg));
    if (sortBy === "volume-desc") arr.sort((a, b) => b.total - a.total);
    if (sortBy === "name") arr.sort((a, b) => a.name.localeCompare(b.name));
    return arr;
  }, [demos, sortBy]);

  const drillData = drill ? tStats.find(t => t.name === drill) : null;

  return (
    <>
      <section style={{ background: G, paddingTop: 92, paddingBottom: 32 }}>
        <div className="fu" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: GR, textTransform: "uppercase" }}>Step 11</p>
            <h1 style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>Teacher performance.</h1>
            <p style={{ fontSize: 15, color: GR, marginTop: 6 }}>Click any card to drill down. {tStats.length} teachers.</p>
          </div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="fsl">
            <option value="rate-desc">Highest conversion</option>
            <option value="rate-asc">Lowest conversion</option>
            <option value="rating-desc">Highest rated</option>
            <option value="volume-desc">Most demos</option>
            <option value="name">Name A-Z</option>
          </select>
        </div>
      </section>
      <section style={{ background: "#fff", padding: "20px 24px 80px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
          {tStats.map((s, i) => (
            <div key={s.name} className={"fu" + Math.min(i, 3)} onClick={() => setDrill(drill === s.name ? null : s.name)}
              style={{ background: G, borderRadius: 16, padding: 20, border: drill === s.name ? "2px solid " + B : "1px solid #e8e8ed", cursor: "pointer", transition: "all .2s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#000", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600 }}>{ini(s.name)}</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: GR }}>ID: {s.tid} · {s.total} demos</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { l: "Conversion", v: s.rate + "%", c: s.rate >= 50 ? "#1b8a4a" : "#c13030" },
                  { l: "Rating", v: s.avg + "/5", c: B },
                  { l: "Demos", v: s.total, c: N },
                  { l: "POUR", v: s.pours, c: s.pours ? "#B25000" : "#1b8a4a" },
                ].map(m => (
                  <div key={m.l} style={{ background: "#fff", borderRadius: 8, padding: "8px 12px" }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: m.c }}>{m.v}</div>
                    <div style={{ fontSize: 10, color: GR, marginTop: 2 }}>{m.l}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {drillData && (
          <div className="si" style={{ maxWidth: 1100, margin: "24px auto 0" }}>
            <div className="cc" style={{ padding: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <h3 style={{ fontSize: 24, fontWeight: 600 }}>{drill}</h3>
                  <p style={{ fontSize: 13, color: GR, marginTop: 3 }}>{drillData.total} demos · {drillData.rate}% conversion · {drillData.avg}/5 avg</p>
                </div>
                <button onClick={() => setDrill(null)} style={{ background: G, border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 14, color: GR, display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u2715"}</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: GR, textTransform: "uppercase", marginBottom: 8 }}>Rating per demo</div>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={drillData.demos.map(d => ({ name: d.date, rating: d.analystRating, student: d.student }))} barSize={16}>
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: GR }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 5]} tick={{ fontSize: 10, fill: GR }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e8e8ed", fontSize: 12 }} formatter={(v, n, p) => [v + "/5", p.payload.student]} />
                      <Bar dataKey="rating" fill={B} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: GR, textTransform: "uppercase", marginBottom: 8 }}>POUR issues</div>
                  {Object.keys(drillData.pourCats).length === 0 ? <EmptyState text="No POUR issues" /> : (
                    <ResponsiveContainer width="100%" height={140}>
                      <BarChart data={Object.entries(drillData.pourCats).map(([k, v]) => ({ name: k, count: v }))} layout="vertical" barSize={12}>
                        <XAxis type="number" tick={{ fontSize: 10, fill: GR }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: N }} axisLine={false} tickLine={false} width={70} />
                        <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e8e8ed", fontSize: 12 }} />
                        <Bar dataKey="count" fill="#FF9F0A" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: GR, textTransform: "uppercase", marginBottom: 8 }}>Demo history</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr>
                        {["Date", "Student", "Level", "Subject", "Rating", "Status"].map(h => (
                          <th key={h} style={{ textAlign: "left", padding: "6px 10px", borderBottom: "1px solid #e8e8ed", color: GR, fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {drillData.demos.map(d => (
                        <tr key={d.id} style={{ borderBottom: "1px solid #f5f5f7" }}>
                          <td style={{ padding: "6px 10px", color: GR }}>{d.date}</td>
                          <td style={{ padding: "6px 10px", fontWeight: 500 }}>{d.student}</td>
                          <td style={{ padding: "6px 10px" }}>{d.level}</td>
                          <td style={{ padding: "6px 10px" }}>{d.subject}</td>
                          <td style={{ padding: "6px 10px" }}><Stars value={d.analystRating} readOnly onChange={() => {}} /></td>
                          <td style={{ padding: "6px 10px" }}><Badge status={d.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
