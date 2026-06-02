/**
 * IncubationCenter — مركز التفقيس الموحد
 * ════════════════════════════════════════════════════════════════════════════
 *
 * نظام مراقبة تفقيس موحد، احترافي، حقيقي البيانات.
 * كل ماكينة تظهر بشكل مستقل مع كامل بياناتها.
 *
 * مصادر البيانات:
 *   GET /api/incubators          → كل ماكينة + الدورة النشطة فيها
 *   GET /api/hatching-cycles     → كل الدورات (للتاريخ)
 *   SSE /api/hatching/live-stream → تحديث فوري للدورات النشطة
 *   GET /api/hatching-cycles/:id/openings → فتحات كل دورة
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Thermometer, Droplets, Egg, Bird, Calendar, Clock,
  AlertTriangle, CheckCircle2, Wifi, WifiOff, RefreshCw,
  Plus, Trash2, ChevronDown, ChevronUp, Lock, Zap,
  AlertCircle, Activity, Timer, Info,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Cycle {
  id: number;
  batchName: string;
  eggsSet: number;
  eggsHatched: number | null;
  startDate: string;
  setTime: string | null;
  expectedHatchDate: string;
  actualHatchDate: string | null;
  lockdownDate: string | null;
  status: string;
  temperature: number | null;
  humidity: number | null;
  lockdownTemperature: number | null;
  lockdownHumidity: number | null;
  incubatorId: number | null;
  notes: string | null;
  createdAt: string;
}

interface Incubator {
  id: number;
  name: string;
  model: string | null;
  capacity: number;
  status: string;
  activeCycle: Cycle | null;
}

interface Opening {
  id: number;
  hatchingCycleId: number;
  openedAt: string;
  chicksCount: number;
  notes: string | null;
  openedByName: string | null;
}

// ─── Incubation Science (صادق بالكامل) ──────────────────────────────────────

type Phase = "incubation" | "lockdown" | "hatching" | "overdue" | "completed" | "failed";

interface CycleState {
  phase: Phase;
  day: number;           // 1 … 21+
  pct: number;           // 0-100 of full 21-day cycle
  daysLeft: number;
  hoursLeft: number;
  secsLeft: number;      // total seconds until expected hatch
  idealTemp: number;
  idealHum: number;
  turningNeeded: boolean;
  embryo: string;        // one-line description for this day
  phaseAr: string;
}

/** علمي وحقيقي — لا خداع */
function getCycleState(cycle: Cycle, nowMs: number): CycleState {
  const startMs   = new Date(cycle.startDate + "T12:00:00").getTime();
  const hatchMs   = new Date(cycle.expectedHatchDate + "T12:00:00").getTime();
  const elapsedMs = nowMs - startMs;
  const remainMs  = Math.max(0, hatchMs - nowMs);

  const day     = Math.max(1, Math.floor(elapsedMs / 86_400_000) + 1);
  const pct     = Math.min(100, Math.round((elapsedMs / (hatchMs - startMs)) * 100));
  const daysLeft  = Math.floor(remainMs / 86_400_000);
  const hoursLeft = Math.floor((remainMs % 86_400_000) / 3_600_000);
  const secsLeft  = Math.floor(remainMs / 1_000);

  let phase: Phase;
  if (cycle.status === "completed") phase = "completed";
  else if (cycle.status === "failed") phase = "failed";
  else if (secsLeft === 0 && day > 21) phase = "overdue";
  else if (day >= 19) phase = "hatching";
  else if (day >= 18) phase = "lockdown";
  else phase = "incubation";

  const lockdown = phase === "lockdown" || phase === "hatching";
  const idealTemp = lockdown ? 37.2 : 37.7;
  const idealHum  = lockdown ? 70   : 55;
  const turningNeeded = phase === "incubation" && day <= 17;

  const embryoMap: Record<number, string> = {
    1:"بداية الجهاز العصبي", 2:"ظهور الأوعية الدموية",
    3:"القلب يبدأ النبض", 4:"تكوّن الرأس والأطراف",
    5:"الجهاز الهضمي والكبد", 6:"ظهور المنقار والجناحين",
    7:"تكامل العينين", 8:"نمو واضح للأجنحة والأرجل",
    9:"بصيلات الريش الأولى", 10:"تصلّب العظام",
    11:"الكلى والرئتان تعملان", 12:"غطاء ريشي كامل",
    13:"تخزين الدهون للفقس", 14:"تكامل الجهاز العضلي",
    15:"النمو شبه مكتمل", 16:"الجهاز المناعي ينضج",
    17:"آخر يوم للتقليب", 18:"الانتقال للفقس — أوقف التقليب",
    19:"ثقب الغرفة الهوائية", 20:"المنقار يكسر القشرة",
    21:"الصوص يخرج",
  };
  const embryo = embryoMap[Math.min(day, 21)] ?? "اكتمل التطور";

  const phaseMap: Record<Phase, string> = {
    incubation:"حضانة", lockdown:"إغلاق",
    hatching:"فقس نشط", overdue:"تأخّرت",
    completed:"مكتملة", failed:"فاشلة",
  };

  return { phase, day, pct, daysLeft, hoursLeft, secsLeft,
           idealTemp, idealHum, turningNeeded, embryo, phaseAr: phaseMap[phase] };
}

