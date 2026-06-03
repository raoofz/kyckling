/**
 * IncubationCenter v5 — Structural Redesign
 * ═══════════════════════════════════════════════════════════════
 *
 * هيكل مختلف تماماً:
 *  • البطاقات الأفقية بدلاً من العمودية
 *  • بطاقة المكتملة: بيضاء مضيئة مع أرقام خضراء واضحة
 *  • بطاقة النشطة: داكنة مع عداد ضخم وواضح
 *  • الأقسام منفصلة بعناوين واضحة
 *  • زر فتح الفقاسة: صف مستقل بارز
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import {
  Thermometer, Droplets, Egg, Bird, Wifi, WifiOff,
  RefreshCw, Trash2, ChevronDown, ChevronUp,
  AlertTriangle, AlertCircle, CheckCircle2, RotateCcw,
  Calendar, Clock, TrendingUp, FlaskConical, Lock,
  Plus, Zap,
} from "lucide-react";

// ══ Types ═════════════════════════════════════════════════════════════════════

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

// ══ Phase logic ════════════════════════════════════════════════════════════════

type Phase = "incubation"|"lockdown"|"hatching"|"overdue"|"completed"|"failed";
interface PS {
  phase:Phase; day:number; pct:number; secsLeft:number;
  daysLeft:number; hoursLeft:number; minsLeft:number;
  idealTemp:number; idealHum:number; turningNeeded:boolean;
  candlingNext:number|null; embryo:string; label:string; color:string;
}
const EMBRYO:Record<number,string> = {
  1:"تكوين الجهاز العصبي",2:"الأوعية الدموية",3:"نبض القلب",
  4:"الرأس والأطراف",5:"الجهاز الهضمي",6:"المنقار والجناحين",
  7:"تكامل العينين",8:"نمو الأطراف",9:"بصيلات الريش",
  10:"تصلّب العظام",11:"الكلى والرئتان",12:"الغطاء الريشي",
  13:"تخزين الدهون",14:"التكلّس الثاني",15:"النمو مكتمل تقريباً",
  16:"الجهاز المناعي",17:"آخر يوم للتقليب",18:"الانتقال للفقس",
  19:"ثقب الغرفة الهوائية",20:"كسر القشرة",21:"الخروج",
};
function ps(cycle:Cycle, nowMs:number): PS {
  const s0 = new Date(`${cycle.startDate}T${cycle.setTime??"12:00"}:00`).getTime();
  const s1 = new Date(`${cycle.expectedHatchDate}T${cycle.setTime??"12:00"}:00`).getTime();
  const el = nowMs-s0, rem = Math.max(0,s1-nowMs), tot = s1-s0;
  const day = Math.max(1,Math.floor(el/86_400_000)+1);
  const pct = tot>0?Math.min(100,Math.round((el/tot)*100)):100;
  const secsLeft=Math.floor(rem/1000), daysLeft=Math.floor(rem/86_400_000);
  const hoursLeft=Math.floor((rem%86_400_000)/3_600_000);
  const minsLeft=Math.floor((rem%3_600_000)/60_000);
  let phase:Phase;
  if(cycle.status==="completed") phase="completed";
  else if(cycle.status==="failed") phase="failed";
  else if(secsLeft===0&&day>22) phase="overdue";
  else if(day>=19||cycle.status==="hatching") phase="hatching";
  else if(day>=18) phase="lockdown";
  else phase="incubation";
  const lkd=phase==="lockdown"||phase==="hatching";
  const colors:Record<Phase,string>={
    incubation:"#2563eb",lockdown:"#d97706",hatching:"#059669",
    overdue:"#dc2626",completed:"#059669",failed:"#7f1d1d",
  };
  const labels:Record<Phase,string>={
    incubation:"حضانة",lockdown:"إغلاق",hatching:"فقس نشط",
    overdue:"تأخّرت",completed:"مكتملة",failed:"فاشلة",
  };
  return {
    phase,day,pct,secsLeft,daysLeft,hoursLeft,minsLeft,
    idealTemp:lkd?37.2:37.7, idealHum:lkd?70:55,
    turningNeeded:phase==="incubation"&&day<=17,
    candlingNext:[7,14,18].find(d=>d>day)??null,
    embryo:EMBRYO[Math.min(day,21)]??"اكتمل التطور",
    label:labels[phase], color:colors[phase],
  };
}

// ══ Helpers ════════════════════════════════════════════════════════════════════

const p2=(n:number)=>String(n).padStart(2,"0");
const fDate=(d:string)=>{const[y,m,dd]=d.split("-");return`${dd}/${m}/${y}`;};
const fIso=(iso:string)=>{const d=new Date(iso);return`${p2(d.getDate())}/${p2(d.getMonth()+1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;};
const fN=(n:number)=>n.toLocaleString("en-US");

// ══ Countdown ══════════════════════════════════════════════════════════════════

function Cd({secs,phase,color}:{secs:number;phase:Phase;color:string}) {
  const [s,setS]=useState(secs);
  useEffect(()=>{setS(secs);},[secs]);
  useEffect(()=>{
    if(phase==="completed"||phase==="failed"||phase==="overdue") return;
    const id=setInterval(()=>setS(v=>Math.max(0,v-1)),1000);
    return()=>clearInterval(id);
  },[phase]);
  if(phase==="completed") return <span className="text-2xl font-black text-emerald-600">مكتملة ✓</span>;
  if(s<=0&&phase==="hatching") return <span className="text-3xl font-black animate-pulse" style={{color}}>يفقس!</span>;
  const d=Math.floor(s/86400),h=Math.floor((s%86400)/3600),m=Math.floor((s%3600)/60),sec=s%60;
  return (
    <div className="flex items-center gap-1 font-mono font-black" style={{color}}>
      {d>0&&<><span className="text-4xl leading-none">{d}</span><span className="text-xs opacity-50 me-1">ي</span></>}
      <span className="text-4xl leading-none">{p2(h)}</span><span className="text-sm opacity-40 mx-0.5">:</span>
      <span className="text-4xl leading-none">{p2(m)}</span><span className="text-sm opacity-40 mx-0.5">:</span>
      <span className="text-3xl leading-none opacity-60">{p2(sec)}</span>
    </div>
  );
}

// ══ Day bar ════════════════════════════════════════════════════════════════════

function Bar({day,color}:{day:number;color:string}) {
  const d=Math.max(0,Math.min(21,day));
  return (
    <div>
      <div className="flex gap-[2px] h-3">
        {Array.from({length:21},(_,i)=>{
          const n=i+1, filled=d>=n, now=n===d;
          const c=n<=17?"#2563eb":n===18?"#d97706":"#059669";
          return <div key={n} className="flex-1 rounded-[2px] transition-all" style={{
            background:filled?c:"rgba(255,255,255,0.07)",
            transform:now?"scaleY(1.5)":"scaleY(1)",
            boxShadow:now?`0 0 6px ${c}`:undefined,
          }}/>;
        })}
      </div>
      <div className="flex justify-between mt-1 text-[9px]" style={{color:"rgba(255,255,255,0.2)"}}>
        <span>١</span><span style={{color:"rgba(255,255,255,0.4)"}}>يوم {d}</span><span>٢١</span>
      </div>
    </div>
  );
}

// ══ Health selector + form ═════════════════════════════════════════════════════

const HO=[
  {v:"ممتازة",c:"#059669"},{v:"جيدة",c:"#2563eb"},
  {v:"مقبولة",c:"#d97706"},{v:"ضعيفة",c:"#dc2626"},
];

function OpenForm({cycleId,eggsSet,prev,onClose}:{cycleId:number;eggsSet:number;prev:number;onClose:()=>void}) {
  const qc=useQueryClient();
  const[cnt,setCnt]=useState("");
  const[health,setHealth]=useState("ممتازة");
  const[ts,setTs]=useState(()=>new Date().toISOString().slice(0,16));
  const[note,setNote]=useState("");
  const n=parseInt(cnt)||0;
  const add=useMutation({
    mutationFn:(d:object)=>apiFetch(`/hatching-cycles/${cycleId}/openings`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)}),
    onSuccess:()=>{qc.invalidateQueries({queryKey:["openings",cycleId]});onClose();},
  });
  return (
    <div className="rounded-2xl overflow-hidden border-2 border-emerald-500/40 bg-[#020f0a]">
      <div className="flex items-center justify-between px-4 py-3 bg-emerald-900/30 border-b border-emerald-500/20">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/>
          <span className="font-semibold text-emerald-300 text-sm">تسجيل فتحة الفقاسة</span>
        </div>
        <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10">×</button>
      </div>
      <div className="p-4 space-y-4">
        {prev>0&&<div className="bg-white/5 rounded-xl px-4 py-2 text-sm flex gap-3 items-center">
          <span className="text-white/40">مسجّل سابقاً:</span>
          <span className="font-black text-emerald-400 text-lg">{fN(prev)}</span>
          <span className="text-white/30">صوص</span>
        </div>}
        <div>
          <label className="text-[10px] tracking-widest uppercase text-white/30 block mb-2">عدد الصيصان *</label>
          <input type="number" min="0" value={cnt} onChange={e=>setCnt(e.target.value)} autoFocus placeholder="0"
            className="w-full h-16 rounded-xl text-center font-black text-4xl font-mono outline-none transition-all"
            style={{background:cnt?"rgba(5,150,105,0.15)":"rgba(255,255,255,0.05)",border:`2px solid ${cnt?"rgba(5,150,105,0.6)":"rgba(255,255,255,0.1)"}`,color:"#34d399"}}/>
        </div>
        <div>
          <label className="text-[10px] tracking-widest uppercase text-white/30 block mb-2">الحالة الصحية</label>
          <div className="grid grid-cols-4 gap-2">
            {HO.map(h=><button key={h.v} onClick={()=>setHealth(h.v)} className="py-2.5 rounded-xl text-xs font-bold transition-all"
              style={{background:health===h.v?`${h.c}20`:"rgba(255,255,255,0.04)",border:`1.5px solid ${health===h.v?h.c+"60":"rgba(255,255,255,0.08)"}`,color:health===h.v?h.c:"rgba(255,255,255,0.3)"}}>
              {h.v}
            </button>)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] tracking-widest uppercase text-white/30 block mb-2">التاريخ والوقت</label>
            <Input type="datetime-local" value={ts} onChange={e=>setTs(e.target.value)} className="h-10 text-sm font-mono" style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",color:"#e2e8f0",borderRadius:"0.75rem"}}/>
          </div>
          <div>
            <label className="text-[10px] tracking-widest uppercase text-white/30 block mb-2">ملاحظات</label>
            <Input value={note} onChange={e=>setNote(e.target.value)} placeholder="اختياري…" className="h-10 text-sm" style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",color:"#94a3b8",borderRadius:"0.75rem"}}/>
          </div>
        </div>
        {n>0&&<div className="grid grid-cols-3 gap-2 text-center p-3 rounded-xl bg-emerald-900/20 border border-emerald-500/20">
          {[{l:"يخرج الآن",v:fN(n),c:"#34d399"},{l:"الإجمالي",v:fN(prev+n),c:"#6ee7b7"},{l:"النسبة",v:`${eggsSet>0?Math.round(((prev+n)/eggsSet)*100):0}%`,c:"#a7f3d0"}]
            .map(s=><div key={s.l}><div className="text-xl font-black font-mono" style={{color:s.c}}>{s.v}</div><div className="text-[9px] mt-0.5 text-white/25">{s.l}</div></div>)}
        </div>}
        <button onClick={()=>{if(!n)return;add.mutate({chicksCount:n,openedAt:new Date(ts).toISOString(),notes:[health,note].filter(Boolean).join(" — ")||null});}}
          disabled={add.isPending||n<1}
          className="w-full h-12 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
          style={{background:n>0?"linear-gradient(135deg,#059669,#10b981)":"rgba(255,255,255,0.05)",color:n>0?"#fff":"rgba(255,255,255,0.2)",cursor:n>0?"pointer":"not-allowed",boxShadow:n>0?"0 0 20px rgba(16,185,129,0.3)":"none"}}>
          <Bird className="w-4 h-4"/>{add.isPending?"جاري الحفظ…":`حفظ — ${fN(n)} صوص · ${health}`}
        </button>
      </div>
    </div>
  );
}

// ══ Hatch log section ══════════════════════════════════════════════════════════

function Log({cycleId,eggsSet,active,lightMode}:{cycleId:number;eggsSet:number;active:boolean;lightMode?:boolean}) {
  const qc=useQueryClient();
  const[form,setForm]=useState(false);
  const[list,setList]=useState(false);
  const{data:openings=[]}=useQuery<Opening[]>({queryKey:["openings",cycleId],queryFn:()=>apiFetch(`/hatching-cycles/${cycleId}/openings`),refetchInterval:30_000});
  const del=useMutation({mutationFn:(id:number)=>apiFetch(`/hatch-openings/${id}`,{method:"DELETE"}),onSuccess:()=>qc.invalidateQueries({queryKey:["openings",cycleId]})});
  const total=openings.reduce((s,o)=>s+o.chicksCount,0);
  const rate=eggsSet>0?Math.round((total/eggsSet)*100):0;

  if(form) return <OpenForm cycleId={cycleId} eggsSet={eggsSet} prev={total} onClose={()=>setForm(false)}/>;

  const btnStyle = active
    ? {background:"linear-gradient(135deg,rgba(5,150,105,0.2),rgba(16,185,129,0.1))",border:"1.5px solid rgba(16,185,129,0.4)",color:"#34d399",boxShadow:"0 0 20px rgba(16,185,129,0.1)"}
    : lightMode
      ? {background:"#f0fdf4",border:"1.5px solid #86efac",color:"#16a34a"}
      : {background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.4)"};

  return (
    <div className="space-y-3">
      <button onClick={()=>setForm(true)} className="w-full h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2.5 transition-all" style={btnStyle}>
        <Bird className="w-4 h-4"/>
        <span>{active?"فتح الفقاسة — تسجيل الصيصان":"إضافة / عرض فتحات الفقاسة"}</span>
        {total>0&&<span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{background:active?"rgba(52,211,153,0.2)":"rgba(22,163,74,0.15)",color:active?"#34d399":"#16a34a"}}>{fN(total)}</span>}
      </button>

      {openings.length>0&&(
        <div>
          <div className="grid grid-cols-3 gap-2">
            {[
              {l:"إجمالي الصيصان",v:fN(total),c:lightMode?"#059669":"#34d399"},
              {l:"نسبة الفقس",v:`${rate}%`,c:rate>=65?(lightMode?"#059669":"#34d399"):rate>=45?(lightMode?"#d97706":"#fbbf24"):(lightMode?"#dc2626":"#f87171")},
              {l:"الفتحات",v:String(openings.length),c:lightMode?"#2563eb":"#93c5fd"},
            ].map(s=><div key={s.l} className="text-center py-2 rounded-lg" style={{background:lightMode?"rgba(0,0,0,0.04)":"rgba(255,255,255,0.04)",border:`1px solid ${lightMode?"rgba(0,0,0,0.08)":"rgba(255,255,255,0.07)"}`}}>
              <div className="text-lg font-black font-mono" style={{color:s.c}}>{s.v}</div>
              <div className="text-[9px] mt-0.5" style={{color:lightMode?"#9ca3af":"rgba(255,255,255,0.25)"}}>{s.l}</div>
            </div>)}
          </div>
          <button onClick={()=>setList(v=>!v)} className="w-full mt-2 text-[10px] flex items-center justify-center gap-1.5 py-1 transition-colors" style={{color:lightMode?"#9ca3af":"rgba(255,255,255,0.2)"}}>
            {list?<ChevronUp className="w-3 h-3"/>:<ChevronDown className="w-3 h-3"/>}
            {list?"إخفاء السجل التفصيلي":"السجل التفصيلي"}
          </button>
          {list&&<div className="space-y-1.5 mt-2 max-h-48 overflow-y-auto">
            {openings.map((o,i)=><div key={o.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm" style={{background:lightMode?"rgba(0,0,0,0.03)":"rgba(255,255,255,0.04)",border:`1px solid ${lightMode?"rgba(0,0,0,0.07)":"rgba(255,255,255,0.06)"}`}}>
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-[10px] font-mono w-5 text-center shrink-0" style={{color:lightMode?"#9ca3af":"rgba(255,255,255,0.2)"}}>#{i+1}</span>
                <span className="text-xl font-black font-mono shrink-0" style={{color:lightMode?"#059669":"#34d399"}}>{fN(o.chicksCount)}</span>
                <div className="min-w-0">
                  <div className="text-xs font-mono" style={{color:lightMode?"#6b7280":"rgba(255,255,255,0.35)"}}>{fIso(o.openedAt)}</div>
                  {o.notes&&<div className="text-[10px] truncate" style={{color:lightMode?"#9ca3af":"rgba(255,255,255,0.2)"}}>{o.notes}</div>}
                </div>
              </div>
              <button onClick={()=>del.mutate(o.id)} className="w-7 h-7 rounded-full flex items-center justify-center ms-2 transition-all shrink-0" style={{color:lightMode?"#d1d5db":"rgba(255,255,255,0.15)"}} onMouseEnter={e=>(e.currentTarget.style.color="#ef4444",e.currentTarget.style.background="rgba(239,68,68,0.1)")} onMouseLeave={e=>(e.currentTarget.style.color=lightMode?"#d1d5db":"rgba(255,255,255,0.15)",e.currentTarget.style.background="transparent")}>
                <Trash2 className="w-3.5 h-3.5"/>
              </button>
            </div>)}
          </div>}
        </div>
      )}
    </div>
  );
}

// ══ ACTIVE MACHINE CARD ════════════════════════════════════════════════════════

function ActiveCard({inc,cycle,nowMs}:{inc:Incubator;cycle:Cycle;nowMs:number}) {
  const state=useMemo(()=>ps(cycle,nowMs),[cycle,nowMs]);
  const {phase,day,color,label,secsLeft,daysLeft,hoursLeft,idealTemp,idealHum,turningNeeded,candlingNext,embryo}=state;
  const lkd=phase==="lockdown"||phase==="hatching";
  const T=lkd?(cycle.lockdownTemperature??cycle.temperature):cycle.temperature;
  const H=lkd?(cycle.lockdownHumidity??cycle.humidity):cycle.humidity;
  const occ=inc.capacity>0?Math.min(100,Math.round((cycle.eggsSet/inc.capacity)*100)):0;
  const eggCost=cycle.eggsSet*500, expChicks=Math.round(cycle.eggsSet*0.65), expRev=expChicks*1500;

  const lockdownStr=(()=>{
    if(cycle.lockdownDate) return fDate(cycle.lockdownDate);
    const s=new Date(`${cycle.startDate}T${cycle.setTime??"12:00"}:00`);
    s.setDate(s.getDate()+17);
    return `${p2(s.getDate())}/${p2(s.getMonth()+1)}/${s.getFullYear()}`;
  })();

  const tDiff=T!=null?Math.abs(T-idealTemp):null;
  const hDiff=H!=null?Math.abs(H-idealHum):null;
  const tBad=tDiff!=null&&tDiff>1;
  const hBad=hDiff!=null&&hDiff>8;

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col" style={{background:"#080e1a",border:`1.5px solid ${color}35`,boxShadow:`0 0 40px ${color}0d, 0 20px 40px rgba(0,0,0,0.5)`}}>

      {/* ── Header strip ── */}
      <div className="px-5 pt-4 pb-3" style={{background:`linear-gradient(135deg, ${color}18 0%, ${color}08 50%, transparent 100%)`}}>
        <div className="absolute h-[2px] inset-x-0 top-0" style={{background:`linear-gradient(90deg,transparent,${color},transparent)`}}/>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold tracking-widest uppercase" style={{color:color+"cc"}}>{inc.name}</span>
              {inc.model&&<span className="text-[10px] text-white/20 font-mono">{inc.model}</span>}
            </div>
            <div className="text-xl font-black text-white">{cycle.batchName}</div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold shrink-0" style={{background:`${color}18`,border:`1px solid ${color}45`,color}}>
            {phase==="hatching"&&<span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{background:color}}/>}
            {phase==="lockdown"&&<Lock className="w-3 h-3"/>}
            {label}
          </div>
        </div>
        <div className="mt-3"><Bar day={day} color={color}/></div>
      </div>

      {/* ── Dates row ── */}
      <div className="grid grid-cols-3" style={{borderTop:"1px solid rgba(255,255,255,0.06)",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
        {[
          {icon:Calendar,l:"وضع البيض",   d:fDate(cycle.startDate),    s:cycle.setTime??"——"},
          {icon:Lock,     l:"الإغلاق",    d:lockdownStr,               s:cycle.lockdownTime??"——"},
          {icon:Egg,      l:"موعد الفقس", d:fDate(cycle.expectedHatchDate), s:daysLeft>0?`${daysLeft}ي ${hoursLeft}س`:phase==="hatching"?"الآن":"حان"},
        ].map((item,i)=><div key={i} className="px-4 py-3 text-center" style={{borderRight:i<2?"1px solid rgba(255,255,255,0.06)":"none"}}>
          <div className="text-[9px] uppercase tracking-widest mb-1.5" style={{color:"rgba(255,255,255,0.2)"}}>{item.l}</div>
          <div className="font-mono text-sm font-bold text-white/80">{item.d}</div>
          <div className="font-mono text-xs mt-0.5" style={{color:i===2&&daysLeft<=1?"#fbbf24":"rgba(255,255,255,0.3)"}}>{item.s}</div>
        </div>)}
      </div>

      {/* ── Big 3 — Day | Countdown | Eggs ── */}
      <div className="grid grid-cols-3" style={{borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
        <div className="flex flex-col items-center justify-center py-5 px-3" style={{borderRight:"1px solid rgba(255,255,255,0.06)"}}>
          <div className="text-[9px] uppercase tracking-widest mb-2 text-white/20">اليوم</div>
          <div className="font-mono font-black leading-none" style={{fontSize:"4rem",color,textShadow:`0 0 30px ${color}80`}}>{day}</div>
          <div className="text-[9px] font-mono mt-1.5 text-white/15">من 21</div>
        </div>
        <div className="flex flex-col items-center justify-center py-5 px-2" style={{borderRight:"1px solid rgba(255,255,255,0.06)"}}>
          <div className="text-[9px] uppercase tracking-widest mb-2 text-white/20">{phase==="hatching"?"يفقس":"للفقس"}</div>
          <Cd secs={secsLeft} phase={phase} color={color}/>
        </div>
        <div className="flex flex-col items-center justify-center py-5 px-3">
          <div className="text-[9px] uppercase tracking-widest mb-2 text-white/20">بيض</div>
          <div className="font-mono font-black leading-none text-white" style={{fontSize:"3.2rem"}}>
            {cycle.eggsSet>=1000?<>{(cycle.eggsSet/1000).toFixed(1)}<span className="text-2xl text-white/20">K</span></>:cycle.eggsSet}
          </div>
          <div className="text-[9px] font-mono mt-1.5 text-white/15">{occ}% طاقة</div>
        </div>
      </div>

      {/* ── Sensors row ── */}
      <div className="grid grid-cols-2" style={{borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
        {[
          {icon:Thermometer,l:"حرارة",v:T,ideal:idealTemp,unit:"°C",bad:tBad,diff:tDiff},
          {icon:Droplets,   l:"رطوبة",v:H,ideal:idealHum, unit:"%", bad:hBad,diff:hDiff},
        ].map((s,i)=>{
          const sColor=s.v==null?"rgba(255,255,255,0.15)":s.bad?"#f87171":s.diff!=null&&s.diff>0.3?"#fbbf24":"#34d399";
          return <div key={i} className="px-5 py-4" style={{borderRight:i===0?"1px solid rgba(255,255,255,0.06)":"none"}}>
            <div className="flex items-center gap-1.5 mb-2">
              <s.icon className="w-3.5 h-3.5" style={{color:sColor}}/>
              <span className="text-[10px] uppercase tracking-widest" style={{color:"rgba(255,255,255,0.2)"}}>{s.l}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono font-black leading-none" style={{fontSize:"2.8rem",color:sColor,textShadow:!s.bad?`0 0 15px ${sColor}50`:"none"}}>{s.v??'—'}</span>
              <span className="text-base text-white/25">{s.unit}</span>
            </div>
            <div className="text-[10px] font-mono mt-1" style={{color:"rgba(255,255,255,0.2)"}}>
              مثالي {s.ideal}{s.unit}
              {s.diff!=null&&s.diff>0.05&&<span style={{color:sColor,marginInlineStart:"4px"}}>{s.v!=null&&s.v>s.ideal?"+":""}{(s.v!-s.ideal).toFixed(1)}</span>}
              {s.diff!=null&&s.diff<=0.05&&<span className="text-emerald-500 ms-1">✓</span>}
            </div>
          </div>;
        })}
      </div>

      {/* ── Embryo + Turning ── */}
      <div className="px-5 py-3 flex items-center justify-between" style={{borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
        <div className="flex items-center gap-2 min-w-0">
          <FlaskConical className="w-3.5 h-3.5 shrink-0 text-white/15"/>
          <span className="text-[9px] uppercase tracking-wider text-white/20 shrink-0">يوم {Math.min(day,21)}:</span>
          <span className="text-xs truncate text-white/35">{embryo}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {candlingNext&&<span className="text-[10px] font-mono text-white/20">تكلّس يوم <span className="text-blue-400">{candlingNext}</span></span>}
          <div className="flex items-center gap-1.5 text-[10px] font-semibold" style={{color:turningNeeded?"#fbbf24":"rgba(255,255,255,0.15)"}}>
            <RotateCcw className="w-3.5 h-3.5" style={{animation:turningNeeded?"spin 3s linear infinite":"none"}}/>
            {turningNeeded?"تقليب":"لا تقليب"}
          </div>
        </div>
      </div>

      {/* ── Alerts ── */}
      {(()=>{
        const a:Array<{crit:boolean;msg:string}>=[];
        if(!T) a.push({crit:false,msg:"لم تُسجَّل درجة الحرارة"});
        else if(tBad) a.push({crit:true,msg:`حرارة ${T}°C — المثالي ${idealTemp}°C`});
        if(phase==="lockdown") a.push({crit:true,msg:"يوم الإغلاق — أوقف التقليب وارفع الرطوبة إلى 70%"});
        if(phase==="hatching") a.push({crit:false,msg:"الفقس جارٍ — سجّل الصيصان عند كل فتحة"});
        if(phase==="overdue") a.push({crit:true,msg:"تجاوزت الموعد — افحص الوضع"});
        if(daysLeft===1&&phase==="incubation") a.push({crit:false,msg:"الإغلاق غداً — جهّز الماكينة"});
        if(!a.length) return <div className="px-5 py-2.5 flex items-center gap-2 text-xs text-emerald-500/50" style={{borderBottom:"1px solid rgba(255,255,255,0.06)"}}><CheckCircle2 className="w-3.5 h-3.5"/>جميع المؤشرات طبيعية</div>;
        return <div className="px-5 py-3 space-y-1.5" style={{borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
          {a.map((al,i)=><div key={i} className="flex items-start gap-2 text-xs px-3 py-2 rounded-xl" style={{background:`rgba(${al.crit?"239,68,68":"245,158,11"},0.08)`,border:`1px solid rgba(${al.crit?"239,68,68":"245,158,11"},0.22)`,color:al.crit?"#fca5a5":"#fcd34d"}}>
            {al.crit?<AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5"/>:<AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5"/>}{al.msg}
          </div>)}
        </div>;
      })()}

      {/* ── Financial ── */}
      <div className="px-5 py-3" style={{borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
        <div className="flex items-center gap-1.5 mb-2.5">
          <TrendingUp className="w-3.5 h-3.5 text-white/15"/>
          <span className="text-[9px] uppercase tracking-widest text-white/20">التوقعات المالية</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            {l:"تكلفة البيض",v:`${(eggCost/1000).toFixed(0)}K`,c:"#f87171"},
            {l:"إيراد متوقع",v:`${(expRev/1000).toFixed(0)}K`,c:"#34d399"},
            {l:"ربح متوقع",v:`${((expRev-eggCost)/1000).toFixed(0)}K`,c:(expRev-eggCost)>0?"#34d399":"#f87171"},
          ].map(s=><div key={s.l} className="text-center py-2.5 rounded-xl" style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)"}}>
            <div className="text-base font-black font-mono" style={{color:s.c}}>{s.v}</div>
            <div className="text-[9px] mt-0.5 text-white/20">{s.l}</div>
          </div>)}
        </div>
        {cycle.notes&&<p className="text-[10px] mt-2 text-white/20 italic">"{cycle.notes}"</p>}
      </div>

      {/* ── Hatch log ── */}
      <div className="px-5 py-4">
        <Log cycleId={cycle.id} eggsSet={cycle.eggsSet} active={phase!=="completed"&&phase!=="failed"}/>
      </div>
    </div>
  );
}

// ══ COMPLETED MACHINE CARD — بيضاء مضيئة وواضحة ════════════════════════════

function CompletedCard({inc,cycle}:{inc:Incubator;cycle:Cycle}) {
  const hatched=cycle.eggsHatched??0;
  const rate=cycle.eggsSet>0?Math.round((hatched/cycle.eggsSet)*100):0;
  const rateCol=rate>=70?"#16a34a":rate>=50?"#d97706":"#dc2626";
  const eggCost=cycle.eggsSet*500;

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col bg-white" style={{border:"1.5px solid #d1fae5",boxShadow:"0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(5,150,105,0.1)"}}>

      {/* ── Green completed header ── */}
      <div className="px-5 pt-4 pb-4 bg-gradient-to-br from-emerald-50 to-white">
        <div className="h-[2px] absolute inset-x-0 top-0 rounded-t-2xl bg-emerald-500"/>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold tracking-widest uppercase text-emerald-700">{inc.name}</span>
              {inc.model&&<span className="text-[10px] text-gray-400 font-mono">{inc.model}</span>}
            </div>
            <div className="text-xl font-black text-gray-900">{cycle.batchName}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">آخر دورة مكتملة</div>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-100 border border-emerald-200 shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600"/>
            <span className="font-bold text-emerald-700 text-sm">مكتملة</span>
          </div>
        </div>
      </div>

      {/* ── Dates ── */}
      <div className="grid grid-cols-2 border-t border-b border-gray-100">
        {[
          {l:"تاريخ البداية",d:fDate(cycle.startDate),s:cycle.setTime??"——"},
          {l:"تاريخ الإنتهاء",d:fDate(cycle.actualHatchDate??cycle.expectedHatchDate),s:"تاريخ الانتهاء"},
        ].map((item,i)=><div key={i} className="px-5 py-3 text-center" style={{borderRight:i===0?"1px solid #f0fdf4":"none"}}>
          <div className="text-[9px] uppercase tracking-widest text-gray-400 mb-1.5">{item.l}</div>
          <div className="font-mono font-bold text-gray-800 text-sm">{item.d}</div>
          <div className="font-mono text-xs mt-0.5 text-gray-400">{item.s}</div>
        </div>)}
      </div>

      {/* ── Big results — THE MOST IMPORTANT SECTION ── */}
      <div className="px-5 py-6 bg-gradient-to-b from-white to-emerald-50/30">
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            {l:"بيض وُضع",   v:fN(cycle.eggsSet), c:"#374151",   bg:"#f9fafb",   border:"#e5e7eb"},
            {l:"صيصان فقست",v:fN(hatched),        c:"#065f46",   bg:"#ecfdf5",   border:"#a7f3d0"},
            {l:"نسبة الفقس", v:`${rate}%`,        c:rateCol,     bg:rate>=70?"#f0fdf4":rate>=50?"#fffbeb":"#fef2f2", border:rate>=70?"#86efac":rate>=50?"#fde68a":"#fca5a5"},
          ].map(s=><div key={s.l} className="text-center py-4 rounded-2xl" style={{background:s.bg,border:`1.5px solid ${s.border}`}}>
            <div className="text-[9px] uppercase tracking-widest mb-2" style={{color:"#9ca3af"}}>{s.l}</div>
            <div className="text-4xl font-black font-mono leading-none" style={{color:s.c}}>{s.v}</div>
          </div>)}
        </div>

        {/* Progress bar */}
        <div className="h-3 rounded-full overflow-hidden bg-gray-100">
          <div className="h-full rounded-full transition-all duration-1000" style={{width:`${rate}%`,background:`linear-gradient(90deg,${rateCol}80,${rateCol})`,boxShadow:`0 0 8px ${rateCol}60`}}/>
        </div>
        <div className="flex justify-between mt-1.5 text-[9px] font-mono text-gray-300">
          <span>0%</span>
          <span>تكلفة: {(eggCost/1000).toFixed(0)}K دينار</span>
          <span>100%</span>
        </div>
      </div>

      {/* ── Notes ── */}
      {cycle.notes&&<div className="px-5 pb-3 text-xs text-gray-400 italic border-t border-gray-100 pt-3">"{cycle.notes}"</div>}

      {/* ── Hatch log ── */}
      <div className="px-5 pb-4 mt-1 border-t border-gray-100 pt-4">
        <Log cycleId={cycle.id} eggsSet={cycle.eggsSet} active={false} lightMode/>
      </div>
    </div>
  );
}

// ══ History ════════════════════════════════════════════════════════════════════

function History({cycles}:{cycles:Cycle[]}) {
  const done=cycles.filter(c=>c.status==="completed"&&c.eggsHatched!=null)
    .sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()).slice(0,7);
  if(done.length<2) return null;
  const avg=Math.round(done.reduce((s,c)=>s+(c.eggsHatched!/c.eggsSet),0)/done.length*100);
  return (
    <div className="px-6 py-5 border-t border-white/5">
      <div className="flex justify-between items-center mb-3">
        <span className="text-[9px] uppercase tracking-widest text-white/20">سجل الدورات</span>
        <span className="text-xs font-bold font-mono" style={{color:avg>=65?"#34d399":"#fbbf24"}}>متوسط {avg}%</span>
      </div>
      <div className="space-y-2">
        {done.map(c=>{
          const r=Math.round((c.eggsHatched!/c.eggsSet)*100);
          const col=r>=70?"#34d399":r>=50?"#fbbf24":"#f87171";
          return <div key={c.id} className="flex items-center gap-3">
            <span className="w-9 text-right font-black font-mono text-xs shrink-0" style={{color:col}}>{r}%</span>
            <div className="flex-1 rounded-full overflow-hidden h-1.5 bg-white/5">
              <div className="h-full rounded-full" style={{width:`${r}%`,background:col,boxShadow:`0 0 5px ${col}`}}/>
            </div>
            <span className="text-[10px] font-mono truncate max-w-[110px] text-white/20">{c.batchName}</span>
            <span className="text-[9px] font-mono shrink-0 text-white/10">{fDate(c.startDate)}</span>
          </div>;
        })}
      </div>
    </div>
  );
}

// ══ MAIN ═══════════════════════════════════════════════════════════════════════

export default function IncubationCenter() {
  const base=import.meta.env.BASE_URL??"/";
  const[nowMs,setNowMs]=useState(Date.now());
  useEffect(()=>{const id=setInterval(()=>setNowMs(Date.now()),1_000);return()=>clearInterval(id);},[]);
  const sseRef=useRef(0);
  const[liveMap,setLiveMap]=useState<Map<number,Cycle>>(new Map());
  const[conn,setConn]=useState<"connecting"|"sse"|"poll">("connecting");
  useEffect(()=>{
    let c=false,es:EventSource|null=null,pt:ReturnType<typeof setInterval>|null=null;
    const apply=(_:number,cycles:Cycle[])=>{if(!c)setLiveMap(new Map(cycles.map(x=>[x.id,x])));};
    const poll=async()=>{try{const d:Cycle[]=await apiFetch("/dashboard/active-cycles");if(!c)apply(0,d);}catch{}};
    const sp=()=>{if(c)return;setConn("poll");poll();pt=setInterval(poll,30_000);};
    const connect=()=>{
      if(c)return;
      try{
        es=new EventSource(`${base}api/hatching/live-stream`,{withCredentials:true});
        es.onopen=()=>{if(!c){sseRef.current=0;setConn("sse");}};
        es.onmessage=ev=>{try{const p=JSON.parse(ev.data) as {serverTime:number;cycles:Cycle[]};apply(p.serverTime,p.cycles);if(!c)setConn("sse");}catch{}};
        es.onerror=()=>{es?.close();es=null;sseRef.current++;if(sseRef.current>=3)sp();else if(!c)setTimeout(connect,5_000);};
      }catch{sp();}
    };
    connect();
    return()=>{c=true;es?.close();if(pt)clearInterval(pt);};
  },[base]);

  const{data:incubators=[],isLoading}=useQuery<Incubator[]>({queryKey:["incubators"],queryFn:()=>apiFetch("/incubators"),refetchInterval:60_000});
  const{data:allCycles=[]}=useQuery<Cycle[]>({queryKey:["all-cycles"],queryFn:()=>apiFetch("/hatching-cycles"),refetchInterval:120_000});

  const machines=useMemo(()=>incubators.map(inc=>{
    let active:Cycle|null=null;
    for(const[,c]of liveMap)if(c.incubatorId===inc.id){active=c;break;}
    if(!active&&inc.activeCycle)active=inc.activeCycle;
    const running=active&&(active.status==="incubating"||active.status==="hatching");
    if(running)return{inc,cycle:active!,mode:"active" as const};
    const last=allCycles.filter(c=>c.incubatorId===inc.id).sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())[0]??null;
    return{inc,cycle:last,mode:"last" as const};
  }),[incubators,liveMap,allCycles]);

  const activeCount=machines.filter(m=>m.mode==="active").length;
  const totalEggs=machines.filter(m=>m.mode==="active"&&m.cycle).reduce((s,m)=>s+m.cycle!.eggsSet,0);
  const completed=allCycles.filter(c=>c.status==="completed"&&c.eggsHatched!=null);
  const histRate=completed.length>0?Math.round(completed.reduce((s,c)=>s+(c.eggsHatched!/c.eggsSet),0)/completed.length*100):0;

  if(isLoading) return <div className="rounded-2xl h-64 animate-pulse bg-gray-900 border border-gray-800"/>;
  if(!incubators.length) return (
    <div className="rounded-2xl py-16 text-center bg-gray-900 border border-gray-800">
      <Egg className="w-10 h-10 mx-auto mb-3 text-gray-700"/>
      <p className="text-gray-600 text-sm">لا توجد فقاسات مسجلة</p>
    </div>
  );

  return (
    <div className="rounded-2xl overflow-hidden bg-[#06090f] border border-white/[0.07] shadow-2xl">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06] bg-[#080c14]">
        <div className="flex items-center gap-3">
          <div className="relative w-8 h-8 rounded-xl flex items-center justify-center bg-blue-500/15 border border-blue-500/25" style={{boxShadow:"0 0 15px rgba(59,130,246,0.15)"}}>
            <Egg className="w-4 h-4 text-blue-400"/>
            {conn==="sse"&&<span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border-2 border-[#080c14] animate-pulse"/>}
          </div>
          <div>
            <div className="text-sm font-bold text-white">مركز التفقيس</div>
            <div className="flex items-center gap-2 text-[10px] mt-0.5">
              {conn==="sse"        &&<><Wifi      className="w-3 h-3 text-emerald-400"/><span className="text-emerald-400">مباشر</span></>}
              {conn==="poll"       &&<><RefreshCw className="w-3 h-3 text-amber-400"/><span className="text-amber-400">دوري</span></>}
              {conn==="connecting" &&<><WifiOff   className="w-3 h-3 text-white/15 animate-pulse"/><span className="text-white/15">…</span></>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeCount>0&&<span className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300"><Zap className="w-3 h-3"/>{activeCount} نشطة</span>}
          {totalEggs>0&&<span className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 border border-white/[0.07] text-white/25 font-mono">{fN(totalEggs)} بيضة</span>}
          {histRate>0&&<span className="text-[11px] font-bold px-2.5 py-1 rounded-full font-mono" style={{background:histRate>=65?"rgba(5,150,105,0.1)":"rgba(217,119,6,0.1)",border:`1px solid ${histRate>=65?"rgba(5,150,105,0.3)":"rgba(217,119,6,0.3)"}`,color:histRate>=65?"#34d399":"#fbbf24"}}>{histRate}%</span>}
        </div>
      </div>

      {/* Cards */}
      <div className="p-4">
        <div className={`grid gap-4 ${machines.length===1?"max-w-lg mx-auto":"grid-cols-1 lg:grid-cols-2"}`}>
          {machines.map(({inc,cycle,mode})=>{
            if(mode==="active"&&cycle) return <ActiveCard key={inc.id} inc={inc} cycle={cycle} nowMs={nowMs}/>;
            if(cycle) return <CompletedCard key={inc.id} inc={inc} cycle={cycle}/>;
            return <div key={inc.id} className="rounded-2xl py-14 text-center border border-white/5 bg-white/[0.02]">
              <Egg className="w-8 h-8 text-white/10 mx-auto mb-3"/>
              <div className="text-sm text-white/20 font-bold">{inc.name}</div>
              <div className="text-xs text-white/10 mt-1">لا توجد دورات</div>
            </div>;
          })}
        </div>
      </div>

      <History cycles={allCycles}/>
    </div>
  );
}
