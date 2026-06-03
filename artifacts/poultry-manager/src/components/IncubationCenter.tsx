/**
 * IncubationCenter v4 — Ultra Modern Digital Design
 * ════════════════════════════════════════════════════════
 * تصميم بصري جديد كلياً — حداثة عالية، ألوان جريئة، أرقام مضيئة
 * Logic identical to v3 — only visual presentation changed
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Thermometer, Droplets, Egg, Bird, Wifi, WifiOff,
  RefreshCw, Trash2, ChevronDown, ChevronUp,
  AlertTriangle, AlertCircle, CheckCircle2, RotateCcw,
  FlaskConical, TrendingUp, Zap, Shield, Lock,
} from "lucide-react";

// ══════════════════════ TYPES ══════════════════════════════════════════════════

interface Cycle {
  id: number; batchName: string; eggsSet: number; eggsHatched: number | null;
  startDate: string; setTime: string | null; expectedHatchDate: string;
  actualHatchDate: string | null; lockdownDate: string | null; lockdownTime: string | null;
  status: string; temperature: number | null; humidity: number | null;
  lockdownTemperature: number | null; lockdownHumidity: number | null;
  incubatorId: number | null; notes: string | null; createdAt: string;
}

interface Incubator {
  id: number; name: string; model: string | null; capacity: number;
  status: string; location: string | null; purchaseCost: number | null;
  activeCycle: Cycle | null;
}

interface Opening {
  id: number; hatchingCycleId: number; openedAt: string;
  chicksCount: number; notes: string | null; openedByName: string | null; createdAt: string;
}

// ══════════════════════ PHASE ENGINE ═══════════════════════════════════════════

type Phase = "incubation" | "lockdown" | "hatching" | "overdue" | "completed" | "failed";

interface PhaseResult {
  phase: Phase; day: number; pct: number;
  secsLeft: number; daysLeft: number; hoursLeft: number; minsLeft: number;
  idealTemp: number; idealHum: number; turningNeeded: boolean;
  candlingNext: number | null; embryoStage: string;
  phaseLabel: string; accent: string; accentRgb: string;
}

const EMBRYO: Record<number,string> = {
  1:"تكوين الجهاز العصبي", 2:"ظهور الأوعية الدموية", 3:"القلب يبدأ النبض",
  4:"تمايز الرأس والأطراف", 5:"الجهاز الهضمي", 6:"ظهور المنقار والجناحين",
  7:"تكامل العينين", 8:"نمو الأطراف", 9:"بصيلات الريش",
  10:"تصلّب العظام", 11:"الكلى والرئتان", 12:"الغطاء الريشي الكامل",
  13:"تخزين الدهون", 14:"التكلّس الثاني", 15:"النمو شبه مكتمل",
  16:"الجهاز المناعي", 17:"آخر يوم للتقليب", 18:"الانتقال للفقس",
  19:"ثقب الغرفة الهوائية", 20:"كسر القشرة", 21:"الخروج",
};

const PHASE_CFG: Record<Phase,{label:string;accent:string;rgb:string;gradient:string}> = {
  incubation:{ label:"حضانة",   accent:"#3b82f6", rgb:"59,130,246",  gradient:"from-blue-950/80 via-blue-900/20 to-transparent"  },
  lockdown:  { label:"إغلاق",   accent:"#f59e0b", rgb:"245,158,11",  gradient:"from-amber-950/80 via-amber-900/20 to-transparent" },
  hatching:  { label:"يفقس",    accent:"#10b981", rgb:"16,185,129",  gradient:"from-emerald-950/80 via-emerald-900/20 to-transparent"},
  overdue:   { label:"تأخّرت", accent:"#ef4444", rgb:"239,68,68",   gradient:"from-red-950/80 via-red-900/20 to-transparent"     },
  completed: { label:"مكتملة",  accent:"#6366f1", rgb:"99,102,241",  gradient:"from-indigo-950/60 via-indigo-900/10 to-transparent"},
  failed:    { label:"فاشلة",   accent:"#7f1d1d", rgb:"127,29,29",   gradient:"from-red-950/80 via-transparent to-transparent"    },
};

function computePhase(cycle:Cycle, nowMs:number): PhaseResult {
  const startMs = new Date(`${cycle.startDate}T${cycle.setTime??"12:00"}:00`).getTime();
  const hatchMs = new Date(`${cycle.expectedHatchDate}T${cycle.setTime??"12:00"}:00`).getTime();
  const elapsed = nowMs - startMs;
  const remain  = Math.max(0, hatchMs - nowMs);
  const total   = hatchMs - startMs;

  const day      = Math.max(1, Math.floor(elapsed/86_400_000)+1);
  const pct      = total>0 ? Math.min(100,Math.round((elapsed/total)*100)) : 100;
  const secsLeft  = Math.floor(remain/1_000);
  const daysLeft  = Math.floor(remain/86_400_000);
  const hoursLeft = Math.floor((remain%86_400_000)/3_600_000);
  const minsLeft  = Math.floor((remain%3_600_000)/60_000);

  let phase:Phase;
  if      (cycle.status==="completed")                           phase="completed";
  else if (cycle.status==="failed")                              phase="failed";
  else if (secsLeft===0 && day>22)                               phase="overdue";
  else if (day>=19||cycle.status==="hatching")                   phase="hatching";
  else if (day>=18)                                              phase="lockdown";
  else                                                           phase="incubation";

  const lkd = phase==="lockdown"||phase==="hatching";
  const cfg = PHASE_CFG[phase];

  return {
    phase, day, pct, secsLeft, daysLeft, hoursLeft, minsLeft,
    idealTemp: lkd?37.2:37.7, idealHum: lkd?70:55,
    turningNeeded: phase==="incubation" && day<=17,
    candlingNext: [7,14,18].find(d=>d>day)??null,
    embryoStage: EMBRYO[Math.min(day,21)]??"اكتمل التطور",
    phaseLabel: cfg.label, accent: cfg.accent, accentRgb: cfg.rgb,
  };
}

// ══════════════════════ FORMATTERS ═════════════════════════════════════════════

const p2 = (n:number) => String(n).padStart(2,"0");
const fmtDate = (d:string) => { const [y,m,dd]=d.split("-"); return `${dd}/${m}/${y}`; };
const fmtIso  = (iso:string) => {
  const d=new Date(iso);
  return `${p2(d.getDate())}/${p2(d.getMonth()+1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
const fmtN = (n:number) => n.toLocaleString("en-US");

// ══════════════════════ DIGIT BLOCK (digital clock) ════════════════════════════

function DigitBlock({ value, label, accent }: { value: string; label: string; accent: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative flex items-center justify-center rounded-xl font-black font-mono leading-none"
        style={{
          fontSize:"2.6rem", width:"3.2rem", height:"3.8rem",
          background:`linear-gradient(135deg, rgba(${PHASE_CFG.incubation.rgb},0.12) 0%, rgba(0,0,0,0.4) 100%)`,
          border:`1px solid rgba(${accent.replace('#','')==="3b82f6"?"59,130,246":accent.slice(1).match(/../g)!.map(h=>parseInt(h,16)).join(",")},0.3)`,
          color: accent,
          textShadow:`0 0 20px ${accent}80, 0 0 40px ${accent}30`,
          boxShadow:`inset 0 1px 0 rgba(255,255,255,0.05), 0 0 15px ${accent}20`,
        }}
      >
        {value}
      </div>
      <span className="text-[9px] uppercase tracking-widest" style={{ color:"#4b5563" }}>{label}</span>
    </div>
  );
}

// ══════════════════════ LIVE COUNTDOWN ═════════════════════════════════════════

function LiveCountdown({ secsLeft, phase, accent }: { secsLeft:number; phase:Phase; accent:string }) {
  const [s, setS] = useState(secsLeft);
  useEffect(()=>{ setS(secsLeft); },[secsLeft]);
  useEffect(()=>{
    if(phase==="completed"||phase==="failed"||phase==="overdue") return;
    const id = setInterval(()=>setS(v=>Math.max(0,v-1)),1_000);
    return ()=>clearInterval(id);
  },[phase]);

  if(phase==="completed") return (
    <div className="flex items-center justify-center gap-2 py-4">
      <CheckCircle2 className="w-5 h-5" style={{color:"#6366f1"}}/>
      <span className="text-2xl font-black" style={{color:"#6366f1"}}>مكتملة</span>
    </div>
  );
  if(s<=0&&phase==="hatching") return (
    <div className="flex items-center justify-center py-2">
      <span className="text-4xl font-black animate-pulse" style={{color:accent,textShadow:`0 0 30px ${accent}`}}>
        يفقس الآن! 🐣
      </span>
    </div>
  );

  const d   = Math.floor(s/86_400);
  const h   = Math.floor((s%86_400)/3_600);
  const m   = Math.floor((s%3_600)/60);
  const sec = s%60;

  return (
    <div className="flex items-end justify-center gap-1.5">
      {d>0 && <><DigitBlock value={String(d)} label="يوم" accent={accent} /><span className="text-2xl font-black mb-3" style={{color:accent+"40"}}>:</span></>}
      <DigitBlock value={p2(h)} label="ساعة" accent={accent} />
      <span className="text-2xl font-black mb-3" style={{color:accent+"40"}}>:</span>
      <DigitBlock value={p2(m)} label="دقيقة" accent={accent} />
      <span className="text-2xl font-black mb-3" style={{color:accent+"40"}}>:</span>
      <DigitBlock value={p2(sec)} label="ثانية" accent={accent} />
    </div>
  );
}

// ══════════════════════ DAY PROGRESS BAR ══════════════════════════════════════

function DayProgress({ day, pct }: { day:number; pct:number }) {
  const clamped = Math.max(0,Math.min(21,day));
  return (
    <div className="space-y-2">
      {/* Segment bar */}
      <div className="relative flex gap-[3px] h-4 items-stretch">
        {Array.from({length:21},(_,i)=>{
          const n=i+1;
          const filled=clamped>=n;
          const isNow=n===clamped;
          const col = n<=17?"#3b82f6":n===18?"#f59e0b":"#10b981";
          return (
            <div key={n} className="relative flex-1 rounded-[3px] overflow-hidden transition-all duration-500"
              style={{
                background: filled ? col : "#0f172a",
                border:`1px solid ${filled?col+"60":"#1e293b"}`,
                boxShadow: isNow ? `0 0 12px ${col}, 0 0 4px ${col}` : "none",
                transform: isNow ? "scaleY(1.3)" : "scaleY(1)",
              }}>
              {isNow&&<div className="absolute inset-0 animate-pulse" style={{background:`${col}40`}}/>}
            </div>
          );
        })}
        {/* Lockdown marker */}
        <div className="absolute top-0 bottom-0 flex items-center" style={{left:`${(17/21)*100}%`}}>
          <div className="w-[2px] h-6 rounded-full" style={{background:"#f59e0b80"}}/>
        </div>
      </div>
      {/* Labels */}
      <div className="flex justify-between items-center px-0.5">
        <span className="text-[9px] font-mono" style={{color:"#1e3a5f"}}>يوم ١</span>
        <div className="flex items-center gap-3">
          <span className="text-[9px]" style={{color:"#1e3a5f"}}>━━ حضانة</span>
          <span className="text-[9px]" style={{color:"#7c3400"}}>━ إغلاق</span>
          <span className="text-[9px]" style={{color:"#064e3b"}}>━━ فقس</span>
        </div>
        <span className="text-[9px] font-mono" style={{color:"#1e3a5f"}}>يوم ٢١</span>
      </div>
    </div>
  );
}