// ─── Color system per phase ───────────────────────────────────────────────────

const PHASE = {
  incubation:{ accent:"#3b82f6", ring:"ring-blue-500/30",   bar:"bg-blue-500",    text:"text-blue-400",   glow:"shadow-blue-500/10"   },
  lockdown:  { accent:"#f59e0b", ring:"ring-amber-500/30",  bar:"bg-amber-500",   text:"text-amber-400",  glow:"shadow-amber-500/10"  },
  hatching:  { accent:"#10b981", ring:"ring-emerald-500/30",bar:"bg-emerald-500", text:"text-emerald-400",glow:"shadow-emerald-500/10"},
  overdue:   { accent:"#ef4444", ring:"ring-red-500/40",    bar:"bg-red-500",     text:"text-red-400",    glow:"shadow-red-500/10"    },
  completed: { accent:"#64748b", ring:"ring-slate-500/20",  bar:"bg-slate-600",   text:"text-slate-400",  glow:""                     },
  failed:    { accent:"#dc2626", ring:"ring-red-700/30",    bar:"bg-red-800",     text:"text-red-500",    glow:""                     },
} satisfies Record<Phase, { accent:string; ring:string; bar:string; text:string; glow:string }>;

// ─── Smart Alerts ─────────────────────────────────────────────────────────────

interface Alert { level:"critical"|"warning"|"ok"|"info"; msg:string }

function getAlerts(cycle: Cycle, cs: CycleState, openings: Opening[]): Alert[] {
  const a: Alert[] = [];

  // Data gaps
  if (!cycle.temperature)
    a.push({ level:"warning", msg:"لم تُسجَّل درجة الحرارة — أدخلها الآن" });
  if (!cycle.humidity)
    a.push({ level:"warning", msg:"لم تُسجَّل الرطوبة" });

  // Temperature vs ideal
  if (cycle.temperature) {
    const d = Math.abs(cycle.temperature - cs.idealTemp);
    if (d > 1.5)      a.push({ level:"critical", msg:`الحرارة ${cycle.temperature}°C بعيدة جداً — المثالي ${cs.idealTemp}°C` });
    else if (d > 0.5) a.push({ level:"warning",  msg:`الحرارة ${cycle.temperature}°C — قريبة من الحد الأعلى` });
    else              a.push({ level:"ok",        msg:`الحرارة ${cycle.temperature}°C — ممتازة ✓` });
  }

  // Humidity vs ideal
  if (cycle.humidity) {
    const d = Math.abs(cycle.humidity - cs.idealHum);
    if (d > 12)      a.push({ level:"critical", msg:`الرطوبة ${cycle.humidity}% — بعيدة عن المثالي ${cs.idealHum}%` });
    else if (d > 6)  a.push({ level:"warning",  msg:`الرطوبة ${cycle.humidity}% — ضبطها للأفضل` });
    else             a.push({ level:"ok",        msg:`الرطوبة ${cycle.humidity}% — ممتازة ✓` });
  }

  // Phase-specific critical
  if (cs.phase === "lockdown")
    a.push({ level:"critical", msg:"يوم الإغلاق — أوقف التقليب فوراً وارفع الرطوبة إلى 70%" });
  if (cs.phase === "hatching" && openings.length === 0)
    a.push({ level:"warning",  msg:"الفقس جارٍ — اضغط + عند فتح الماكينة وتسجيل الصيصان" });
  if (cs.phase === "overdue")
    a.push({ level:"critical", msg:`تجاوزت موعد الفقس — راجع الإعدادات فوراً` });

  // Turning reminder
  if (cs.turningNeeded && cs.day >= 2)
    a.push({ level:"info", msg:`اليوم ${cs.day} — التقليب مطلوب ثلاث مرات` });

  // Countdown alerts
  if (cs.daysLeft === 1 && cs.phase === "incubation")
    a.push({ level:"warning", msg:"الإغلاق غداً — جهّز الماكينة وارفع الرطوبة" });
  if (cs.daysLeft === 0 && cs.hoursLeft > 0 && cs.phase === "hatching")
    a.push({ level:"info",    msg:`الفقس خلال ${cs.hoursLeft} ساعة` });

  return a;
}

