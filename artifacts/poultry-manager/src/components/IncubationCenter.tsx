/**
 * IncubationCenter — مركز التفقيس
 * ════════════════════════════════════════════════════════════════
 * • كل ماكينة تُعرض دائماً — نشطة أو بآخر دورة لها
 * • التواريخ والأوقات ظاهرة بوضوح
 * • زر تسجيل الصيصان مرئي مباشرة
 * • بيانات حقيقية 100% من API
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Thermometer, Droplets, Egg, Bird, Calendar, Clock,
  AlertTriangle, CheckCircle2, Wifi, WifiOff, RefreshCw,
  Plus, Trash2, Activity, AlertCircle, RotateCcw,
  ChevronDown, ChevronUp, History,
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

// ─── Phase computation ────────────────────────────────────────────────────────

type Phase = "incubation" | "lockdown" | "hatching" | "overdue" | "completed" | "failed";

interface CS {
  phase: Phase; day: number; pct: number;
  daysLeft: number; hoursLeft: number; secsLeft: number;
  idealTemp: number; idealHum: number;
  turningNeeded: boolean; embryo: string; phaseAr: string;
}

const EMBRYO: Record<number, string> = {
  1:"بداية الجهاز العصبي", 2:"ظهور الأوعية الدموية",
  3:"القلب يبدأ النبض", 4:"تكوّن الرأس والأطراف",
  5:"الجهاز الهضمي والكبد", 6:"ظهور المنقار والجناحين",
  7:"تكامل العينين", 8:"نمو الأجنحة والأرجل",
  9:"بصيلات الريش الأولى", 10:"تصلّب العظام",
  11:"الكلى والرئتان تعملان", 12:"غطاء ريشي كامل",
  13:"تخزين الدهون للفقس", 14:"تكامل الجهاز العضلي",
  15:"النمو شبه مكتمل", 16:"الجهاز المناعي ينضج",
  17:"آخر يوم للتقليب", 18:"الانتقال للفقس",
  19:"ثقب الغرفة الهوائية", 20:"المنقار يكسر القشرة",
  21:"الصوص يخرج",
};

function getCS(cycle: Cycle, nowMs: number): CS {
  const startMs  = new Date(cycle.startDate + "T12:00:00").getTime();
  const hatchMs  = new Date(cycle.expectedHatchDate + "T12:00:00").getTime();
  const elapsed  = nowMs - startMs;
  const remain   = Math.max(0, hatchMs - nowMs);

  const day      = Math.max(1, Math.floor(elapsed / 86_400_000) + 1);
  const pct      = Math.min(100, Math.round((elapsed / (hatchMs - startMs)) * 100));
  const daysLeft  = Math.floor(remain / 86_400_000);
  const hoursLeft = Math.floor((remain % 86_400_000) / 3_600_000);
  const secsLeft  = Math.floor(remain / 1_000);

  let phase: Phase;
  if      (cycle.status === "completed") phase = "completed";
  else if (cycle.status === "failed")    phase = "failed";
  else if (remain === 0 && day > 21)     phase = "overdue";
  else if (day >= 19)                    phase = "hatching";
  else if (day >= 18)                    phase = "lockdown";
  else                                   phase = "incubation";

  const lkd      = phase === "lockdown" || phase === "hatching";
  const idealTemp = lkd ? 37.2 : 37.7;
  const idealHum  = lkd ? 70   : 55;
  const turningNeeded = phase === "incubation" && day <= 17;

  const phaseMap: Record<Phase, string> = {
    incubation:"حضانة", lockdown:"إغلاق",
    hatching:"فقس نشط", overdue:"تأخّرت",
    completed:"مكتملة", failed:"فاشلة",
  };

  return {
    phase, day, pct, daysLeft, hoursLeft, secsLeft,
    idealTemp, idealHum, turningNeeded,
    embryo: EMBRYO[Math.min(day, 21)] ?? "اكتمل التطور",
    phaseAr: phaseMap[phase],
  };
}

// ─── Phase colors ─────────────────────────────────────────────────────────────

const PC: Record<Phase, { accent: string; dimText: string; ring: string; bar: string }> = {
  incubation:{ accent:"#3b82f6", dimText:"text-blue-400",   ring:"ring-blue-500/25",    bar:"bg-blue-500"   },
  lockdown:  { accent:"#f59e0b", dimText:"text-amber-400",  ring:"ring-amber-500/25",   bar:"bg-amber-500"  },
  hatching:  { accent:"#10b981", dimText:"text-emerald-400",ring:"ring-emerald-500/30", bar:"bg-emerald-500"},
  overdue:   { accent:"#ef4444", dimText:"text-red-400",    ring:"ring-red-500/35",     bar:"bg-red-500"    },
  completed: { accent:"#475569", dimText:"text-slate-400",  ring:"ring-slate-600/20",   bar:"bg-slate-600"  },
  failed:    { accent:"#7f1d1d", dimText:"text-red-600",    ring:"ring-red-900/30",     bar:"bg-red-900"    },
};

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtDateFull(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("ar-IQ", {
    weekday:"short", day:"numeric", month:"long", year:"numeric",
  });
}
function fmtDateShort(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("ar-IQ", {
    day:"numeric", month:"long",
  });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("ar-IQ", {
    day:"numeric", month:"short", hour:"2-digit", minute:"2-digit",
  });
}

// ─── Countdown ────────────────────────────────────────────────────────────────

function Countdown({ secsLeft, phase, cls }: { secsLeft:number; phase:Phase; cls:string }) {
  const [s, setS] = useState(secsLeft);
  useEffect(() => { setS(secsLeft); }, [secsLeft]);
  useEffect(() => {
    if (phase === "completed" || phase === "failed") return;
    const id = setInterval(() => setS(v => Math.max(0, v - 1)), 1_000);
    return () => clearInterval(id);
  }, [phase]);

  if (phase === "completed") return <span className="font-mono text-4xl font-black text-white/15">—</span>;
  if (phase === "failed")    return <span className="font-mono text-4xl font-black text-red-700/40">✕</span>;
  if (s <= 0) return <span className={`font-mono text-3xl font-black ${cls} animate-pulse`}>الآن!</span>;

  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  const sec = s % 60;

  return (
    <div className={`flex items-end gap-0.5 font-mono font-black leading-none ${cls}`}>
      {d > 0 && <><span className="text-4xl">{d}</span><span className="text-xs opacity-40 mb-1 ms-0.5">ي</span></>}
      <span className="text-4xl">{String(h).padStart(2,"0")}</span>
      <span className="text-xs opacity-40 mb-1">س</span>
      <span className="text-4xl">{String(m).padStart(2,"0")}</span>
      <span className="text-xs opacity-40 mb-1">د</span>
      <span className="text-2xl opacity-35 ms-0.5">{String(sec).padStart(2,"0")}</span>
    </div>
  );
}

// ─── Day progress bar ─────────────────────────────────────────────────────────

function DayBar({ day, phase }: { day:number; phase:Phase }) {
  const d = Math.max(0, Math.min(21, day));
  return (
    <div className="space-y-1">
      <div className="flex gap-[2px] h-2.5 items-end">
        {Array.from({ length:21 }, (_,i) => {
          const n = i + 1;
          const filled = d >= n;
          const isToday = n === d;
          const segColor = n <= 17 ? "bg-blue-500" : n === 18 ? "bg-amber-500" : "bg-emerald-500";
          return (
            <div key={n} className={`flex-1 rounded-[2px] transition-all
              ${filled ? segColor : "bg-white/[0.06]"}
              ${isToday ? "h-full" : "h-[60%]"}
            `} />
          );
        })}
      </div>
      <div className="flex justify-between text-[9px] font-mono">
        <span className="text-white/20">1</span>
        <span className="text-white/20">حضانة</span>
        <span className="text-amber-500/50">18</span>
        <span className="text-white/20">فقس</span>
        <span className="text-white/20">21</span>
      </div>
    </div>
  );
}

// ─── Sensor widget ────────────────────────────────────────────────────────────

function Sensor({
  icon: Icon, label, value, ideal, unit,
}: {
  icon: React.ElementType; label: string;
  value: number | null; ideal: number; unit: string;
}) {
  const diff = value != null ? Math.abs(value - ideal) : null;
  const ok   = diff != null && diff <= (unit === "°C" ? 0.4 : 4);
  const warn = diff != null && !ok && diff <= (unit === "°C" ? 1.2 : 10);
  const crit = diff != null && !ok && !warn;

  const valueColor = value == null ? "text-white/20"
    : crit ? "text-red-400" : warn ? "text-amber-300" : "text-white";
  const iconColor  = value == null ? "text-white/15"
    : crit ? "text-red-400" : warn ? "text-amber-400" : "text-emerald-400";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
        <span className="text-[10px] text-white/30 uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-3xl font-black font-mono leading-none ${valueColor}`}>
          {value != null ? value : "—"}
        </span>
        <span className="text-sm text-white/30">{unit}</span>
      </div>
      <div className="flex items-center gap-1 text-[10px]">
        <span className="text-white/20">مثالي {ideal}{unit}</span>
        {diff != null && diff > 0.1 && (
          <span className={crit?"text-red-400":warn?"text-amber-400":"text-emerald-400/60"}>
            ({diff > 0 ? "+" : ""}{(value! - ideal).toFixed(1)})
          </span>
        )}
        {diff != null && diff <= 0.1 && (
          <span className="text-emerald-500/60">✓</span>
        )}
      </div>
    </div>
  );
}

// ─── Hatch Log — سجل الفتحات ─────────────────────────────────────────────────
// Always shows the "add" button prominently; list collapses if too long.

function HatchLog({
  cycleId, eggsSet, phase,
}: {
  cycleId: number; eggsSet: number; phase: Phase;
}) {
  const qc = useQueryClient();
  const [showList, setShowList] = useState(false);
  const [count, setCount] = useState("");
  const [ts, setTs] = useState(() => new Date().toISOString().slice(0,16));
  const [note, setNote] = useState("");
  const [showForm, setShowForm] = useState(false);

  const { data: openings = [], isLoading } = useQuery<Opening[]>({
    queryKey: ["openings", cycleId],
    queryFn: () => apiFetch(`/hatching-cycles/${cycleId}/openings`),
    refetchInterval: 30_000,
  });

  const add = useMutation({
    mutationFn: (d:object) => apiFetch(`/hatching-cycles/${cycleId}/openings`, {
      method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(d),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey:["openings", cycleId] });
      setCount(""); setNote(""); setShowForm(false);
    },
  });

  const del = useMutation({
    mutationFn: (id:number) => apiFetch(`/hatch-openings/${id}`, { method:"DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey:["openings", cycleId] }),
  });

  const totalChicks = openings.reduce((s,o) => s + o.chicksCount, 0);
  const rate = eggsSet > 0 ? Math.round((totalChicks / eggsSet) * 100) : 0;

  const isActive = phase === "hatching" || phase === "overdue" || phase === "incubation" || phase === "lockdown";

  return (
    <div className="border-t border-white/[0.07] pt-3 space-y-3">

      {/* Header + totals */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bird className="w-3.5 h-3.5 text-white/30" />
          <span className="text-xs font-semibold text-white/50">سجل فتح الفقاسة</span>
          {openings.length > 0 && (
            <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 rounded px-1.5 font-bold">
              {totalChicks.toLocaleString("ar-IQ")} صوص · {rate}%
            </span>
          )}
        </div>
        {openings.length > 0 && (
          <button onClick={() => setShowList(v=>!v)}
            className="text-[10px] text-white/25 hover:text-white/50 flex items-center gap-1 transition-colors">
            {openings.length} فتحة
            {showList ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      {/* Openings list */}
      {showList && openings.length > 0 && (
        <div className="space-y-1.5 max-h-44 overflow-y-auto">
          {/* Summary tiles */}
          <div className="grid grid-cols-3 gap-1.5 mb-2">
            {[
              { l:"إجمالي الصيصان",v:totalChicks.toLocaleString("ar-IQ"),c:"text-emerald-400" },
              { l:"نسبة الفقس",    v:`${rate}%`,                          c:"text-blue-400"   },
              { l:"عدد الفتحات",   v:String(openings.length),             c:"text-amber-400"  },
            ].map(s => (
              <div key={s.l} className="rounded-lg bg-white/[0.04] border border-white/[0.07] p-2 text-center">
                <div className={`text-base font-black font-mono ${s.c}`}>{s.v}</div>
                <div className="text-[9px] text-white/25 mt-0.5">{s.l}</div>
              </div>
            ))}
          </div>

          {openings.map((o,i) => (
            <div key={o.id}
              className="flex items-center justify-between rounded-lg bg-white/[0.04] border border-white/[0.07] px-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-[10px] font-mono text-white/20 shrink-0">#{i+1}</span>
                <span className="font-bold text-emerald-400 shrink-0">
                  {o.chicksCount.toLocaleString("ar-IQ")} صوص
                </span>
                <span className="text-white/35 text-xs truncate">{fmtDateTime(o.openedAt)}</span>
                {o.notes && <span className="text-white/25 text-[10px] truncate">{o.notes}</span>}
              </div>
              <button onClick={() => del.mutate(o.id)}
                className="text-white/15 hover:text-red-400 transition-colors shrink-0 ms-2 p-0.5">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {showForm ? (
        <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 space-y-2.5">
          <div className="text-[11px] font-semibold text-white/50 mb-1">
            تسجيل فتحة جديدة — أدخل الصيصان التي خرجت
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-white/30 block mb-1">عدد الصيصان *</label>
              <Input
                type="number" min="0" value={count}
                onChange={e => setCount(e.target.value)}
                placeholder="0"
                className="h-9 text-base font-bold bg-white/[0.05] border-white/10 text-white placeholder:text-white/20"
                autoFocus
              />
            </div>
            <div>
              <label className="text-[10px] text-white/30 block mb-1">التاريخ والوقت</label>
              <Input
                type="datetime-local" value={ts}
                onChange={e => setTs(e.target.value)}
                className="h-9 text-sm bg-white/[0.05] border-white/10 text-white"
              />
            </div>
          </div>
          <Input
            value={note} onChange={e => setNote(e.target.value)}
            placeholder="ملاحظات (اختياري) — مثال: صيصان نشيطة وجافة"
            className="h-9 text-sm bg-white/[0.05] border-white/10 text-white placeholder:text-white/20"
          />
          <div className="flex gap-2 pt-0.5">
            <Button
              size="sm"
              className="flex-1 h-9 text-sm font-bold bg-emerald-600 hover:bg-emerald-500 border-0 text-white"
              onClick={() => add.mutate({
                chicksCount: parseInt(count) || 0,
                openedAt: new Date(ts).toISOString(),
                notes: note || null,
              })}
              disabled={add.isPending || !count || parseInt(count) < 1}
            >
              {add.isPending ? "جاري الحفظ…" : "✓  حفظ الفتحة"}
            </Button>
            <Button size="sm" variant="ghost"
              className="h-9 text-sm text-white/40 hover:text-white/70 hover:bg-white/5"
              onClick={() => setShowForm(false)}>
              إلغاء
            </Button>
          </div>
        </div>
      ) : (
        /* Prominent add button — always visible */
        <button
          onClick={() => { setShowForm(true); if (openings.length > 0) setShowList(true); }}
          className={`w-full h-10 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 transition-all
            ${isActive
              ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/8 hover:bg-emerald-500/15 hover:border-emerald-500/60"
              : "border-white/10 text-white/30 bg-white/[0.03] hover:bg-white/[0.06] hover:text-white/50"
            }`}
        >
          <Plus className="w-4 h-4" />
          {isActive ? "فتح الفقاسة وتسجيل الصيصان" : "إضافة صيصان"}
        </button>
      )}
    </div>
  );
}

// ─── Active machine card ──────────────────────────────────────────────────────

function ActiveCard({ inc, cycle, nowMs }: { inc:Incubator; cycle:Cycle; nowMs:number }) {
  const cs  = useMemo(() => getCS(cycle, nowMs), [cycle, nowMs]);
  const c   = PC[cs.phase];
  const lkd = cs.phase === "lockdown" || cs.phase === "hatching";

  const tempShow = lkd ? (cycle.lockdownTemperature ?? cycle.temperature) : cycle.temperature;
  const humShow  = lkd ? (cycle.lockdownHumidity    ?? cycle.humidity)    : cycle.humidity;

  // Alerts: only critical + warning (not "ok")
  const alerts = useMemo(() => {
    const a: { level:"critical"|"warning"; msg:string }[] = [];
    if (!cycle.temperature && !cycle.lockdownTemperature)
      a.push({ level:"warning", msg:"لم تُسجَّل درجة الحرارة" });
    else if (tempShow && Math.abs(tempShow - cs.idealTemp) > 1.2)
      a.push({ level:"critical", msg:`الحرارة ${tempShow}°C — المثالي ${cs.idealTemp}°C` });
    else if (tempShow && Math.abs(tempShow - cs.idealTemp) > 0.4)
      a.push({ level:"warning", msg:`الحرارة ${tempShow}°C قريبة من الحد الأعلى` });

    if (cs.phase === "lockdown")
      a.push({ level:"critical", msg:"يوم الإغلاق — أوقف التقليب وارفع الرطوبة إلى 70%" });
    if (cs.phase === "hatching")
      a.push({ level:"warning", msg:"فقس نشط — سجّل الصيصان عند كل فتحة للفقاسة" });
    if (cs.phase === "overdue")
      a.push({ level:"critical", msg:"تجاوزت موعد الفقس — راجع الوضع فوراً" });
    if (cs.daysLeft === 1 && cs.phase === "incubation")
      a.push({ level:"warning", msg:"الإغلاق غداً — جهّز الماكينة وارفع الرطوبة" });
    return a;
  }, [cycle, cs, tempShow]);

  const occupancyPct = inc.capacity > 0
    ? Math.min(100, Math.round((cycle.eggsSet / inc.capacity) * 100))
    : 0;

  return (
    <div
      className={`rounded-2xl ring-1 ${c.ring} overflow-hidden
        bg-gradient-to-b from-[#0e1219] to-[#0a0d13]`}
      style={{ boxShadow:`0 0 40px ${c.accent}0d` }}
    >
      {/* Top accent bar */}
      <div className="h-[2px]" style={{ background: c.accent }} />

      {/* ── Section 1: Machine + Batch + Phase ── */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* Machine name */}
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-[10px] font-bold uppercase tracking-[0.15em] ${c.dimText}`}>
                {inc.name}
              </span>
              {inc.model && <span className="text-[10px] text-white/20 font-mono">{inc.model}</span>}
              <span className="text-[10px] text-white/15">·</span>
              <span className="text-[10px] text-white/25">{inc.capacity.toLocaleString("ar-IQ")} بيضة</span>
            </div>
            {/* Batch name */}
            <h2 className="text-xl font-black text-white leading-tight">{cycle.batchName}</h2>
          </div>
          {/* Phase pill */}
          <div
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border"
            style={{ borderColor: c.accent + "40", background: c.accent + "12", color: c.accent }}
          >
            {cs.phase === "hatching" && (
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: c.accent }} />
            )}
            {cs.phaseAr}
          </div>
        </div>

        {/* Day bar */}
        <div className="mt-3">
          <DayBar day={cs.day} phase={cs.phase} />
        </div>
      </div>

      {/* ── Section 2: Dates & Times ── */}
      <div className="mx-5 mb-3 rounded-xl bg-white/[0.04] border border-white/[0.07] divide-y divide-white/[0.05]">
        <div className="grid grid-cols-2 divide-x divide-white/[0.05] rtl:divide-x-reverse">
          <div className="px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Calendar className="w-3 h-3 text-white/20" />
              <span className="text-[9px] text-white/30 uppercase tracking-wider">تاريخ البداية</span>
            </div>
            <div className="text-sm font-bold text-white/80">{fmtDateShort(cycle.startDate)}</div>
            {cycle.setTime && (
              <div className="flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3 text-white/20" />
                <span className="text-xs text-white/40 font-mono">{cycle.setTime}</span>
              </div>
            )}
          </div>
          <div className="px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Egg className="w-3 h-3 text-white/20" />
              <span className="text-[9px] text-white/30 uppercase tracking-wider">موعد الفقس</span>
            </div>
            <div className={`text-sm font-bold ${cs.phase === "overdue" ? "text-red-400" : "text-white/80"}`}>
              {fmtDateShort(cycle.expectedHatchDate)}
            </div>
            {cs.phase !== "completed" && cs.phase !== "failed" && cs.daysLeft >= 0 && (
              <div className={`text-xs font-semibold mt-0.5 ${
                cs.daysLeft <= 1 ? "text-amber-400" : c.dimText
              }`}>
                {cs.daysLeft === 0 ? `اليوم — ${cs.hoursLeft}س متبقية` :
                 cs.daysLeft === 1 ? "غداً!" :
                 `بعد ${cs.daysLeft} أيام`}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 3: Big 3 numbers ── */}
      <div className="grid grid-cols-3 border-y border-white/[0.06]">
        {/* Day */}
        <div className="px-3 py-4 text-center border-e border-white/[0.06]">
          <div className="text-[9px] uppercase tracking-widest text-white/20 mb-2">اليوم</div>
          <div className={`text-5xl font-black font-mono leading-none ${c.dimText}`}>{cs.day}</div>
          <div className="text-[9px] text-white/15 mt-1.5">من 21</div>
        </div>

        {/* Countdown */}
        <div className="px-2 py-4 text-center border-e border-white/[0.06]">
          <div className="text-[9px] uppercase tracking-widest text-white/20 mb-2">
            {cs.phase === "hatching" ? "يفقس الآن" : "للفقس"}
          </div>
          <div className="flex justify-center items-center">
            <Countdown secsLeft={cs.secsLeft} phase={cs.phase} cls={c.dimText} />
          </div>
        </div>

        {/* Eggs */}
        <div className="px-3 py-4 text-center">
          <div className="text-[9px] uppercase tracking-widest text-white/20 mb-2">بيض</div>
          <div className="text-5xl font-black font-mono leading-none text-white/80">
            {cycle.eggsSet >= 1000
              ? <>{(cycle.eggsSet/1000).toFixed(1)}<span className="text-2xl text-white/30">K</span></>
              : cycle.eggsSet}
          </div>
          <div className="text-[9px] text-white/15 mt-1.5">{occupancyPct}% من الطاقة</div>
        </div>
      </div>

      {/* ── Section 4: Sensors ── */}
      <div className="grid grid-cols-2 gap-px border-b border-white/[0.06] bg-white/[0.04]">
        <div className="bg-[#0e1219] px-5 py-3.5">
          <Sensor
            icon={Thermometer} label="الحرارة"
            value={tempShow} ideal={cs.idealTemp} unit="°C"
          />
        </div>
        <div className="bg-[#0e1219] px-5 py-3.5">
          <Sensor
            icon={Droplets} label="الرطوبة"
            value={humShow} ideal={cs.idealHum} unit="%"
          />
        </div>
      </div>

      {/* ── Section 5: Embryo + Turning ── */}
      <div className="px-5 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-white/15 shrink-0" />
          <span className="text-xs text-white/35">{cs.embryo}</span>
        </div>
        <div className={`flex items-center gap-1.5 text-[11px] font-semibold shrink-0
          ${cs.turningNeeded ? "text-amber-400" : "text-white/15"}`}>
          <RotateCcw className={`w-3.5 h-3.5 ${cs.turningNeeded ? "animate-spin" : ""}`}
            style={{ animationDuration:"3s" }} />
          {cs.turningNeeded ? "تقليب مطلوب" : "لا تقليب"}
        </div>
      </div>

      {/* ── Section 6: Alerts ── */}
      {alerts.length > 0 && (
        <div className="px-5 py-3 border-b border-white/[0.06] space-y-1.5">
          {alerts.map((a, i) => (
            <div key={i}
              className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 border ${
                a.level === "critical"
                  ? "bg-red-500/[0.07] border-red-500/20 text-red-300"
                  : "bg-amber-500/[0.07] border-amber-500/20 text-amber-300"
              }`}>
              {a.level === "critical"
                ? <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                : <AlertCircle   className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
              {a.msg}
            </div>
          ))}
        </div>
      )}

      {/* ── Section 7: Notes ── */}
      {cycle.notes && (
        <div className="px-5 py-2.5 border-b border-white/[0.06]">
          <p className="text-[11px] text-white/25 leading-relaxed line-clamp-2 italic">"{cycle.notes}"</p>
        </div>
      )}

      {/* ── Section 8: Hatch Log ── */}
      <div className="px-5 py-3">
        <HatchLog cycleId={cycle.id} eggsSet={cycle.eggsSet} phase={cs.phase} />
      </div>
    </div>
  );
}

// ─── Completed machine card (آخر دورة للفقاسة) ────────────────────────────────

function LastCycleCard({ inc, cycle }: { inc:Incubator; cycle:Cycle }) {
  const eggsHatched = cycle.eggsHatched ?? 0;
  const hatchRate   = cycle.eggsSet > 0 ? Math.round((eggsHatched / cycle.eggsSet) * 100) : 0;
  const rateColor   = hatchRate >= 70 ? "text-emerald-400" : hatchRate >= 50 ? "text-amber-400" : "text-red-400";
  const [showLog, setShowLog] = useState(false);

  return (
    <div className="rounded-2xl ring-1 ring-slate-600/20 overflow-hidden bg-gradient-to-b from-[#0e1219] to-[#0a0d13]">
      <div className="h-[2px] bg-slate-600/50" />

      {/* Header */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
                {inc.name}
              </span>
              {inc.model && <span className="text-[10px] text-white/15 font-mono">{inc.model}</span>}
            </div>
            <h2 className="text-xl font-black text-white/50 leading-tight">{cycle.batchName}</h2>
            <p className="text-[10px] text-white/20 mt-0.5">آخر دورة مكتملة</p>
          </div>
          <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold
            border border-slate-600/30 bg-slate-600/10 text-slate-400">
            <CheckCircle2 className="w-3 h-3" />
            مكتملة
          </div>
        </div>
      </div>

      {/* Dates */}
      <div className="mx-5 mb-3 rounded-xl bg-white/[0.03] border border-white/[0.06] divide-y divide-white/[0.05]">
        <div className="grid grid-cols-2 divide-x divide-white/[0.05] rtl:divide-x-reverse">
          <div className="px-3 py-2.5">
            <div className="text-[9px] text-white/25 uppercase tracking-wider mb-1">تاريخ البداية</div>
            <div className="text-sm font-semibold text-white/50">{fmtDateShort(cycle.startDate)}</div>
          </div>
          <div className="px-3 py-2.5">
            <div className="text-[9px] text-white/25 uppercase tracking-wider mb-1">تاريخ الإنتهاء</div>
            <div className="text-sm font-semibold text-white/50">
              {cycle.actualHatchDate
                ? fmtDateShort(cycle.actualHatchDate)
                : fmtDateShort(cycle.expectedHatchDate)}
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="grid grid-cols-3 border-y border-white/[0.05]">
        {[
          { label:"بيض وُضع",   value:cycle.eggsSet.toLocaleString("ar-IQ"), color:"text-white/40" },
          { label:"صوص فقست",   value:eggsHatched.toLocaleString("ar-IQ"),   color:"text-white/60" },
          { label:"نسبة الفقس", value:`${hatchRate}%`,                       color:rateColor       },
        ].map((s,i) => (
          <div key={i} className={`px-3 py-4 text-center ${i<2?"border-e border-white/[0.05]":""}`}>
            <div className="text-[9px] text-white/20 uppercase tracking-wider mb-1.5">{s.label}</div>
            <div className={`text-3xl font-black font-mono leading-none ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Rate bar */}
      <div className="px-5 py-3 border-b border-white/[0.05]">
        <div className="w-full bg-white/[0.05] rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full rounded-full ${hatchRate>=70?"bg-emerald-500":hatchRate>=50?"bg-amber-500":"bg-red-500"}`}
            style={{ width:`${hatchRate}%`, transition:"width 1s ease" }}
          />
        </div>
        {cycle.notes && (
          <p className="text-[10px] text-white/20 mt-2 italic line-clamp-1">"{cycle.notes}"</p>
        )}
      </div>

      {/* Hatch log for completed */}
      <div className="px-5 py-3">
        <button
          onClick={() => setShowLog(v=>!v)}
          className="w-full flex items-center justify-between text-xs text-white/25 hover:text-white/45 transition-colors"
        >
          <span className="flex items-center gap-2">
            <History className="w-3.5 h-3.5" />
            سجل الفتحات لهذه الدورة
          </span>
          {showLog ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {showLog && (
          <div className="mt-3">
            <HatchLog cycleId={cycle.id} eggsSet={cycle.eggsSet} phase="completed" />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── History bar ──────────────────────────────────────────────────────────────

function HistoryBar({ cycles }: { cycles:Cycle[] }) {
  const done = cycles
    .filter(c => c.status === "completed" && c.eggsHatched != null)
    .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  if (done.length < 2) return null;

  const avg = Math.round(done.reduce((s,c) => s + (c.eggsHatched!/c.eggsSet), 0) / done.length * 100);

  return (
    <div className="border-t border-white/[0.06] px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] text-white/25 uppercase tracking-widest">سجل الدورات المكتملة</span>
        <span className={`text-[10px] font-bold ${avg>=65?"text-emerald-400":"text-amber-400"}`}>
          متوسط {avg}%
        </span>
      </div>
      <div className="space-y-2">
        {done.map(c => {
          const r = Math.round((c.eggsHatched!/c.eggsSet)*100);
          const col = r>=70?"bg-emerald-500":r>=50?"bg-amber-500":"bg-red-500";
          const tcol = r>=70?"text-emerald-400":r>=50?"text-amber-400":"text-red-400";
          return (
            <div key={c.id} className="flex items-center gap-3 text-xs">
              <span className={`w-8 font-black font-mono shrink-0 ${tcol}`}>{r}%</span>
              <div className="flex-1 bg-white/[0.05] rounded-full h-1.5 overflow-hidden">
                <div className={`h-full rounded-full ${col}`} style={{ width:`${r}%` }} />
              </div>
              <span className="text-white/25 shrink-0 truncate max-w-[110px]">{c.batchName}</span>
              <span className="text-white/15 shrink-0 font-mono text-[10px]">
                {c.eggsHatched?.toLocaleString("ar-IQ")}/{c.eggsSet.toLocaleString("ar-IQ")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main ═════════════════════════════════════════════════════════════════════

export default function IncubationCenter() {
  useLanguage(); // for future i18n
  const base = import.meta.env.BASE_URL ?? "/";

  // 1-second clock
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  // SSE
  const sseRef = useRef(0);
  const [liveMap, setLiveMap] = useState<Map<number,Cycle>>(new Map());
  const [conn, setConn] = useState<"connecting"|"sse"|"poll">("connecting");

  useEffect(() => {
    let cancelled = false, es: EventSource|null = null, pt: ReturnType<typeof setInterval>|null = null;
    const apply = (_st:number, cycles:Cycle[]) => {
      if (!cancelled) setLiveMap(new Map(cycles.map(c=>[c.id,c])));
    };
    const poll = async () => {
      try { const d:Cycle[] = await apiFetch("/dashboard/active-cycles"); if (!cancelled) apply(0,d); } catch {}
    };
    const startPoll = () => { if (cancelled) return; setConn("poll"); poll(); pt=setInterval(poll,30_000); };
    const connect = () => {
      if (cancelled) return;
      try {
        es = new EventSource(`${base}api/hatching/live-stream`,{withCredentials:true});
        es.onopen = () => { if (!cancelled) { sseRef.current=0; setConn("sse"); } };
        es.onmessage = ev => {
          try { const p=JSON.parse(ev.data) as {serverTime:number;cycles:Cycle[]}; apply(p.serverTime,p.cycles); if(!cancelled) setConn("sse"); }
          catch {}
        };
        es.onerror = () => { es?.close(); es=null; sseRef.current++; if(sseRef.current>=3) startPoll(); else if(!cancelled) setTimeout(connect,5_000); };
      } catch { startPoll(); }
    };
    connect();
    return () => { cancelled=true; es?.close(); if(pt) clearInterval(pt); };
  }, [base]);

  // Data
  const { data: incubators=[], isLoading } = useQuery<Incubator[]>({
    queryKey:["incubators"], queryFn:()=>apiFetch("/incubators"), refetchInterval:60_000,
  });
  const { data: allCycles=[] } = useQuery<Cycle[]>({
    queryKey:["all-cycles"], queryFn:()=>apiFetch("/hatching-cycles"), refetchInterval:120_000,
  });

  // Build per-machine cycle: SSE → activeCycle → last completed
  const machines = useMemo(() => {
    return incubators.map(inc => {
      // SSE live data
      let cycle: Cycle|null = null;
      for (const [,c] of liveMap) {
        if (c.incubatorId === inc.id) { cycle=c; break; }
      }
      // activeCycle from endpoint
      if (!cycle && inc.activeCycle) cycle = inc.activeCycle;

      const isActive = cycle && (cycle.status === "incubating" || cycle.status === "hatching");
      if (isActive) return { inc, cycle: cycle!, mode: "active" as const };

      // Find last cycle for this machine (any status)
      const machineCycles = allCycles
        .filter(c => c.incubatorId === inc.id)
        .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const lastCycle = machineCycles[0] ?? null;
      return { inc, cycle: lastCycle, mode: "last" as const };
    });
  }, [incubators, liveMap, allCycles]);

  const activeCount = machines.filter(m => m.mode === "active").length;
  const totalEggs   = machines
    .filter(m => m.mode === "active" && m.cycle)
    .reduce((s,m) => s + m.cycle!.eggsSet, 0);

  const completed = allCycles.filter(c => c.status==="completed" && c.eggsHatched!=null);
  const histRate  = completed.length > 0
    ? Math.round(completed.reduce((s,c)=>s+(c.eggsHatched!/c.eggsSet),0)/completed.length*100)
    : 0;

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-[#0d1117] border border-white/[0.07] overflow-hidden animate-pulse">
        <div className="h-14 bg-white/[0.03] border-b border-white/[0.05]" />
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-80 rounded-xl bg-white/[0.03]" />
          <div className="h-80 rounded-xl bg-white/[0.03]" />
        </div>
      </div>
    );
  }

  if (incubators.length === 0) {
    return (
      <div className="rounded-2xl bg-[#0d1117] border border-white/[0.07] py-16 text-center">
        <Egg className="w-10 h-10 text-white/10 mx-auto mb-3" />
        <p className="text-white/30 text-sm">لا توجد فقاسات مسجلة</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-[#0d1117] border border-white/[0.07] overflow-hidden shadow-2xl">

      {/* ── Header bar ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] bg-[#0a0d12]/80">
        <div className="flex items-center gap-3">
          <div className="relative w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20
            flex items-center justify-center">
            <Egg className="w-4 h-4 text-blue-400" />
            {conn==="sse" && (
              <span className="absolute -top-[3px] -right-[3px] w-2 h-2 rounded-full
                bg-emerald-400 border-2 border-[#0a0d12] animate-pulse" />
            )}
          </div>
          <div>
            <div className="text-sm font-bold text-white">مركز التفقيس</div>
            <div className="flex items-center gap-1.5 text-[10px] mt-0.5">
              {conn==="sse"        && <><Wifi       className="w-3 h-3 text-emerald-400"/><span className="text-emerald-500">مباشر</span></>}
              {conn==="poll"       && <><RefreshCw  className="w-3 h-3 text-amber-400"/><span className="text-amber-500">دوري</span></>}
              {conn==="connecting" && <><WifiOff    className="w-3 h-3 text-white/15 animate-pulse"/><span className="text-white/20">جاري…</span></>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1
              rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              {activeCount} {activeCount===1?"نشطة":"نشطة"}
            </span>
          )}
          {totalEggs > 0 && (
            <span className="text-[11px] text-white/25 bg-white/[0.04] rounded-full px-2.5 py-1">
              {totalEggs.toLocaleString("ar-IQ")} بيضة
            </span>
          )}
          {histRate > 0 && (
            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
              histRate>=65
                ?"bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                :"bg-amber-500/10 border-amber-500/20 text-amber-400"
            }`}>{histRate}% متوسط</span>
          )}
        </div>
      </div>

      {/* ── Machine grid ── */}
      <div className="p-4">
        <div className={`grid gap-5 ${machines.length === 1 ? "grid-cols-1 max-w-xl mx-auto" : "grid-cols-1 lg:grid-cols-2"}`}>
          {machines.map(({ inc, cycle, mode }) => {
            if (mode === "active" && cycle) {
              return (
                <ActiveCard key={inc.id} inc={inc} cycle={cycle} nowMs={nowMs} />
              );
            }
            if (cycle) {
              return (
                <LastCycleCard key={inc.id} inc={inc} cycle={cycle} />
              );
            }
            // No cycle at all — bare idle card
            return (
              <div key={inc.id}
                className="rounded-2xl ring-1 ring-slate-700/20 bg-[#0e1219] flex flex-col items-center justify-center py-12 gap-3">
                <Egg className="w-8 h-8 text-white/10" />
                <div className="text-center">
                  <div className="text-sm font-bold text-white/25">{inc.name}</div>
                  <div className="text-xs text-white/15 mt-0.5">لا توجد دورات بعد</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── History ── */}
      <HistoryBar cycles={allCycles} />

    </div>
  );
}