// ══════════════════════ SENSOR GAUGE ══════════════════════════════════════════

function SensorGauge({
  icon: Icon, label, value, ideal, unit, accentOk,
}: { icon:React.ElementType; label:string; value:number|null; ideal:number; unit:string; accentOk:string }) {
  const diff     = value!=null ? Math.abs(value-ideal) : null;
  const th1      = unit==="°C" ? 0.3 : 3;
  const th2      = unit==="°C" ? 1.0 : 8;
  const status   = diff==null?"unknown":diff<=th1?"ok":diff<=th2?"warn":"crit";
  const colors   = { ok:accentOk, warn:"#f59e0b", crit:"#ef4444", unknown:"#1f2937" };
  const col      = colors[status];
  const devStr   = value!=null&&diff!=null&&diff>0.05
    ? ((value-ideal)>0?"+":"")+(value-ideal).toFixed(1) : null;

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Icon ring */}
      <div className="relative w-14 h-14 rounded-full flex items-center justify-center"
        style={{
          background:`radial-gradient(circle, ${col}15 0%, transparent 70%)`,
          border:`1px solid ${col}30`,
          boxShadow:`0 0 20px ${col}20`,
        }}>
        <Icon className="w-6 h-6" style={{color:col}}/>
        {status==="ok"&&(
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center"
            style={{background:col,border:"2px solid #030711"}}>
            <span className="text-[7px] font-black text-black">✓</span>
          </div>
        )}
      </div>
      {/* Value */}
      <div className="text-center">
        <div className="font-mono font-black leading-none"
          style={{
            fontSize:"2.2rem",
            color: col,
            textShadow: status==="ok"?`0 0 20px ${col}60`:status==="crit"?`0 0 25px ${col}`:"none",
          }}>
          {value!=null ? value : "—"}
          <span className="text-lg ms-1" style={{color:col+"80"}}>{unit}</span>
        </div>
        <div className="text-[10px] mt-1 font-mono space-x-1" style={{color:"#374151"}}>
          <span>مثالي {ideal}{unit}</span>
          {devStr && <span style={{color:col}}>{devStr}</span>}
        </div>
      </div>
      <span className="text-[9px] uppercase tracking-widest" style={{color:"#374151"}}>{label}</span>
    </div>
  );
}