// ─── Countdown display (تحديث كل ثانية) ─────────────────────────────────────

function Countdown({ secsLeft, phase, textClass }: { secsLeft:number; phase:Phase; textClass:string }) {
  const [secs, setSecs] = useState(secsLeft);
  useEffect(() => { setSecs(secsLeft); }, [secsLeft]);
  useEffect(() => {
    if (phase === "completed" || phase === "failed") return;
    const id = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1_000);
    return () => clearInterval(id);
  }, [phase]);

  if (phase === "completed") return <span className={`font-mono text-3xl font-black opacity-30 ${textClass}`}>—</span>;
  if (phase === "failed")    return <span className="font-mono text-3xl font-black text-red-500 opacity-40">✕</span>;
  if (secs === 0 && phase !== "hatching")
    return <span className={`font-mono text-2xl font-black ${textClass} animate-pulse`}>الآن!</span>;

  const d = Math.floor(secs / 86_400);
  const h = Math.floor((secs % 86_400) / 3_600);
  const m = Math.floor((secs % 3_600) / 60);
  const s = secs % 60;

  return (
    <div className={`flex items-end gap-1 font-mono font-black leading-none ${textClass}`}>
      {d > 0 && <><span className="text-3xl">{d}</span><span className="text-xs opacity-50 mb-1">ي</span></>}
      <span className="text-3xl">{String(h).padStart(2,"0")}</span><span className="text-xs opacity-50 mb-1">س</span>
      <span className="text-3xl">{String(m).padStart(2,"0")}</span><span className="text-xs opacity-50 mb-1">د</span>
      <span className="text-2xl opacity-50">{String(s).padStart(2,"0")}</span>
    </div>
  );
}

// ─── Day Progress Bar ─────────────────────────────────────────────────────────

function DayBar({ day }: { day:number }) {
  const clamped = Math.max(0, Math.min(21, day));
  return (
    <div>
      <div className="flex gap-0.5 h-3">
        {Array.from({ length:21 }, (_,i) => {
          const d = i + 1;
          const filled = clamped >= d;
          const color = d <= 17 ? "bg-blue-500" : d === 18 ? "bg-amber-500" : "bg-emerald-500";
          const today = d === clamped;
          return (
            <div key={d} className={`flex-1 rounded-sm transition-all duration-300
              ${filled ? color : "bg-white/5"}
              ${today ? "scale-y-[2] shadow-sm" : ""}
            `} />
          );
        })}
      </div>
      <div className="flex justify-between mt-1 text-[9px] font-mono text-white/20">
        <span>1</span>
        <span className="text-white/40 font-semibold">يوم {clamped}</span>
        <span>21</span>
      </div>
    </div>
  );
}

// ─── Hatch Log (سجل الفتحات) ─────────────────────────────────────────────────

