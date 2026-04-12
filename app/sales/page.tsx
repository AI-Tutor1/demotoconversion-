"use client";
import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import { StatusBadge, Field, EmptyState } from "@/components/ui";
import { TEACHERS, AGENTS, ACCT_TYPES, MUTED, BLUE, LIGHT_GRAY } from "@/lib/types";
import { ageDays, ageColor, ageTextColor, formatMonth, exportCSV } from "@/lib/utils";

export default function SalesPage() {
  const { rangedDemos, setDemos, flash, setConfirm, logActivity } = useStore();
  const [selDemo, setSelDemo] = useState<number|null>(null);
  const [bulkSel, setBulkSel] = useState<number[]>([]);
  const [fStatus, setFStatus] = useState("All");
  const [fTeacher, setFTeacher] = useState("");
  const [fAgent, setFAgent] = useState("");
  const [sort, setSort] = useState("date-desc");
  const [sf, setSf] = useState({status:"Converted",agent:"",contact:"",comments:"",verbatim:"",marketing:false,link:"",acctType:""});

  const filtered = useMemo(() => {
    let d = rangedDemos.filter(x => {
      if (fStatus !== "All" && x.status !== fStatus) return false;
      if (fTeacher && x.teacher !== fTeacher) return false;
      if (fAgent && x.agent !== fAgent) return false;
      return true;
    });
    if (sort === "date-desc") d = [...d].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (sort === "date-asc") d = [...d].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (sort === "rating-desc") d = [...d].sort((a,b) => b.analystRating - a.analystRating);
    if (sort === "age-desc") d = [...d].sort((a,b) => a.ts - b.ts);
    return d;
  }, [rangedDemos, fStatus, fTeacher, fAgent, sort]);

  const sel = rangedDemos.find(d => d.id === selDemo);
  const hasFilters = fStatus !== "All" || fTeacher || fAgent;
  const allSel = filtered.length > 0 && filtered.every(d => bulkSel.includes(d.id));
  const toggleAll = () => { if (allSel) setBulkSel([]); else setBulkSel(filtered.map(d => d.id)); };
  const toggleBulk = (id: number) => setBulkSel(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const suggestedAcct = useMemo(() => {
    if (!sel) return "";
    if (sel.analystRating <= 2 || sel.pour.length > 0) return "Product";
    if (sel.analystRating >= 4 && sel.studentRaw >= 7) return "Sales";
    return "Consumer";
  }, [sel]);

  const submitSales = () => {
    if (!selDemo || !sel) return;
    setConfirm({ title: "Mark as " + sf.status + "?", msg: "Change " + sel.student + " status.", onConfirm: () => {
      setDemos(p => p.map(d => d.id === selDemo ? {...d, status: sf.status as "Converted"|"Not Converted"|"Pending", agent: sf.agent, comments: sf.comments, verbatim: sf.verbatim, link: sf.link, acctType: sf.acctType, marketing: sf.marketing} : d));
      logActivity(sf.status === "Converted" ? "converted" : "marked not converted", sf.agent || "Sales", sel.student);
      flash("Demo marked as " + sf.status); setSelDemo(null);
      setSf({status:"Converted",agent:"",contact:"",comments:"",verbatim:"",marketing:false,link:"",acctType:""});
    }});
  };

  const bulkUpdate = (ns: string) => {
    setConfirm({ title: "Bulk update " + bulkSel.length + " demos?", msg: "Mark as \"" + ns + "\". Cannot be undone.", onConfirm: () => {
      setDemos(p => p.map(d => bulkSel.includes(d.id) ? {...d, status: ns as "Converted"|"Not Converted"|"Pending"} : d));
      logActivity("bulk " + ns.toLowerCase(), "Sales", bulkSel.length + " demos");
      flash(bulkSel.length + " demos marked as " + ns); setBulkSel([]);
    }});
  };

  return (
    <>
      <section style={{background:"#000",color:"#fff",paddingTop:92,paddingBottom:24}}>
        <div className="animate-fade-up" style={{maxWidth:1100,margin:"0 auto",padding:"0 24px"}}>
          <p className="section-label" style={{color:MUTED}}>Step 8 + 10</p>
          <h1 style={{fontSize:40,fontWeight:600,lineHeight:1.1}}>Sales follow-up.</h1>
          <div style={{display:"flex",gap:8,marginTop:16,flexWrap:"wrap"}}>
            {["All","Pending","Converted","Not Converted"].map(f2 => (
              <button key={f2} className="pill" onClick={() => {setFStatus(f2);setSelDemo(null);setBulkSel([]);}} style={{background:fStatus===f2?"rgba(255,255,255,.15)":"transparent",color:fStatus===f2?"#fff":"rgba(255,255,255,.5)",border:"1px solid "+(fStatus===f2?"rgba(255,255,255,.3)":"rgba(255,255,255,.1)"),fontSize:12,padding:"5px 14px"}}>{f2}</button>
            ))}
          </div>
          <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
            <select value={fTeacher} onChange={e => setFTeacher(e.target.value)} className="filter-select-dark"><option value="">All teachers</option>{TEACHERS.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}</select>
            <select value={fAgent} onChange={e => setFAgent(e.target.value)} className="filter-select-dark"><option value="">All agents</option>{AGENTS.map(a => <option key={a} value={a}>{a}</option>)}</select>
            <select value={sort} onChange={e => setSort(e.target.value)} className="filter-select-dark"><option value="date-desc">Newest</option><option value="date-asc">Oldest</option><option value="rating-desc">Highest rated</option><option value="age-desc">Longest pending</option></select>
            {hasFilters && <button className="pill" onClick={() => {setFStatus("All");setFTeacher("");setFAgent("");}} style={{background:"rgba(255,255,255,.1)",color:"#fff",border:"1px solid rgba(255,255,255,.2)",fontSize:11,padding:"4px 12px"}}>Clear all</button>}
          </div>
          <div style={{fontSize:12,color:MUTED,marginTop:8}}>{filtered.length} demos{" · "}<button onClick={() => exportCSV(filtered as unknown as Record<string,unknown>[])} style={{background:"none",border:"none",color:"#2997ff",cursor:"pointer",fontSize:12}}>Export filtered CSV</button></div>
        </div>
      </section>

      {bulkSel.length > 0 && (
        <div style={{background:BLUE,color:"#fff",padding:"8px 24px",display:"flex",alignItems:"center",justifyContent:"center",gap:14,fontSize:13,fontWeight:500}}>
          <span>{bulkSel.length} selected</span>
          <button className="pill" onClick={() => bulkUpdate("Converted")} style={{background:"#fff",color:BLUE,padding:"5px 14px",fontSize:12,border:"none"}}>Mark converted</button>
          <button className="pill" onClick={() => bulkUpdate("Not Converted")} style={{background:"rgba(255,255,255,.2)",color:"#fff",padding:"5px 14px",fontSize:12,border:"none"}}>Mark not converted</button>
          <button className="pill" onClick={() => setBulkSel([])} style={{background:"transparent",color:"#fff",padding:"5px 14px",fontSize:12,border:"1px solid rgba(255,255,255,.4)"}}>Clear</button>
        </div>
      )}

      <section style={{background:LIGHT_GRAY,padding:"20px 24px 80px",minHeight:400}}>
        <div style={{maxWidth:1100,margin:"0 auto",display:"grid",gridTemplateColumns:sel?"minmax(0,380px) minmax(0,1fr)":"1fr",gap:16}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0 8px"}}><input type="checkbox" className="apple-checkbox" checked={allSel} onChange={toggleAll}/><span style={{fontSize:12,color:MUTED}}>Select all ({filtered.length})</span></div>
            {filtered.length === 0 && <EmptyState text="No demos match filters"/>}
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {filtered.map(d => { const age = ageDays(d.ts); return (
                <div key={d.id} className={"demo-card"+(selDemo===d.id?" selected":"")} style={{display:"flex",gap:10,alignItems:"start"}} onClick={() => setSelDemo(d.id)}>
                  <input type="checkbox" className="apple-checkbox" checked={bulkSel.includes(d.id)} onChange={() => toggleBulk(d.id)} onClick={e => e.stopPropagation()}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"start",gap:6}}>
                      <div>
                        <div style={{fontSize:14,fontWeight:500}}>{d.student}</div>
                        <div style={{fontSize:11,color:MUTED,marginTop:1}}>{d.teacher} · {d.level} {d.subject}</div>
                        <div style={{fontSize:11,color:MUTED}}>{d.date}{d.status==="Pending"&&age>1&&<span style={{marginLeft:6,padding:"1px 7px",borderRadius:980,fontSize:10,fontWeight:600,background:ageColor(age),color:ageTextColor(age)}}>{age}d</span>}</div>
                      </div>
                      <StatusBadge status={d.status}/>
                    </div>
                    {d.pour.length>0&&<div style={{marginTop:4}}>{d.pour.map(pp => <span key={pp.cat} className="pour-tag">{pp.cat}</span>)}</div>}
                  </div>
                </div>);})}
            </div>
          </div>

          {sel && (
            <div className="animate-slide-in" style={{background:"#fff",borderRadius:16,padding:"24px 28px",border:"1px solid #e8e8ed"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"start",marginBottom:16}}>
                <div><h3 style={{fontSize:22,fontWeight:600}}>{sel.student}</h3><p style={{fontSize:13,color:MUTED,marginTop:3}}>{sel.teacher} (ID: {sel.tid}) · {sel.level} {sel.subject} · {formatMonth(sel.date)}</p></div>
                <button onClick={() => setSelDemo(null)} style={{background:LIGHT_GRAY,border:"none",borderRadius:"50%",width:28,height:28,cursor:"pointer",fontSize:14,color:MUTED,display:"flex",alignItems:"center",justifyContent:"center"}}>{"\u2715"}</button>
              </div>
              <div style={{background:LIGHT_GRAY,borderRadius:12,padding:"14px 18px",marginBottom:20}}>
                <div className="section-label" style={{marginBottom:6}}>Analyst review</div>
                {sel.recording && (
                  <p style={{fontSize:12,marginBottom:8}}>
                    <span style={{color:MUTED,marginRight:6}}>Recording:</span>
                    <a href={sel.recording} target="_blank" rel="noopener noreferrer" style={{color:BLUE,textDecoration:"none",fontWeight:500}}>
                      Open ↗
                    </a>
                  </p>
                )}
                <p style={{fontSize:13,lineHeight:1.47}}>{sel.review||"No review."}</p>
                {sel.pour.length>0&&<div style={{marginTop:8}}>{sel.pour.map(pp => <div key={pp.cat} style={{marginBottom:4}}><span className="pour-tag">{pp.cat}</span>{pp.desc&&<span style={{fontSize:12,color:MUTED,marginLeft:6}}>{pp.desc}</span>}</div>)}</div>}
                <div style={{display:"flex",gap:16,marginTop:10}}><span style={{fontSize:12,color:MUTED}}>Student: <strong>{Math.round(sel.studentRaw/2)}/5</strong></span><span style={{fontSize:12,color:MUTED}}>Analyst: <strong>{sel.analystRating}/5</strong></span></div>
                {sel.suggestions&&<p style={{fontSize:12,color:BLUE,marginTop:6,fontWeight:500}}>Suggestion: {sel.suggestions}</p>}
              </div>
              <div className="section-label" style={{marginBottom:10}}>Sales input</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <Field label="Conversion status"><select className="apple-input apple-select" value={sf.status} onChange={e => setSf(p => ({...p,status:e.target.value}))}><option>Converted</option><option>Not Converted</option><option>Pending</option></select></Field>
                <Field label="Sales agent"><select className="apple-input apple-select" value={sf.agent} onChange={e => setSf(p => ({...p,agent:e.target.value}))}><option value="">Select...</option>{AGENTS.map(a => <option key={a}>{a}</option>)}</select></Field>
              </div>
              <Field label="Sales comments"><textarea className="apple-input apple-textarea" placeholder="Analysis..." value={sf.comments} onChange={e => setSf(p => ({...p,comments:e.target.value}))}/></Field>
              <Field label="Student review (verbatim)"><textarea className="apple-input apple-textarea" placeholder="Exact student words..." value={sf.verbatim} onChange={e => setSf(p => ({...p,verbatim:e.target.value}))}/></Field>
              <Field label="Link"><input className="apple-input" placeholder="https://..." value={sf.link} onChange={e => setSf(p => ({...p,link:e.target.value}))}/></Field>
              {sf.status==="Not Converted"&&(
                <div style={{background:"#FFF8E1",borderRadius:12,padding:"14px 18px",marginTop:8,border:"1px solid #F5D98E"}}>
                  <div style={{fontSize:11,fontWeight:600,color:"#8B6914",textTransform:"uppercase",marginBottom:6}}>Step 10 — Accountability</div>
                  {suggestedAcct&&<p style={{fontSize:12,color:"#8B6914",marginBottom:8}}>Suggested: <strong>{suggestedAcct}</strong></p>}
                  <select className="apple-input apple-select" value={sf.acctType} onChange={e => setSf(p => ({...p,acctType:e.target.value}))}><option value="">Select type...</option>{ACCT_TYPES.map(a => <option key={a}>{a}</option>)}</select>
                </div>
              )}
              <div style={{display:"flex",alignItems:"center",gap:8,margin:"12px 0"}}><input type="checkbox" className="apple-checkbox" checked={sf.marketing} onChange={e => setSf(p => ({...p,marketing:e.target.checked}))}/><span style={{fontSize:14}}>Marketing lead</span></div>
              <div style={{display:"flex",justifyContent:"flex-end",marginTop:16}}><button className="pill pill-blue" style={{padding:"10px 24px",fontSize:15}} onClick={submitSales}>Update demo</button></div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