// ══════════════════════ HEALTH OPTIONS ═════════════════════════════════════════

const HEALTH_OPTS = [
  {val:"ممتازة", color:"#10b981"},
  {val:"جيدة",   color:"#3b82f6"},
  {val:"مقبولة", color:"#f59e0b"},
  {val:"ضعيفة",  color:"#ef4444"},
];

// ══════════════════════ OPEN INCUBATOR FORM ════════════════════════════════════

function OpenForm({ cycleId, eggsSet, openings, onClose }: {
  cycleId:number; eggsSet:number; openings:Opening[]; onClose:()=>void;
}) {
  const qc = useQueryClient();
  const [count,  setCount]  = useState("");
  const [health, setHealth] = useState("ممتازة");
  const [ts,     setTs]     = useState(()=>new Date().toISOString().slice(0,16));
  const [note,   setNote]   = useState("");

  const totalSoFar = openings.reduce((s,o)=>s+o.chicksCount,0);
  const countNum   = parseInt(count)||0;
  const newTotal   = totalSoFar+countNum;
  const newRate    = eggsSet>0 ? Math.round((newTotal/eggsSet)*100) : 0;

  const add = useMutation({
    mutationFn:(d:object)=>apiFetch(`/hatching-cycles/${cycleId}/openings`,{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(d),
    }),
    onSuccess:()=>{ qc.invalidateQueries({queryKey:["openings",cycleId]}); onClose(); },
  });

  const healthCol = HEALTH_OPTS.find(h=>h.val===health)?.color ?? "#10b981";

  return (
    <div className="rounded-2xl overflow-hidden" style={{
      background:"linear-gradient(135deg, #0a1628 0%, #050e1f 100%)",
      border:"1px solid rgba(16,185,129,0.4)",
      boxShadow:"0 0 40px rgba(16,185,129,0.1)",
    }}>
      {/* Header */}
      <div className="px-5 py-3 flex items-center justify-between"
        style={{background:"rgba(16,185,129,0.1)",borderBottom:"1px solid rgba(16,185,129,0.2)"}}>
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/>
          <span className="text-sm font-bold text-emerald-400">فتح الفقاسة — تسجيل الصيصان</span>
        </div>
        <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/10 transition-all">×</button>
      </div>

      <div className="p-5 space-y-4">
        {/* Previous total badge */}
        {openings.length>0&&(
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
            style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)"}}>
            <span style={{color:"#4b5563"}}>مُسجَّل سابقاً:</span>
            <span className="font-black font-mono text-base" style={{color:"#34d399"}}>{fmtN(totalSoFar)}</span>
            <span style={{color:"#374151"}}>صوص من {openings.length} فتحة</span>
          </div>
        )}

        {/* Count input — large */}
        <div>
          <label className="text-[10px] uppercase tracking-widest font-semibold block mb-2" style={{color:"#374151"}}>
            عدد الصيصان الخارجة *
          </label>
          <Input
            type="number" min="0" value={count}
            onChange={e=>setCount(e.target.value)}
            placeholder="0"
            autoFocus
            className="h-16 text-4xl font-black font-mono text-center transition-all"
            style={{
              background:"rgba(16,185,129,0.06)",
              border:`2px solid ${count?"rgba(16,185,129,0.6)":"rgba(255,255,255,0.08)"}`,
              color:"#34d399",
              borderRadius:"0.75rem",
              boxShadow: count?"0 0 20px rgba(16,185,129,0.2)":"none",
            }}
          />
        </div>

        {/* Health selector */}
        <div>
          <label className="text-[10px] uppercase tracking-widest font-semibold block mb-2" style={{color:"#374151"}}>
            الحالة الصحية للصيصان
          </label>
          <div className="grid grid-cols-4 gap-2">
            {HEALTH_OPTS.map(h=>(
              <button key={h.val} onClick={()=>setHealth(h.val)}
                className="py-2 rounded-xl text-xs font-bold transition-all"
                style={{
                  background: health===h.val ? `${h.color}20` : "rgba(255,255,255,0.04)",
                  border:`1px solid ${health===h.val?h.color+"60":"rgba(255,255,255,0.08)"}`,
                  color: health===h.val ? h.color : "#4b5563",
                  boxShadow: health===h.val ? `0 0 15px ${h.color}25` : "none",
                }}>
                {h.val}
              </button>
            ))}
          </div>
        </div>

        {/* Date time */}
        <div>
          <label className="text-[10px] uppercase tracking-widest font-semibold block mb-2" style={{color:"#374151"}}>
            التاريخ والوقت
          </label>
          <Input type="datetime-local" value={ts} onChange={e=>setTs(e.target.value)}
            className="h-11 text-sm font-mono"
            style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",color:"#e2e8f0",borderRadius:"0.75rem"}}/>
        </div>

        {/* Notes */}
        <div>
          <label className="text-[10px] uppercase tracking-widest font-semibold block mb-2" style={{color:"#374151"}}>
            ملاحظات
          </label>
          <Input value={note} onChange={e=>setNote(e.target.value)}
            placeholder="مثال: صيصان نشيطة وجافة"
            className="h-11 text-sm"
            style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#94a3b8",borderRadius:"0.75rem"}}/>
        </div>

        {/* Live preview */}
        {countNum>0&&(
          <div className="rounded-2xl p-4 grid grid-cols-3 gap-3 text-center"
            style={{background:`rgba(16,185,129,0.06)`,border:"1px solid rgba(16,185,129,0.2)"}}>
            {[
              {l:"يخرج الآن",    v:fmtN(countNum),       c:"#34d399"},
              {l:"الإجمالي",      v:fmtN(newTotal),       c:"#6ee7b7"},
              {l:"نسبة الفقس",   v:`${newRate}%`,         c:newRate>=65?"#34d399":newRate>=45?"#fbbf24":"#f87171"},
            ].map(s=>(
              <div key={s.l}>
                <div className="text-2xl font-black font-mono" style={{color:s.c,textShadow:`0 0 15px ${s.c}50`}}>{s.v}</div>
                <div className="text-[9px] mt-1" style={{color:"#374151"}}>{s.l}</div>
              </div>
            ))}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={()=>{
            if(!countNum) return;
            add.mutate({ chicksCount:countNum, openedAt:new Date(ts).toISOString(), notes:[health,note].filter(Boolean).join(" — ")||null });
          }}
          disabled={add.isPending||countNum<1}
          className="w-full h-14 rounded-2xl text-base font-bold transition-all flex items-center justify-center gap-3"
          style={{
            background:countNum>0?`linear-gradient(135deg, #059669 0%, #10b981 100%)`:"rgba(255,255,255,0.06)",
            color:countNum>0?"#fff":"#374151",
            boxShadow:countNum>0?"0 0 30px rgba(16,185,129,0.4)":"none",
            border:"none",
            cursor:countNum>0?"pointer":"not-allowed",
          }}
        >
          <Bird className="w-5 h-5"/>
          {add.isPending?"جاري الحفظ…":`حفظ — ${fmtN(countNum)} صوص · ${health}`}
        </button>
      </div>
    </div>
  );
}

// ══════════════════════ HATCH LOG ══════════════════════════════════════════════

function HatchLog({ cycleId, eggsSet, isActive }: { cycleId:number; eggsSet:number; isActive:boolean }) {
  const qc            = useQueryClient();
  const [formOpen,    setFormOpen]    = useState(false);
  const [listOpen,    setListOpen]    = useState(false);

  const { data: openings=[] } = useQuery<Opening[]>({
    queryKey:["openings",cycleId],
    queryFn:()=>apiFetch(`/hatching-cycles/${cycleId}/openings`),
    refetchInterval:30_000,
  });

  const del = useMutation({
    mutationFn:(id:number)=>apiFetch(`/hatch-openings/${id}`,{method:"DELETE"}),
    onSuccess:()=>qc.invalidateQueries({queryKey:["openings",cycleId]}),
  });

  const total = openings.reduce((s,o)=>s+o.chicksCount,0);
  const rate  = eggsSet>0?Math.round((total/eggsSet)*100):0;

  if(formOpen) return <OpenForm cycleId={cycleId} eggsSet={eggsSet} openings={openings} onClose={()=>setFormOpen(false)}/>;

  return (
    <div className="space-y-3">
      {/* Main action button */}
      <button onClick={()=>setFormOpen(true)}
        className="w-full h-14 rounded-2xl text-sm font-bold flex items-center justify-center gap-3 transition-all group"
        style={{
          background: isActive
            ? "linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(16,185,129,0.05) 100%)"
            : "rgba(255,255,255,0.03)",
          border:`1.5px solid ${isActive?"rgba(16,185,129,0.4)":"rgba(255,255,255,0.06)"}`,
          color: isActive ? "#34d399" : "#374151",
          boxShadow: isActive ? "0 0 25px rgba(16,185,129,0.1)" : "none",
        }}>
        <Bird className="w-5 h-5 transition-transform group-hover:scale-110"/>
        <span>{isActive?"فتح الفقاسة — تسجيل الصيصان":"عرض / إضافة فتحات"}</span>
        {total>0&&<span className="ms-1 text-xs px-2 py-0.5 rounded-full" style={{background:"rgba(52,211,153,0.15)",color:"#34d399"}}>{fmtN(total)}</span>}
      </button>

      {/* Totals + list */}
      {openings.length>0&&(
        <div>
          <div className="grid grid-cols-3 gap-2">
            {[
              {l:"صيصان خرجت",  v:fmtN(total),  c:"#34d399"},
              {l:"نسبة الفقس",  v:`${rate}%`,   c:rate>=65?"#34d399":rate>=45?"#fbbf24":"#f87171"},
              {l:"فتحات",       v:String(openings.length), c:"#93c5fd"},
            ].map(s=>(
              <div key={s.l} className="text-center py-3 rounded-xl"
                style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)"}}>
                <div className="text-xl font-black font-mono" style={{color:s.c,textShadow:`0 0 12px ${s.c}40`}}>{s.v}</div>
                <div className="text-[9px] mt-0.5" style={{color:"#374151"}}>{s.l}</div>
              </div>
            ))}
          </div>

          {/* Toggle list */}
          <button onClick={()=>setListOpen(v=>!v)}
            className="w-full mt-2 flex items-center justify-center gap-2 py-1.5 text-[10px] uppercase tracking-widest transition-colors"
            style={{color:"#1e293b"}}>
            {listOpen?<ChevronUp className="w-3.5 h-3.5"/>:<ChevronDown className="w-3.5 h-3.5"/>}
            {listOpen?"إخفاء السجل":"عرض السجل الكامل"}
          </button>

          {listOpen&&(
            <div className="space-y-1.5 max-h-52 overflow-y-auto mt-2 pe-1">
              {openings.map((o,i)=>(
                <div key={o.id} className="flex items-center justify-between px-4 py-2.5 rounded-xl text-sm"
                  style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)"}}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-5 text-[10px] font-mono text-center shrink-0" style={{color:"#1e293b"}}>#{i+1}</span>
                    <span className="text-xl font-black font-mono shrink-0" style={{color:"#34d399",textShadow:"0 0 10px rgba(52,211,153,0.4)"}}>
                      {fmtN(o.chicksCount)}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[11px] font-mono" style={{color:"#64748b"}}>{fmtIso(o.openedAt)}</div>
                      {o.notes&&<div className="text-[10px] truncate mt-0.5" style={{color:"#374151"}}>{o.notes}</div>}
                    </div>
                  </div>
                  <button onClick={()=>del.mutate(o.id)}
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 ms-2 transition-all"
                    style={{color:"#1e293b"}}
                    onMouseEnter={e=>(e.currentTarget.style.color="#ef4444",e.currentTarget.style.background="rgba(239,68,68,0.1)")}
                    onMouseLeave={e=>(e.currentTarget.style.color="#1e293b",e.currentTarget.style.background="transparent")}>
                    <Trash2 className="w-3.5 h-3.5"/>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════ ACTIVE MACHINE CARD ════════════════════════════════════

function ActiveCard({ inc, cycle, nowMs }: { inc:Incubator; cycle:Cycle; nowMs:number }) {
  const cs   = useMemo(()=>computePhase(cycle,nowMs),[cycle,nowMs]);
  const cfg  = PHASE_CFG[cs.phase];
  const acc  = cs.accent;

  const lkd      = cs.phase==="lockdown"||cs.phase==="hatching";
  const tempShow = lkd?(cycle.lockdownTemperature??cycle.temperature):cycle.temperature;
  const humShow  = lkd?(cycle.lockdownHumidity??cycle.humidity):cycle.humidity;
  const eggCost  = cycle.eggsSet*500;
  const expChicks= Math.round(cycle.eggsSet*0.65);
  const expRev   = expChicks*1500;

  // Lockdown date computation
  const lockdownDateStr = (() => {
    if(cycle.lockdownDate) return fmtDate(cycle.lockdownDate);
    const s = new Date(`${cycle.startDate}T${cycle.setTime??"12:00"}:00`);
    s.setDate(s.getDate()+17);
    return `${p2(s.getDate())}/${p2(s.getMonth()+1)}/${s.getFullYear()}`;
  })();

  const isActivePhase = cs.phase!=="completed"&&cs.phase!=="failed";
  const occupancy = inc.capacity>0?Math.min(100,Math.round((cycle.eggsSet/inc.capacity)*100)):0;

  // Compute alerts
  const alerts = useMemo(()=>{
    const a:Array<{crit:boolean;msg:string}> = [];
    if(!tempShow) a.push({crit:false,msg:"لم تُسجَّل درجة الحرارة"});
    else if(Math.abs(tempShow-cs.idealTemp)>1.2) a.push({crit:true,msg:`حرارة ${tempShow}°C — المثالي ${cs.idealTemp}°C`});
    if(cs.phase==="lockdown") a.push({crit:true,msg:"يوم الإغلاق — أوقف التقليب وارفع الرطوبة إلى 70%"});
    if(cs.phase==="hatching") a.push({crit:false,msg:"الفقس نشط — سجّل الصيصان عند كل فتحة"});
    if(cs.phase==="overdue")  a.push({crit:true, msg:"تجاوزت الموعد — راجع الوضع"});
    if(cs.daysLeft===1&&isActivePhase) a.push({crit:false,msg:"الإغلاق غداً — جهّز الماكينة"});
    return a;
  },[tempShow,cs,isActivePhase]);

  return (
    <div className="rounded-3xl overflow-hidden relative"
      style={{
        background:"#050d1a",
        border:`1px solid ${acc}30`,
        boxShadow:`0 0 0 1px ${acc}10, 0 24px 48px rgba(0,0,0,0.6), 0 0 80px ${acc}08`,
      }}>

      {/* ── Gradient Header ── */}
      <div className={`relative px-6 pt-6 pb-4 bg-gradient-to-b ${cfg.gradient}`}>
        {/* Top accent line */}
        <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-3xl"
          style={{background:`linear-gradient(90deg, transparent, ${acc}, transparent)`}}/>

        {/* Machine + Phase */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{color:acc+"cc"}}>{inc.name}</span>
              {inc.model&&<span className="text-[10px] font-mono" style={{color:"#1e3a5f"}}>{inc.model}</span>}
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{background:"rgba(255,255,255,0.05)",color:"#1e293b"}}>
                {fmtN(inc.capacity)} eggs
              </span>
            </div>
            <h2 className="text-2xl font-black text-white leading-tight">{cycle.batchName}</h2>
          </div>
          {/* Phase badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full shrink-0"
            style={{
              background:`rgba(${cs.accentRgb},0.15)`,
              border:`1px solid rgba(${cs.accentRgb},0.4)`,
              boxShadow:`0 0 15px rgba(${cs.accentRgb},0.2)`,
            }}>
            {cs.phase==="hatching"&&<span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{background:acc}}/>}
            {cs.phase==="lockdown"&&<Lock className="w-3 h-3" style={{color:acc}}/>}
            <span className="text-xs font-bold" style={{color:acc}}>{cs.phaseLabel}</span>
          </div>
        </div>

        {/* Day progress */}
        <DayProgress day={cs.day} pct={cs.pct}/>
      </div>

      {/* ── Dates strip ── */}
      <div className="grid grid-cols-3 text-center"
        style={{borderTop:`1px solid rgba(255,255,255,0.05)`,borderBottom:`1px solid rgba(255,255,255,0.05)`}}>
        {[
          {l:"وضع البيض",    d:fmtDate(cycle.startDate),          s:cycle.setTime??"——"},
          {l:"الإغلاق",      d:lockdownDateStr,                    s:cycle.lockdownTime??"——"},
          {l:"موعد الفقس",  d:fmtDate(cycle.expectedHatchDate),   s:cs.daysLeft>0?`${cs.daysLeft}ي ${cs.hoursLeft}س`:cs.phase==="hatching"?"الآن":"حان"},
        ].map((item,i)=>(
          <div key={i} className="px-3 py-4"
            style={{borderRight:i<2?"1px solid rgba(255,255,255,0.05)":"none"}}>
            <div className="text-[9px] uppercase tracking-widest mb-2" style={{color:"#1e3a5f"}}>{item.l}</div>
            <div className="font-mono text-base font-bold text-white">{item.d}</div>
            <div className="font-mono text-xs mt-1"
              style={{color:i===2&&cs.daysLeft<=1?"#fbbf24":"#374151"}}>{item.s}</div>
          </div>
        ))}
      </div>

      {/* ── Day + Countdown + Eggs ── */}
      <div className="grid grid-cols-3 py-2"
        style={{borderBottom:`1px solid rgba(255,255,255,0.05)`}}>
        {/* Day */}
        <div className="flex flex-col items-center justify-center px-4 py-4"
          style={{borderRight:"1px solid rgba(255,255,255,0.05)"}}>
          <div className="text-[9px] uppercase tracking-widest mb-2" style={{color:"#1e3a5f"}}>اليوم</div>
          <div className="font-mono font-black leading-none"
            style={{
              fontSize:"4.5rem",
              color:acc,
              textShadow:`0 0 30px ${acc}80, 0 0 60px ${acc}30`,
              lineHeight:1,
            }}>
            {cs.day}
          </div>
          <div className="text-xs font-mono mt-2" style={{color:"#1e3a5f"}}>من 21</div>
        </div>

        {/* Countdown */}
        <div className="flex flex-col items-center justify-center px-2 py-4"
          style={{borderRight:"1px solid rgba(255,255,255,0.05)"}}>
          <div className="text-[9px] uppercase tracking-widest mb-3" style={{color:"#1e3a5f"}}>
            {cs.phase==="hatching"?"يفقس":"للفقس"}
          </div>
          <LiveCountdown secsLeft={cs.secsLeft} phase={cs.phase} accent={acc}/>
        </div>

        {/* Eggs */}
        <div className="flex flex-col items-center justify-center px-4 py-4">
          <div className="text-[9px] uppercase tracking-widest mb-2" style={{color:"#1e3a5f"}}>بيض</div>
          <div className="font-mono font-black leading-none text-white"
            style={{fontSize:"3.5rem",lineHeight:1}}>
            {cycle.eggsSet>=1000
              ? <>{(cycle.eggsSet/1000).toFixed(1)}<span className="text-2xl" style={{color:"#1e3a5f"}}>K</span></>
              : cycle.eggsSet}
          </div>
          <div className="text-xs font-mono mt-2" style={{color:"#1e3a5f"}}>{occupancy}% طاقة</div>
        </div>
      </div>

      {/* ── Sensors ── */}
      <div className="grid grid-cols-2 py-6 px-4"
        style={{borderBottom:`1px solid rgba(255,255,255,0.05)`}}>
        <div className="flex justify-center" style={{borderRight:"1px solid rgba(255,255,255,0.05)"}}>
          <SensorGauge icon={Thermometer} label="حرارة" value={tempShow} ideal={cs.idealTemp} unit="°C" accentOk="#10b981"/>
        </div>
        <div className="flex justify-center">
          <SensorGauge icon={Droplets} label="رطوبة" value={humShow} ideal={cs.idealHum} unit="%" accentOk="#0ea5e9"/>
        </div>
      </div>

      {/* ── Embryo + Turning + Candling ── */}
      <div className="px-5 py-3 flex items-center justify-between gap-2"
        style={{borderBottom:`1px solid rgba(255,255,255,0.05)`}}>
        <div className="flex items-center gap-2 min-w-0">
          <FlaskConical className="w-3.5 h-3.5 shrink-0" style={{color:"#1e3a5f"}}/>
          <span className="text-[9px] uppercase tracking-widest shrink-0" style={{color:"#1e3a5f"}}>
            يوم {Math.min(cs.day,21)}:
          </span>
          <span className="text-xs truncate" style={{color:"#4b5563"}}>{cs.embryoStage}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {cs.candlingNext&&(
            <span className="text-[10px] font-mono" style={{color:"#1e3a5f"}}>
              تكلّس يوم <span style={{color:"#3b82f6"}}>{cs.candlingNext}</span>
            </span>
          )}
          <div className="flex items-center gap-1.5 text-[10px] font-semibold"
            style={{color:cs.turningNeeded?"#fbbf24":"#1e3a5f"}}>
            <RotateCcw className="w-3.5 h-3.5" style={{animation:cs.turningNeeded?"spin 3s linear infinite":"none"}}/>
            {cs.turningNeeded?"تقليب":"لا تقليب"}
          </div>
        </div>
      </div>

      {/* ── Alerts ── */}
      {alerts.length>0&&(
        <div className="px-5 py-3 space-y-2" style={{borderBottom:`1px solid rgba(255,255,255,0.05)`}}>
          {alerts.map((a,i)=>(
            <div key={i} className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs"
              style={{
                background:`rgba(${a.crit?"239,68,68":"245,158,11"},0.07)`,
                border:`1px solid rgba(${a.crit?"239,68,68":"245,158,11"},0.2)`,
                color:a.crit?"#fca5a5":"#fcd34d",
              }}>
              {a.crit
                ?<AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5"/>
                :<AlertCircle   className="w-3.5 h-3.5 shrink-0 mt-0.5"/>}
              {a.msg}
            </div>
          ))}
        </div>
      )}
      {alerts.length===0&&(
        <div className="px-5 py-2.5 flex items-center gap-2"
          style={{borderBottom:`1px solid rgba(255,255,255,0.05)`,color:"rgba(16,185,129,0.5)"}}>
          <CheckCircle2 className="w-3.5 h-3.5"/>
          <span className="text-xs">جميع المؤشرات طبيعية</span>
        </div>
      )}

      {/* ── Financial ── */}
      <div className="px-5 py-4" style={{borderBottom:`1px solid rgba(255,255,255,0.05)`}}>
        <div className="flex items-center gap-1.5 mb-3">
          <TrendingUp className="w-3.5 h-3.5" style={{color:"#1e3a5f"}}/>
          <span className="text-[9px] uppercase tracking-widest" style={{color:"#1e3a5f"}}>التوقعات المالية</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            {l:"تكلفة البيض",  v:`${(eggCost/1000).toFixed(0)}K`, c:"#f87171"},
            {l:"إيراد متوقع", v:`${(expRev/1000).toFixed(0)}K`,   c:"#34d399"},
            {l:"ربح متوقع",   v:`${((expRev-eggCost)/1000).toFixed(0)}K`, c:(expRev-eggCost)>0?"#34d399":"#f87171"},
          ].map(s=>(
            <div key={s.l} className="text-center py-3 rounded-xl"
              style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.05)"}}>
              <div className="text-lg font-black font-mono" style={{color:s.c,textShadow:`0 0 10px ${s.c}30`}}>{s.v}</div>
              <div className="text-[9px] mt-1" style={{color:"#1e3a5f"}}>{s.l}</div>
            </div>
          ))}
        </div>
        {cycle.notes&&<p className="text-[10px] mt-3 italic" style={{color:"#1e3a5f"}}>"{cycle.notes}"</p>}
      </div>

      {/* ── Hatch Log ── */}
      <div className="px-5 py-4">
        <HatchLog cycleId={cycle.id} eggsSet={cycle.eggsSet} isActive={isActivePhase}/>
      </div>
    </div>
  );
}

// ══════════════════════ COMPLETED CARD ═════════════════════════════════════════

function LastCycleCard({ inc, cycle }: { inc:Incubator; cycle:Cycle }) {
  const hatched = cycle.eggsHatched??0;
  const rate    = cycle.eggsSet>0?Math.round((hatched/cycle.eggsSet)*100):0;
  const rateCol = rate>=70?"#34d399":rate>=50?"#fbbf24":"#f87171";
  const rateRgb = rate>=70?"52,211,153":rate>=50?"251,191,36":"248,113,113";

  return (
    <div className="rounded-3xl overflow-hidden"
      style={{
        background:"#050d1a",
        border:"1px solid rgba(99,102,241,0.2)",
        boxShadow:"0 24px 48px rgba(0,0,0,0.5), 0 0 60px rgba(99,102,241,0.06)",
      }}>
      <div className="h-[2px]" style={{background:"linear-gradient(90deg,transparent,#6366f1,transparent)"}}/>

      {/* Header */}
      <div className="px-6 pt-6 pb-4 bg-gradient-to-b from-indigo-950/50 to-transparent">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{color:"#818cf8cc"}}>{inc.name}</span>
              {inc.model&&<span className="text-[10px] font-mono" style={{color:"#1e3a5f"}}>{inc.model}</span>}
            </div>
            <h2 className="text-2xl font-black leading-tight" style={{color:"#a5b4fc"}}>{cycle.batchName}</h2>
            <p className="text-[10px] mt-0.5" style={{color:"#1e3a5f"}}>آخر دورة مكتملة</p>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full shrink-0"
            style={{background:"rgba(99,102,241,0.1)",border:"1px solid rgba(99,102,241,0.3)",color:"#818cf8"}}>
            <CheckCircle2 className="w-3.5 h-3.5"/>
            <span className="text-xs font-bold">مكتملة</span>
          </div>
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2" style={{borderTop:"1px solid rgba(255,255,255,0.05)",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
        {[
          {l:"بدأت",   d:fmtDate(cycle.startDate),  s:cycle.setTime??"——"},
          {l:"انتهت",  d:fmtDate(cycle.actualHatchDate??cycle.expectedHatchDate), s:"تاريخ الإنتهاء"},
        ].map((item,i)=>(
          <div key={i} className="px-5 py-4 text-center"
            style={{borderRight:i===0?"1px solid rgba(255,255,255,0.05)":"none"}}>
            <div className="text-[9px] uppercase tracking-widest mb-2" style={{color:"#1e3a5f"}}>{item.l}</div>
            <div className="font-mono text-base font-bold" style={{color:"#94a3b8"}}>{item.d}</div>
            <div className="font-mono text-xs mt-1" style={{color:"#374151"}}>{item.s}</div>
          </div>
        ))}
      </div>

      {/* Big 3 results */}
      <div className="grid grid-cols-3" style={{borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
        {[
          {l:"بيض وُضع",   v:fmtN(cycle.eggsSet), c:"#94a3b8"},
          {l:"صيصان",     v:fmtN(hatched),         c:"#cbd5e1"},
          {l:"نسبة الفقس",v:`${rate}%`,             c:rateCol},
        ].map((s,i)=>(
          <div key={i} className="py-6 text-center"
            style={{borderRight:i<2?"1px solid rgba(255,255,255,0.05)":"none"}}>
            <div className="text-[9px] uppercase tracking-widest mb-2" style={{color:"#1e3a5f"}}>{s.l}</div>
            <div className="text-4xl font-black font-mono leading-none"
              style={{color:s.c,textShadow:i===2?`0 0 20px ${s.c}60`:"none"}}>
              {s.v}
            </div>
          </div>
        ))}
      </div>

      {/* Rate bar */}
      <div className="px-5 py-4" style={{borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
        <div className="w-full h-2 rounded-full overflow-hidden" style={{background:"#0f172a"}}>
          <div className="h-full rounded-full transition-all duration-1000"
            style={{width:`${rate}%`,background:`linear-gradient(90deg, ${rateCol}80, ${rateCol})`,boxShadow:`0 0 10px ${rateCol}60`}}/>
        </div>
        <div className="flex justify-between mt-2 text-[9px] font-mono" style={{color:"#1e3a5f"}}>
          <span>0%</span>
          <span>{(cycle.eggsSet*500/1000).toFixed(0)}K د.ع تكلفة</span>
          <span>100%</span>
        </div>
        {cycle.notes&&<p className="text-[10px] mt-2 italic" style={{color:"#1e3a5f"}}>"{cycle.notes}"</p>}
      </div>

      {/* Hatch log */}
      <div className="px-5 py-4">
        <HatchLog cycleId={cycle.id} eggsSet={cycle.eggsSet} isActive={false}/>
      </div>
    </div>
  );
}

// ══════════════════════ HISTORY ════════════════════════════════════════════════

function HistoryBar({ cycles }:{ cycles:Cycle[] }) {
  const done = cycles
    .filter(c=>c.status==="completed"&&c.eggsHatched!=null)
    .sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())
    .slice(0,7);
  if(done.length<2) return null;
  const avg = Math.round(done.reduce((s,c)=>s+(c.eggsHatched!/c.eggsSet),0)/done.length*100);
  return (
    <div className="px-6 py-5" style={{borderTop:"1px solid rgba(255,255,255,0.05)"}}>
      <div className="flex justify-between items-center mb-4">
        <span className="text-[9px] uppercase tracking-widest" style={{color:"#1e3a5f"}}>سجل الدورات المكتملة</span>
        <span className="text-xs font-bold font-mono" style={{color:avg>=65?"#34d399":"#fbbf24",textShadow:`0 0 10px ${avg>=65?"rgba(52,211,153,0.4)":"rgba(251,191,36,0.4)"}`}}>
          متوسط {avg}%
        </span>
      </div>
      <div className="space-y-2.5">
        {done.map(c=>{
          const r = Math.round((c.eggsHatched!/c.eggsSet)*100);
          const col = r>=70?"#34d399":r>=50?"#fbbf24":"#f87171";
          return (
            <div key={c.id} className="flex items-center gap-3">
              <span className="w-8 text-right font-black font-mono text-xs shrink-0" style={{color:col,textShadow:`0 0 8px ${col}50`}}>{r}%</span>
              <div className="flex-1 rounded-full overflow-hidden" style={{height:"5px",background:"#0f172a"}}>
                <div className="h-full rounded-full" style={{width:`${r}%`,background:col,boxShadow:`0 0 6px ${col}`}}/>
              </div>
              <span className="text-[10px] font-mono truncate max-w-[100px]" style={{color:"#1e3a5f"}}>{c.batchName}</span>
              <span className="text-[9px] font-mono shrink-0" style={{color:"#1e293b"}}>{fmtDate(c.startDate)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════ MAIN ═══════════════════════════════════════════════════

export default function IncubationCenter() {
  const base = import.meta.env.BASE_URL ?? "/";

  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(()=>{ const id=setInterval(()=>setNowMs(Date.now()),1_000); return()=>clearInterval(id); },[]);

  const sseRef  = useRef(0);
  const [liveMap, setLiveMap] = useState<Map<number,Cycle>>(new Map());
  const [conn,    setConn]    = useState<"connecting"|"sse"|"poll">("connecting");

  useEffect(()=>{
    let cancelled=false, es:EventSource|null=null, pt:ReturnType<typeof setInterval>|null=null;
    const apply=(_:number,cycles:Cycle[])=>{ if(!cancelled) setLiveMap(new Map(cycles.map(c=>[c.id,c]))); };
    const poll=async()=>{ try{ const d:Cycle[]=await apiFetch("/dashboard/active-cycles"); if(!cancelled) apply(0,d); }catch{} };
    const startPoll=()=>{ if(cancelled)return; setConn("poll"); poll(); pt=setInterval(poll,30_000); };
    const connect=()=>{
      if(cancelled)return;
      try{
        es=new EventSource(`${base}api/hatching/live-stream`,{withCredentials:true});
        es.onopen=()=>{ if(!cancelled){sseRef.current=0;setConn("sse");} };
        es.onmessage=ev=>{ try{ const p=JSON.parse(ev.data) as {serverTime:number;cycles:Cycle[]}; apply(p.serverTime,p.cycles); if(!cancelled)setConn("sse"); }catch{} };
        es.onerror=()=>{ es?.close();es=null;sseRef.current++;if(sseRef.current>=3)startPoll();else if(!cancelled)setTimeout(connect,5_000); };
      }catch{startPoll();}
    };
    connect();
    return()=>{ cancelled=true;es?.close();if(pt)clearInterval(pt); };
  },[base]);

  const {data:incubators=[],isLoading}=useQuery<Incubator[]>({
    queryKey:["incubators"],queryFn:()=>apiFetch("/incubators"),refetchInterval:60_000,
  });
  const {data:allCycles=[]}=useQuery<Cycle[]>({
    queryKey:["all-cycles"],queryFn:()=>apiFetch("/hatching-cycles"),refetchInterval:120_000,
  });

  const machines = useMemo(()=>{
    return incubators.map(inc=>{
      let active:Cycle|null=null;
      for(const[,c]of liveMap){ if(c.incubatorId===inc.id){active=c;break;} }
      if(!active&&inc.activeCycle) active=inc.activeCycle;
      const running=active&&(active.status==="incubating"||active.status==="hatching");
      if(running) return {inc,cycle:active!,mode:"active" as const};
      const last=allCycles.filter(c=>c.incubatorId===inc.id).sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())[0]??null;
      return {inc,cycle:last,mode:"last" as const};
    });
  },[incubators,liveMap,allCycles]);

  const activeCount = machines.filter(m=>m.mode==="active").length;
  const totalEggs   = machines.filter(m=>m.mode==="active"&&m.cycle).reduce((s,m)=>s+m.cycle!.eggsSet,0);
  const completed   = allCycles.filter(c=>c.status==="completed"&&c.eggsHatched!=null);
  const histRate    = completed.length>0?Math.round(completed.reduce((s,c)=>s+(c.eggsHatched!/c.eggsSet),0)/completed.length*100):0;

  if(isLoading) return (
    <div className="rounded-3xl animate-pulse" style={{background:"#050d1a",border:"1px solid rgba(255,255,255,0.06)"}}>
      <div className="h-16 rounded-t-3xl" style={{background:"rgba(255,255,255,0.02)"}}/>
      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="h-96 rounded-2xl" style={{background:"rgba(255,255,255,0.02)"}}/>
        <div className="h-96 rounded-2xl" style={{background:"rgba(255,255,255,0.02)"}}/>
      </div>
    </div>
  );

  if(incubators.length===0) return (
    <div className="rounded-3xl py-20 text-center" style={{background:"#050d1a",border:"1px solid rgba(255,255,255,0.06)"}}>
      <Egg className="w-12 h-12 mx-auto mb-4" style={{color:"#1e293b"}}/>
      <p className="text-sm" style={{color:"#374151"}}>لا توجد فقاسات مسجلة</p>
    </div>
  );

  return (
    <div className="rounded-3xl overflow-hidden" style={{background:"#050d1a",border:"1px solid rgba(255,255,255,0.07)",boxShadow:"0 40px 80px rgba(0,0,0,0.8)"}}>

      {/* ── Top bar ── */}
      <div className="relative flex items-center justify-between px-6 py-4 overflow-hidden"
        style={{background:"linear-gradient(135deg, #070f1e 0%, #050d1a 100%)",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
        {/* Background glow */}
        {activeCount>0&&<div className="absolute inset-0 opacity-30" style={{background:`radial-gradient(ellipse at 20% 50%, rgba(59,130,246,0.15) 0%, transparent 60%)`}}/>}

        <div className="relative flex items-center gap-4">
          <div className="relative w-9 h-9 rounded-xl flex items-center justify-center"
            style={{background:"rgba(59,130,246,0.15)",border:"1px solid rgba(59,130,246,0.3)",boxShadow:"0 0 20px rgba(59,130,246,0.2)"}}>
            <Egg className="w-5 h-5" style={{color:"#60a5fa"}}/>
            {conn==="sse"&&<span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 bg-emerald-400 animate-pulse" style={{borderColor:"#050d1a"}}/>}
          </div>
          <div>
            <div className="text-sm font-bold text-white tracking-wide">مركز التفقيس</div>
            <div className="flex items-center gap-2 text-[10px] mt-0.5">
              {conn==="sse"        &&<><Wifi      className="w-3 h-3" style={{color:"#34d399"}}/><span style={{color:"#34d399"}}>LIVE</span></>}
              {conn==="poll"       &&<><RefreshCw className="w-3 h-3" style={{color:"#fbbf24"}}/><span style={{color:"#fbbf24"}}>POLL</span></>}
              {conn==="connecting" &&<><WifiOff   className="w-3 h-3 animate-pulse" style={{color:"#1e3a5f"}}/><span style={{color:"#1e3a5f"}}>…</span></>}
            </div>
          </div>
        </div>

        <div className="relative flex items-center gap-2 flex-wrap justify-end">
          {activeCount>0&&(
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold"
              style={{background:"rgba(59,130,246,0.1)",border:"1px solid rgba(59,130,246,0.3)",color:"#93c5fd"}}>
              <Zap className="w-3 h-3"/>
              {activeCount} نشطة
            </div>
          )}
          {totalEggs>0&&(
            <div className="px-3 py-1.5 rounded-full text-[11px] font-mono"
              style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#64748b"}}>
              {fmtN(totalEggs)} بيضة
            </div>
          )}
          {histRate>0&&(
            <div className="px-3 py-1.5 rounded-full text-[11px] font-bold font-mono"
              style={{
                background:histRate>=65?"rgba(16,185,129,0.1)":"rgba(245,158,11,0.1)",
                border:`1px solid ${histRate>=65?"rgba(16,185,129,0.3)":"rgba(245,158,11,0.3)"}`,
                color:histRate>=65?"#34d399":"#fbbf24",
              }}>
              <Shield className="w-3 h-3 inline me-1"/>{histRate}%
            </div>
          )}
        </div>
      </div>

      {/* ── Machines ── */}
      <div className="p-5">
        <div className={`grid gap-5 ${machines.length===1?"max-w-xl mx-auto":"grid-cols-1 lg:grid-cols-2"}`}>
          {machines.map(({inc,cycle,mode})=>{
            if(mode==="active"&&cycle) return <ActiveCard key={inc.id} inc={inc} cycle={cycle} nowMs={nowMs}/>;
            if(cycle)                  return <LastCycleCard key={inc.id} inc={inc} cycle={cycle}/>;
            return (
              <div key={inc.id} className="rounded-3xl flex flex-col items-center justify-center py-16"
                style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.04)"}}>
                <Egg className="w-10 h-10 mb-4" style={{color:"#1e293b"}}/>
                <div className="text-sm font-bold" style={{color:"#374151"}}>{inc.name}</div>
                <div className="text-xs mt-1" style={{color:"#1e293b"}}>لا توجد دورات بعد</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── History ── */}
      <HistoryBar cycles={allCycles}/>
    </div>
  );
}