function HatchLog({ cycleId, eggsSet }: { cycleId:number; eggsSet:number }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [count, setCount] = useState("");
  const [ts, setTs] = useState(() => new Date().toISOString().slice(0,16));
  const [note, setNote] = useState("");

  const { data: openings = [] } = useQuery<Opening[]>({
    queryKey: ["openings", cycleId],
    queryFn: () => apiFetch(`/hatching-cycles/${cycleId}/openings`),
    enabled: open,
  });

  const add = useMutation({
    mutationFn: (d:object) => apiFetch(`/hatching-cycles/${cycleId}/openings`, {
      method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(d),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey:["openings",cycleId] });
      setCount(""); setNote(""); setShowAdd(false);
    },
  });

  const del = useMutation({
    mutationFn: (id:number) => apiFetch(`/hatch-openings/${id}`, { method:"DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey:["openings",cycleId] }),
  });

  const totalChicks = openings.reduce((s,o) => s + o.chicksCount, 0);
  const rate = eggsSet > 0 ? ((totalChicks / eggsSet) * 100).toFixed(1) : "0";

  const fmtDt = (iso:string) => new Date(iso).toLocaleString("ar-IQ",{
    month:"short", day:"numeric", hour:"2-digit", minute:"2-digit",
  });

  return (
    <div className="border-t border-white/5 mt-3">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-white/50 hover:text-white/80 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Bird className="w-3.5 h-3.5" />
          سجل الفقس
          {totalChicks > 0 && (
            <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-1.5 rounded font-bold">
              {totalChicks.toLocaleString("ar-IQ")} صوص
            </span>
          )}
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {/* Totals */}
          {openings.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label:"إجمالي الصيصان", val:totalChicks.toLocaleString("ar-IQ"), color:"text-emerald-400" },
                { label:"نسبة الفقس",    val:`${rate}%`,                           color:"text-blue-400"   },
                { label:"عدد الفتحات",   val:String(openings.length),              color:"text-amber-400"  },
              ].map(s => (
                <div key={s.label} className="rounded-lg bg-white/5 border border-white/8 p-2 text-center">
                  <div className={`text-lg font-black font-mono ${s.color}`}>{s.val}</div>
                  <div className="text-[9px] text-white/30 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* List */}
          {openings.map((o,i) => (
            <div key={o.id} className="flex items-center justify-between rounded-lg bg-white/4 border border-white/6 px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-white/20">#{i+1}</span>
                <span className="font-bold text-emerald-400">{o.chicksCount.toLocaleString("ar-IQ")}</span>
                <span className="text-white/40 text-xs">{fmtDt(o.openedAt)}</span>
              </div>
              <div className="flex items-center gap-2">
                {o.notes && <span className="text-[10px] text-white/40 max-w-[100px] truncate">{o.notes}</span>}
                <button onClick={() => del.mutate(o.id)} className="text-white/15 hover:text-red-400 p-0.5 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          {/* Add form */}
          {showAdd ? (
            <div className="rounded-lg bg-white/5 border border-white/10 p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] text-white/40 mb-1">عدد الصيصان</div>
                  <Input type="number" min="0" value={count} onChange={e=>setCount(e.target.value)}
                    placeholder="0" className="h-8 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/20" />
                </div>
                <div>
                  <div className="text-[10px] text-white/40 mb-1">الوقت</div>
                  <Input type="datetime-local" value={ts} onChange={e=>setTs(e.target.value)}
                    className="h-8 text-sm bg-white/5 border-white/10 text-white" />
                </div>
              </div>
              <Input value={note} onChange={e=>setNote(e.target.value)}
                placeholder="ملاحظات (اختياري)" className="h-8 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/20" />
              <div className="flex gap-2">
                <Button size="sm" className="flex-1 h-8 text-xs bg-emerald-600 hover:bg-emerald-500 border-0"
                  onClick={() => add.mutate({ chicksCount:parseInt(count)||0, openedAt:new Date(ts).toISOString(), notes:note||null })}
                  disabled={add.isPending || !count}>
                  {add.isPending ? "…" : "تسجيل"}
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-xs text-white/50 hover:text-white/80"
                  onClick={() => setShowAdd(false)}>إلغاء</Button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAdd(true)}
              className="w-full h-8 rounded-lg border border-dashed border-white/10 text-[11px] text-white/30 hover:text-white/60 hover:border-white/20 transition-all flex items-center justify-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> تسجيل فتحة جديدة
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Machine Card — البطاقة الرئيسية لكل ماكينة ──────────────────────────────

function MachineCard({ inc, cycle, nowMs }: { inc:Incubator; cycle:Cycle; nowMs:number }) {
  const cs = useMemo(() => getCycleState(cycle, nowMs), [cycle, nowMs]);
  const ph = PHASE[cs.phase];

  // Temp / Hum with lockdown override
  const isHatch   = cs.phase === "lockdown" || cs.phase === "hatching";
  const tempShow  = isHatch ? (cycle.lockdownTemperature ?? cycle.temperature) : cycle.temperature;
  const humShow   = isHatch ? (cycle.lockdownHumidity    ?? cycle.humidity)    : cycle.humidity;
  const tempDiff  = tempShow != null ? Math.abs(tempShow - cs.idealTemp) : null;
  const humDiff   = humShow  != null ? Math.abs(humShow  - cs.idealHum)  : null;

  const alerts = useMemo(() => getAlerts(cycle, cs, []), [cycle, cs]);
  const criticals = alerts.filter(a => a.level === "critical");
  const warnings  = alerts.filter(a => a.level === "warning");
  const okItems   = alerts.filter(a => a.level === "ok");

  const fmtDate = (d:string) => new Date(d+"T12:00:00").toLocaleDateString("ar-IQ",{
    day:"numeric", month:"long", year:"numeric",
  });

  const occupancyPct = inc.capacity > 0 ? Math.min(100, Math.round((cycle.eggsSet / inc.capacity)*100)) : 0;

  return (
    <div
      className={`relative rounded-2xl overflow-hidden ring-1 ${ph.ring}
        bg-gradient-to-b from-[#0d1117] to-[#0a0e14]
        shadow-xl ${ph.glow}`}
    >
      {/* Phase accent line */}
      <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: ph.accent }} />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-2">
          {/* Machine name + batch */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-semibold uppercase tracking-widest ${ph.text}`}>
                {inc.name}
              </span>
              {inc.model && (
                <span className="text-[10px] text-white/20 font-mono">{inc.model}</span>
              )}
            </div>
            <h2 className="text-white font-black text-xl leading-tight">{cycle.batchName}</h2>
            <p className="text-white/30 text-xs mt-1">
              بدأت {fmtDate(cycle.startDate)}
              {cycle.setTime && <> · الساعة {cycle.setTime}</>}
            </p>
          </div>

          {/* Phase badge */}
          <div className="shrink-0 text-center">
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold
              border ${ph.text}`}
              style={{ borderColor: ph.accent + "33", backgroundColor: ph.accent + "11" }}>
              {cs.phase === "hatching" && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
              {cs.phaseAr}
            </div>
          </div>
        </div>

        {/* Day bar */}
        <div className="mt-4">
          <DayBar day={cs.day} />
        </div>
      </div>

      {/* ── Big Numbers Row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 border-y border-white/[0.06]">
        {/* Day */}
        <div className="px-4 py-4 text-center border-e border-white/[0.06]">
          <div className="text-[10px] uppercase tracking-widest text-white/25 mb-2">اليوم</div>
          <div className={`text-5xl font-black font-mono leading-none ${ph.text}`}>
            {cs.day}
          </div>
          <div className="text-[10px] text-white/20 mt-2">من 21</div>
        </div>

        {/* Countdown */}
        <div className="px-3 py-4 text-center border-e border-white/[0.06]">
          <div className="text-[10px] uppercase tracking-widest text-white/25 mb-2">
            {cs.phase === "hatching" ? "الفقس جارٍ" : "للموعد"}
          </div>
          <div className="flex justify-center">
            <Countdown secsLeft={cs.secsLeft} phase={cs.phase} textClass={ph.text} />
          </div>
          <div className="text-[10px] text-white/20 mt-2">
            {fmtDate(cycle.expectedHatchDate)}
          </div>
        </div>

        {/* Eggs + occupancy */}
        <div className="px-4 py-4 text-center">
          <div className="text-[10px] uppercase tracking-widest text-white/25 mb-2">بيض</div>
          <div className="text-5xl font-black font-mono leading-none text-white">
            {cycle.eggsSet >= 1000
              ? <>{(cycle.eggsSet/1000).toFixed(1)}<span className="text-2xl opacity-50">K</span></>
              : cycle.eggsSet}
          </div>
          <div className="text-[10px] text-white/20 mt-2">
            {occupancyPct}% من طاقة {inc.capacity.toLocaleString("ar-IQ")}
          </div>
        </div>
      </div>

      {/* ── Sensors ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 border-b border-white/[0.06]">
        {/* Temperature */}
        <div className="px-4 py-3 border-e border-white/[0.06]">
          <div className="flex items-center gap-2 mb-1">
            <Thermometer className={`w-3.5 h-3.5 ${
              tempDiff === null ? "text-white/15"
              : tempDiff > 1 ? "text-red-400"
              : tempDiff > 0.4 ? "text-amber-400"
              : "text-emerald-400"
            }`} />
            <span className="text-[10px] text-white/30 uppercase tracking-wide">حرارة</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-black font-mono ${
              tempDiff === null ? "text-white/20"
              : tempDiff > 1 ? "text-red-400"
              : tempDiff > 0.4 ? "text-amber-300"
              : "text-white"
            }`}>{tempShow != null ? `${tempShow}°` : "—"}</span>
            <span className="text-[10px] text-white/20">مثالي {cs.idealTemp}°C</span>
          </div>
        </div>

        {/* Humidity */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <Droplets className={`w-3.5 h-3.5 ${
              humDiff === null ? "text-white/15"
              : humDiff > 10 ? "text-red-400"
              : humDiff > 5 ? "text-amber-400"
              : "text-emerald-400"
            }`} />
            <span className="text-[10px] text-white/30 uppercase tracking-wide">رطوبة</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-black font-mono ${
              humDiff === null ? "text-white/20"
              : humDiff > 10 ? "text-red-400"
              : humDiff > 5 ? "text-amber-300"
              : "text-white"
            }`}>{humShow != null ? `${humShow}%` : "—"}</span>
            <span className="text-[10px] text-white/20">مثالي {cs.idealHum}%</span>
          </div>
        </div>
      </div>

      {/* ── Embryo + Turning row ────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Activity className="w-3.5 h-3.5 text-white/20 shrink-0" />
          <span className="text-xs text-white/40 truncate">{cs.embryo}</span>
        </div>
        <div className={`shrink-0 text-[10px] font-semibold flex items-center gap-1 ${
          cs.turningNeeded ? "text-amber-400" : "text-white/20"
        }`}>
          <RefreshCw className={`w-3 h-3 ${cs.turningNeeded ? "animate-spin" : ""}`} style={{ animationDuration:"3s" }} />
          {cs.turningNeeded ? "تقليب مطلوب" : "بدون تقليب"}
        </div>
      </div>

      {/* ── Alerts ─────────────────────────────────────────────────────── */}
      {(criticals.length > 0 || warnings.length > 0) && (
        <div className="px-4 py-3 border-b border-white/[0.06] space-y-1.5">
          {criticals.map((a,i) => (
            <div key={i} className="flex items-start gap-2 text-xs bg-red-500/8 border border-red-500/15 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
              <span className="text-red-300">{a.msg}</span>
            </div>
          ))}
          {warnings.map((a,i) => (
            <div key={i} className="flex items-start gap-2 text-xs bg-amber-500/8 border border-amber-500/15 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span className="text-amber-300">{a.msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* OK status — show only one line */}
      {criticals.length === 0 && warnings.length === 0 && okItems.length > 0 && (
        <div className="px-4 py-2 border-b border-white/[0.06] flex items-center gap-2 text-xs text-emerald-500/60">
          <CheckCircle2 className="w-3.5 h-3.5" />
          جميع المؤشرات طبيعية
        </div>
      )}

      {/* ── Notes ─────────────────────────────────────────────────────── */}
      {cycle.notes && (
        <div className="px-4 py-2.5 border-b border-white/[0.06]">
          <p className="text-[11px] text-white/30 leading-relaxed line-clamp-2">{cycle.notes}</p>
        </div>
      )}

      {/* ── Hatch Log ─────────────────────────────────────────────────── */}
      <HatchLog cycleId={cycle.id} eggsSet={cycle.eggsSet} />
    </div>
  );
}

// ─── Idle Machine Card ────────────────────────────────────────────────────────

function IdleCard({ inc }: { inc:Incubator }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#0d1117]/80 p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-white/5 border border-white/8 flex items-center justify-center shrink-0">
        <Egg className="w-4 h-4 text-white/20" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-bold text-white/40">{inc.name}</div>
        <div className="text-[11px] text-white/20">
          {inc.model && `${inc.model} · `}
          طاقة {inc.capacity.toLocaleString("ar-IQ")} بيضة
        </div>
      </div>
      <div className="ms-auto shrink-0 text-[10px] text-white/20 font-medium bg-white/4 rounded px-2 py-1">
        خالية
      </div>
    </div>
  );
}

// ─── History Strip ────────────────────────────────────────────────────────────

function HistoryStrip({ cycles }: { cycles:Cycle[] }) {
  const done = cycles
    .filter(c => c.status === "completed" && c.eggsHatched != null)
    .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0,5);

  if (done.length === 0) return null;

  return (
    <div className="border-t border-white/[0.06] px-5 py-4">
      <div className="text-[10px] text-white/25 uppercase tracking-widest mb-3">آخر الدورات المكتملة</div>
      <div className="space-y-2">
        {done.map(c => {
          const rate = Math.round((c.eggsHatched! / c.eggsSet) * 100);
          const color = rate >= 70 ? "text-emerald-400" : rate >= 50 ? "text-amber-400" : "text-red-400";
          return (
            <div key={c.id} className="flex items-center gap-3 text-xs">
              <span className={`w-8 font-black font-mono ${color}`}>{rate}%</span>
              <div className="flex-1 bg-white/5 rounded-full h-1.5 overflow-hidden">
                <div className={`h-full rounded-full ${rate >= 70 ? "bg-emerald-500" : rate >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                  style={{ width:`${rate}%` }} />
              </div>
              <span className="text-white/30 truncate max-w-[120px]">{c.batchName}</span>
              <span className="text-white/15 shrink-0">
                {c.eggsHatched?.toLocaleString("ar-IQ")} / {c.eggsSet.toLocaleString("ar-IQ")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Export ══════════════════════════════════════════════════════════════

export default function IncubationCenter() {
  const { lang } = useLanguage();
  const base = import.meta.env.BASE_URL ?? "/";

  // ── Live clock (every second for countdown) ────────────────────────────────
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  // ── SSE for live cycle updates ─────────────────────────────────────────────
  const sseErrRef = useRef(0);
  const clockOffRef = useRef(0);
  const [liveCycles, setLiveCycles] = useState<Map<number, Cycle>>(new Map()); // keyed by cycle.id
  const [connMode, setConnMode] = useState<"connecting"|"sse"|"poll">("connecting");

  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const applySSE = (serverTime: number, cycles: Cycle[]) => {
      if (cancelled) return;
      clockOffRef.current = serverTime - Date.now();
      setLiveCycles(new Map(cycles.map(c => [c.id, c])));
    };

    const poll = async () => {
      try {
        const d: Cycle[] = await apiFetch("/dashboard/active-cycles");
        if (!cancelled) setLiveCycles(new Map(d.map(c => [c.id, c])));
      } catch {}
    };

    const startPoll = () => {
      if (cancelled) return;
      setConnMode("poll");
      poll();
      pollTimer = setInterval(poll, 30_000);
    };

    const connect = () => {
      if (cancelled) return;
      try {
        es = new EventSource(`${base}api/hatching/live-stream`, { withCredentials: true });
        es.onopen  = () => { if (!cancelled) { sseErrRef.current = 0; setConnMode("sse"); } };
        es.onmessage = ev => {
          try {
            const p = JSON.parse(ev.data) as { serverTime:number; cycles:Cycle[] };
            applySSE(p.serverTime, p.cycles);
            if (!cancelled) setConnMode("sse");
          } catch {}
        };
        es.onerror = () => {
          es?.close(); es = null;
          sseErrRef.current++;
          if (sseErrRef.current >= 3) startPoll();
          else if (!cancelled) setTimeout(connect, 5_000);
        };
      } catch { startPoll(); }
    };

    connect();
    return () => { cancelled = true; es?.close(); if (pollTimer) clearInterval(pollTimer); };
  }, [base]);

  // ── Static queries ─────────────────────────────────────────────────────────
  const { data: incubators = [], isLoading: incLoad } = useQuery<Incubator[]>({
    queryKey: ["incubators"],
    queryFn: () => apiFetch("/incubators"),
    refetchInterval: 60_000,
  });

  const { data: allCycles = [] } = useQuery<Cycle[]>({
    queryKey: ["all-cycles"],
    queryFn: () => apiFetch("/hatching-cycles"),
    refetchInterval: 120_000,
  });

  // ── Merge: for each incubator, use SSE data if available, else activeCycle ──
  const machinesWithCycle = useMemo(() => {
    return incubators.map(inc => {
      // Find the live cycle for this incubator
      let cycle: Cycle | null = null;
      // Try SSE data first
      for (const [, c] of liveCycles) {
        if (c.incubatorId === inc.id) { cycle = c; break; }
      }
      // Fall back to activeCycle from incubators endpoint
      if (!cycle && inc.activeCycle) cycle = inc.activeCycle;
      return { inc, cycle };
    });
  }, [incubators, liveCycles]);

  const active = machinesWithCycle.filter(m => m.cycle && (m.cycle.status === "incubating" || m.cycle.status === "hatching"));
  const idle   = machinesWithCycle.filter(m => !m.cycle || (m.cycle.status !== "incubating" && m.cycle.status !== "hatching"));

  // ── Summary stats ──────────────────────────────────────────────────────────
  const totalEggs = active.reduce((s, m) => s + (m.cycle?.eggsSet ?? 0), 0);
  const completed = allCycles.filter(c => c.status === "completed" && c.eggsHatched != null);
  const histRate  = completed.length > 0
    ? Math.round(completed.reduce((s,c) => s + (c.eggsHatched!/c.eggsSet), 0) / completed.length * 100)
    : 0;
  const nextCycle = active.length > 0
    ? active.reduce((p,m) => {
        const pd = new Date((m.cycle!.expectedHatchDate)+"T12:00:00").getTime();
        const pp = new Date((p.cycle!.expectedHatchDate)+"T12:00:00").getTime();
        return pd < pp ? m : p;
      })
    : null;

  // ── Loading ────────────────────────────────────────────────────────────────
  if (incLoad) {
    return (
      <div className="rounded-2xl bg-[#0d1117] border border-white/8 overflow-hidden animate-pulse">
        <div className="h-14 bg-white/3 flex items-center px-5 gap-3">
          <div className="w-2 h-2 rounded-full bg-blue-500 opacity-40" />
          <div className="h-3 w-48 bg-white/5 rounded" />
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-72 rounded-xl bg-white/3" />
          <div className="h-72 rounded-xl bg-white/3" />
        </div>
      </div>
    );
  }

  // ── Empty (no incubators at all) ───────────────────────────────────────────
  if (incubators.length === 0) {
    return (
      <div className="rounded-2xl bg-[#0d1117] border border-white/8 py-12 text-center">
        <Egg className="w-10 h-10 text-white/10 mx-auto mb-3" />
        <p className="text-white/30 text-sm">لا توجد فقاسات مسجلة</p>
        <p className="text-white/15 text-xs mt-1">أضف فقاسة من صفحة الفقاسات</p>
      </div>
    );
  }

  // ── Full render ────────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl bg-[#0d1117] border border-white/8 overflow-hidden shadow-2xl">

      {/* ══ TOP BAR ════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06] bg-[#0a0d12]">
        <div className="flex items-center gap-3">
          {/* Live indicator */}
          <div className="relative w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Egg className="w-4 h-4 text-blue-400" />
            {connMode === "sse" && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border-2 border-[#0a0d12] animate-pulse" />
            )}
          </div>
          <div>
            <div className="text-sm font-bold text-white tracking-wide">مركز التفقيس</div>
            <div className="flex items-center gap-2 text-[10px] mt-0.5">
              {connMode === "sse"  && <><Wifi className="w-3 h-3 text-emerald-400" /><span className="text-emerald-500">مباشر</span></>}
              {connMode === "poll" && <><RefreshCw className="w-3 h-3 text-amber-400" /><span className="text-amber-500">تحديث دوري</span></>}
              {connMode === "connecting" && <><WifiOff className="w-3 h-3 text-white/20 animate-pulse" /><span className="text-white/20">جاري الاتصال…</span></>}
            </div>
          </div>
        </div>

        {/* Summary pills */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {active.length > 0 && (
            <div className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full px-2.5 py-1 text-[11px] font-semibold text-blue-400">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              {active.length} {active.length === 1 ? "ماكينة نشطة" : "ماكينات نشطة"}
            </div>
          )}
          {totalEggs > 0 && (
            <div className="text-[11px] text-white/30 bg-white/5 rounded-full px-2.5 py-1">
              {totalEggs.toLocaleString("ar-IQ")} بيضة
            </div>
          )}
          {histRate > 0 && (
            <div className={`text-[11px] font-semibold rounded-full px-2.5 py-1 ${
              histRate >= 65 ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                             : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
            }`}>
              {histRate}% تاريخي
            </div>
          )}
        </div>
      </div>

      {/* ══ MACHINE CARDS ══════════════════════════════════════════════════════ */}
      <div className="p-4">
        {active.length > 0 ? (
          <div className={`grid gap-4 ${active.length === 1 ? "grid-cols-1 max-w-2xl mx-auto" : "grid-cols-1 lg:grid-cols-2"}`}>
            {active.map(({ inc, cycle }) => (
              <MachineCard key={inc.id} inc={inc} cycle={cycle!} nowMs={nowMs} />
            ))}
          </div>
        ) : (
          /* No active cycles */
          <div className="rounded-xl border border-dashed border-white/8 py-10 text-center">
            <Egg className="w-8 h-8 text-white/10 mx-auto mb-3" />
            <p className="text-white/30 text-sm font-medium">لا توجد دورة تفقيس نشطة الآن</p>
            <p className="text-white/15 text-xs mt-1">أضف دورة جديدة من صفحة التفقيس</p>
          </div>
        )}

        {/* Idle machines */}
        {idle.length > 0 && (
          <div className="mt-4">
            <div className="text-[10px] text-white/20 uppercase tracking-widest mb-2 px-1">ماكينات خالية</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {idle.map(({ inc }) => <IdleCard key={inc.id} inc={inc} />)}
            </div>
          </div>
        )}
      </div>

      {/* ══ HISTORY STRIP ══════════════════════════════════════════════════════ */}
      <HistoryStrip cycles={allCycles} />

    </div>
  );
}
