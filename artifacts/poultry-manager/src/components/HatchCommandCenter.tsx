/**
 * HATCH INTELLIGENCE COMMAND CENTER — V5
 * ────────────────────────────────────────────────────────────────────────────
 * Professional real-time hatching telemetry system.
 * All data is live from the API — zero mock values.
 *
 * Architecture:
 *   CommandBanner   → full-width live KPI strip
 *   IncubatorStation → per-machine control panel + countdown
 *   CentralBrain    → AI analysis engine from real historical data
 *   EmbryoTracker   → digital embryo development timeline
 *   HatchRadar      → automated threat detection
 *   HatchForecast   → prediction engine using history
 *   IncubatorRank   → machine performance leaderboard
 *   LiveHatchLog    → hatch opening registry
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Egg, Thermometer, Droplets, Calendar, Clock, AlertTriangle,
  CheckCircle2, Wifi, WifiOff, RefreshCw, Plus, Trash2,
  Brain, Zap, Activity, Target, TrendingUp, TrendingDown,
  Bird, Flame, Lock, BarChart3, AlertCircle, Trophy,
  ChevronRight, Timer, Shield, ShieldAlert, ShieldCheck,
  Star, Eye, Layers, Cpu, Radio,
} from "lucide-react";

// ─── Core Types ──────────────────────────────────────────────────────────────

interface Cycle {
  id: number;
  batchName: string;
  eggsSet: number;
  eggsHatched: number | null;
  startDate: string;
  setTime: string | null;
  status: string;
  temperature: number | null;
  humidity: number | null;
  lockdownTemperature: number | null;
  lockdownHumidity: number | null;
  expectedHatchDate: string;
  actualHatchDate: string | null;
  lockdownDate: string | null;
  lockdownTime: string | null;
  isActive: boolean;
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

interface HatchOpening {
  id: number;
  hatchingCycleId: number;
  openedAt: string;
  chicksCount: number;
  notes: string | null;
  openedByName: string | null;
}

interface Analytics {
  hatching: {
    totalCycles: number;
    completedCycles: number;
    avgHatchRate: number;
    activeCycles: number;
    totalEggsUsed: number;
    totalChicksHatched: number;
    activeEggs: number;
    cycleBreakdown: Array<{
      id: number; name: string; eggsSet: number;
      eggsHatched: number | null; hatchRate: number | null;
      status: string; startDate: string; machine: string;
      profit: number;
    }>;
  };
}

// ─── Science Engine ───────────────────────────────────────────────────────────

type Phase = "incubation" | "lockdown" | "hatching" | "overdue" | "completed" | "failed";

interface PhaseData {
  phase: Phase;
  day: number;
  totalPct: number;   // 0-100 of full 21-day cycle
  daysLeft: number;
  hoursLeft: number;
  minsLeft: number;
  idealTemp: number;
  idealHum: number;
  turningRequired: boolean;
  phaseLabel: string;
  embryoStage: string;
  embryoDetail: string;
}

const EMBRYO_MAP: Record<number, [string, string]> = {
  1:  ["تشكّل محور الجنين",     "بداية الجهاز العصبي"],
  2:  ["ظهور القلب",            "بدء تكوين الأوعية الدموية"],
  3:  ["نبض القلب",             "القلب يبدأ الخفقان"],
  4:  ["تمايز الرأس والأطراف",  "ظهور النتوءات الأولى للأجنحة"],
  5:  ["تشكّل الجهاز الهضمي",  "الأمعاء والكبد في التكوّن"],
  6:  ["ظهور المنقار",          "تكوين الجهاز التنفسي"],
  7:  ["تكامل العينين",         "الشبكية تكتسب الصبغة"],
  8:  ["نمو الأطراف",           "الأجنحة والأرجل تظهر بوضوح"],
  9:  ["تكوين الريش",           "البصيلات الأولى تظهر"],
  10: ["اكتمال الجهاز الهيكلي","العظام تبدأ بالتصلّب"],
  11: ["نضج الأعضاء الداخلية", "الكلى والرئتان تعملان"],
  12: ["الغطاء الريشي الكامل", "الجسم مغطى بالزغب"],
  13: ["تخزين الدهون",          "احتياطيات طاقة للفقس"],
  14: ["تكامل الجهاز الحركي",  "العضلات تنضج وتتقوى"],
  15: ["المراحل الأخيرة للنمو","الصوص يملأ القشرة"],
  16: ["الجهاز المناعي ينضج",  "التحضير للحياة الخارجية"],
  17: ["آخر التقليبات",         "الصوص يتمركز نحو رأس القشرة"],
  18: ["الانتقال للفقس",        "الرأس يتجه نحو الغرفة الهوائية"],
  19: ["ثقب الغرفة الهوائية",  "الصوص يبدأ بالتنفس"],
  20: ["كسر القشرة الأولي",    "المنقار يخترق القشرة"],
  21: ["الفقس الكامل",          "الصوص يخرج من القشرة"],
};

function parseDateLocal(d: string): Date {
  return new Date(d + "T12:00:00");
}

function computePhaseData(cycle: Cycle, now: number): PhaseData {
  const start = parseDateLocal(cycle.startDate).getTime();
  const hatchTarget = parseDateLocal(cycle.expectedHatchDate).getTime();
  const totalMs = hatchTarget - start;
  const elapsedMs = now - start;

  const day = Math.max(1, Math.floor(elapsedMs / 86_400_000) + 1);
  const remainMs = Math.max(0, hatchTarget - now);
  const daysLeft  = Math.floor(remainMs / 86_400_000);
  const hoursLeft = Math.floor((remainMs % 86_400_000) / 3_600_000);
  const minsLeft  = Math.floor((remainMs % 3_600_000) / 60_000);
  const totalPct  = Math.min(100, Math.round((elapsedMs / totalMs) * 100));

  let phase: Phase;
  if (cycle.status === "completed") phase = "completed";
  else if (cycle.status === "failed") phase = "failed";
  else if (day > 21 && remainMs <= 0) phase = "overdue";
  else if (day >= 19) phase = "hatching";
  else if (day >= 18) phase = "lockdown";
  else phase = "incubation";

  const isLockdownOrHatch = phase === "lockdown" || phase === "hatching";
  const idealTemp = isLockdownOrHatch ? 37.2 : 37.7;
  const idealHum  = isLockdownOrHatch ? 70   : 55;
  const turningRequired = phase === "incubation" && day <= 17;

  const phaseLabels: Record<Phase, string> = {
    incubation: "حضانة", lockdown: "إغلاق",
    hatching: "فقس نشط", overdue: "متأخرة",
    completed: "مكتملة", failed: "فاشلة",
  };

  const clampedDay = Math.min(day, 21);
  const [embryoStage, embryoDetail] = EMBRYO_MAP[clampedDay] ?? ["اكتمل التطور", ""];

  return {
    phase, day, totalPct, daysLeft, hoursLeft, minsLeft,
    idealTemp, idealHum, turningRequired,
    phaseLabel: phaseLabels[phase],
    embryoStage, embryoDetail,
  };
}

// ─── Health Score ─────────────────────────────────────────────────────────────

function computeHealthScore(cycle: Cycle, pd: PhaseData, openings: HatchOpening[]): number {
  let score = 100;

  if (cycle.status === "completed") {
    if (cycle.eggsHatched == null) return 50;
    const rate = (cycle.eggsHatched / cycle.eggsSet) * 100;
    if (rate >= 75) return 95;
    if (rate >= 60) return 80;
    if (rate >= 45) return 65;
    if (rate >= 30) return 45;
    return 25;
  }

  // Temperature penalty
  const temp = pd.phase === "lockdown" ? (cycle.lockdownTemperature ?? cycle.temperature) : cycle.temperature;
  if (!temp) { score -= 15; }
  else {
    const diff = Math.abs(temp - pd.idealTemp);
    if (diff > 1.5) score -= 25;
    else if (diff > 0.8) score -= 12;
    else if (diff > 0.3) score -= 4;
  }

  // Humidity penalty
  const hum = pd.phase === "lockdown" ? (cycle.lockdownHumidity ?? cycle.humidity) : cycle.humidity;
  if (!hum) { score -= 10; }
  else {
    const diff = Math.abs(hum - pd.idealHum);
    if (diff > 15) score -= 20;
    else if (diff > 8) score -= 8;
    else if (diff > 4) score -= 3;
  }

  // Phase-specific
  if (pd.phase === "overdue") score -= 30;
  if (pd.phase === "hatching" && openings.length > 4) score -= 10;
  if (!cycle.notes) score -= 5;

  return Math.max(5, Math.min(100, score));
}

// ─── Phase Color Palette ──────────────────────────────────────────────────────

const PC: Record<Phase, { ring: string; text: string; bg: string; badge: string; bar: string }> = {
  incubation: { ring: "ring-blue-500/40",   text: "text-blue-400",   bg: "bg-blue-950/60",   badge: "bg-blue-900 text-blue-300",   bar: "bg-blue-500"   },
  lockdown:   { ring: "ring-amber-500/40",  text: "text-amber-400",  bg: "bg-amber-950/60",  badge: "bg-amber-900 text-amber-300",  bar: "bg-amber-500"  },
  hatching:   { ring: "ring-emerald-500/40",text: "text-emerald-400",bg: "bg-emerald-950/60",badge: "bg-emerald-900 text-emerald-300",bar: "bg-emerald-500"},
  overdue:    { ring: "ring-red-500/40",    text: "text-red-400",    bg: "bg-red-950/60",    badge: "bg-red-900 text-red-300",      bar: "bg-red-500"    },
  completed:  { ring: "ring-slate-500/30",  text: "text-slate-400",  bg: "bg-slate-900/60",  badge: "bg-slate-800 text-slate-300",  bar: "bg-slate-500"  },
  failed:     { ring: "ring-red-800/40",    text: "text-red-600",    bg: "bg-red-950/80",    badge: "bg-red-950 text-red-400",      bar: "bg-red-800"    },
};

// ─── Central Intelligence Brain ──────────────────────────────────────────────

interface Insight { level: "critical"|"warning"|"good"|"info"; text: string }

function buildBrainInsights(
  active: Cycle[],
  allCycles: Cycle[],
  incubators: Incubator[],
  analytics: Analytics | null,
  now: number,
): Insight[] {
  const insights: Insight[] = [];
  const completed = allCycles.filter(c => c.status === "completed" && c.eggsHatched != null);

  // Historical avg
  if (completed.length >= 2) {
    const totalSet = completed.reduce((s, c) => s + c.eggsSet, 0);
    const totalHatched = completed.reduce((s, c) => s + (c.eggsHatched ?? 0), 0);
    const avg = Math.round((totalHatched / totalSet) * 100);
    if (avg >= 70) insights.push({ level: "good",  text: `متوسط نسبة الفقس التاريخي: ${avg}% — أداء ممتاز على مدى ${completed.length} دورات` });
    else if (avg >= 50) insights.push({ level: "info",  text: `متوسط نسبة الفقس: ${avg}% — يمكن تحسينه بضبط الحرارة والرطوبة` });
    else insights.push({ level: "warning", text: `متوسط نسبة الفقس ${avg}% — يحتاج مراجعة الإعدادات` });
  }

  // Active cycles analysis
  for (const c of active) {
    const pd = computePhaseData(c, now);

    if (pd.phase === "lockdown") {
      insights.push({ level: "critical", text: `ماكينة ${incubators.find(i => i.id === c.incubatorId)?.name ?? "غير محددة"} دخلت الإغلاق — أوقف التقليب فوراً وارفع الرطوبة إلى 70%` });
    } else if (pd.phase === "hatching") {
      insights.push({ level: "critical", text: `فقس نشط في "${c.batchName}" — لا تفتح الماكينة إلا عند الضرورة القصوى` });
    } else if (pd.phase === "overdue") {
      insights.push({ level: "critical", text: `"${c.batchName}" تأخرت عن موعد الفقس بـ ${Math.abs(pd.daysLeft)} يوم — افحص الوضع فوراً` });
    } else if (pd.phase === "incubation") {
      // Temperature check
      if (c.temperature && Math.abs(c.temperature - pd.idealTemp) > 0.5)
        insights.push({ level: "warning", text: `حرارة "${c.batchName}": ${c.temperature}°C — المثالي ${pd.idealTemp}°C، تحتاج تعديل` });
      else if (c.temperature)
        insights.push({ level: "good", text: `حرارة "${c.batchName}" مستقرة عند ${c.temperature}°C — ممتاز` });

      if (pd.daysLeft === 3)
        insights.push({ level: "warning", text: `موعد فقس "${c.batchName}" بعد 3 أيام — حضّر أماكن الصيصان` });
      if (pd.daysLeft === 1)
        insights.push({ level: "critical", text: `🎉 فقس "${c.batchName}" غداً — كل شيء جاهز؟` });
    }

    const pd17 = 17 - pd.day;
    if (pd17 === 1 && pd.phase === "incubation")
      insights.push({ level: "warning", text: `آخر يوم للتقليب في "${c.batchName}" — ابدأ التحضير للإغلاق غداً` });
  }

  // Forecast insight
  if (active.length > 0 && completed.length >= 3 && analytics) {
    const last3 = completed.slice(-3);
    const avg3 = Math.round(last3.reduce((s, c) => s + (c.eggsHatched ?? 0) / c.eggsSet * 100, 0) / 3);
    const activeEggs = active.reduce((s, c) => s + c.eggsSet, 0);
    const forecast = Math.round(activeEggs * avg3 / 100);
    insights.push({ level: "info", text: `بناءً على آخر 3 دورات (${avg3}% متوسط)، توقّع فقس ~${forecast.toLocaleString("ar-IQ")} صوص من ${activeEggs.toLocaleString("ar-IQ")} بيضة` });
  }

  if (active.length === 0)
    insights.push({ level: "info", text: "لا توجد دورة نشطة حالياً — يمكن البدء بدورة جديدة من صفحة التفقيس" });

  return insights.slice(0, 6);
}

// ─── Radar Alerts ─────────────────────────────────────────────────────────────

interface RadarAlert { severity: "high"|"medium"|"low"; title: string; detail: string }

function buildRadarAlerts(active: Cycle[], now: number): RadarAlert[] {
  const alerts: RadarAlert[] = [];
  for (const c of active) {
    const pd = computePhaseData(c, now);
    if (pd.phase === "overdue")
      alerts.push({ severity: "high", title: "تأخر الفقس", detail: `${c.batchName} — تجاوزت الموعد` });
    if (!c.temperature)
      alerts.push({ severity: "medium", title: "درجة حرارة مفقودة", detail: `${c.batchName} — سجّل الحرارة` });
    if (!c.humidity)
      alerts.push({ severity: "medium", title: "رطوبة مفقودة", detail: `${c.batchName} — سجّل الرطوبة` });
    if (c.temperature && Math.abs(c.temperature - pd.idealTemp) > 1)
      alerts.push({ severity: "high", title: "حرارة بعيدة عن المثالي", detail: `${c.batchName}: ${c.temperature}°C vs ${pd.idealTemp}°C` });
    if (c.humidity && Math.abs(c.humidity - pd.idealHum) > 10)
      alerts.push({ severity: "medium", title: "رطوبة غير طبيعية", detail: `${c.batchName}: ${c.humidity}% vs ${pd.idealHum}%` });
    if (pd.phase === "hatching" && pd.daysLeft <= 0)
      alerts.push({ severity: "high", title: "وقت الفقس الآن", detail: `${c.batchName} — ابقَ قريباً` });
  }
  if (alerts.length === 0)
    alerts.push({ severity: "low", title: "جميع الأنظمة طبيعية", detail: "لا توجد تنبيهات نشطة حالياً" });
  return alerts;
}

// ─── Hatch Forecast ───────────────────────────────────────────────────────────

interface Forecast { eggsIn: number; expectedHatch: number; expectedFail: number; pct: number; confidence: "high"|"medium"|"low" }

function buildForecast(active: Cycle[], completed: Cycle[]): Forecast[] {
  if (completed.length === 0 || active.length === 0)
    return active.map(c => ({ eggsIn: c.eggsSet, expectedHatch: 0, expectedFail: c.eggsSet, pct: 0, confidence: "low" }));

  const recent = completed.slice(-5);
  const avgPct = recent.reduce((s, c) => s + (c.eggsHatched ?? 0) / c.eggsSet, 0) / recent.length;

  return active.map(c => {
    const expected = Math.round(c.eggsSet * avgPct);
    const confidence: "high"|"medium"|"low" = recent.length >= 5 ? "high" : recent.length >= 3 ? "medium" : "low";
    return { eggsIn: c.eggsSet, expectedHatch: expected, expectedFail: c.eggsSet - expected, pct: Math.round(avgPct * 100), confidence };
  });
}

// ─── Compact Countdown ────────────────────────────────────────────────────────

function Countdown({ pd, textClass }: { pd: PhaseData; textClass: string }) {
  if (pd.phase === "completed" || pd.phase === "failed")
    return <span className={`font-mono text-2xl font-black ${textClass} opacity-60`}>—</span>;
  if (pd.daysLeft <= 0 && pd.hoursLeft <= 0)
    return <span className={`font-mono text-2xl font-black ${textClass} animate-pulse`}>الآن!</span>;
  return (
    <div className={`flex items-end gap-1 font-mono font-black ${textClass}`}>
      {pd.daysLeft > 0 && <><span className="text-3xl leading-none">{pd.daysLeft}</span><span className="text-sm opacity-60 mb-0.5">ي</span></>}
      <span className="text-3xl leading-none">{String(pd.hoursLeft).padStart(2, "0")}</span>
      <span className="text-sm opacity-60 mb-0.5">س</span>
      <span className="text-3xl leading-none">{String(pd.minsLeft).padStart(2, "0")}</span>
      <span className="text-sm opacity-60 mb-0.5">د</span>
    </div>
  );
}

// ─── Day Progress Strip ───────────────────────────────────────────────────────

function DayStrip({ day, phase }: { day: number; phase: Phase }) {
  const clamped = Math.max(0, Math.min(21, day));
  return (
    <div className="space-y-1">
      <div className="flex gap-px h-2 rounded-full overflow-hidden bg-white/5">
        {Array.from({ length: 21 }, (_, i) => {
          const d = i + 1;
          const filled = clamped >= d;
          const seg = d <= 18 ? "bg-blue-500" : d <= 18 ? "bg-blue-500" : d === 18 ? "bg-amber-500" : d <= 20 ? "bg-amber-500" : "bg-emerald-500";
          const segColor = d <= 17 ? "bg-blue-500" : d === 18 ? "bg-amber-500" : d <= 20 ? "bg-amber-500" : "bg-emerald-400";
          return (
            <div key={d} className={`flex-1 rounded-sm transition-all ${filled ? segColor : "bg-white/10"} ${d === clamped ? "scale-y-150" : ""}`} />
          );
        })}
      </div>
      <div className="flex justify-between text-[9px] text-white/30 font-mono">
        <span>1</span><span className="text-white/50">يوم {clamped}</span><span>21</span>
      </div>
    </div>
  );
}

// ─── Health Score Badge ───────────────────────────────────────────────────────

function HealthBadge({ score }: { score: number }) {
  const { color, label } = score >= 85 ? { color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", label: "ممتاز" }
    : score >= 70 ? { color: "text-blue-400 bg-blue-500/10 border-blue-500/20", label: "جيد" }
    : score >= 50 ? { color: "text-amber-400 bg-amber-500/10 border-amber-500/20", label: "مقبول" }
    : { color: "text-red-400 bg-red-500/10 border-red-500/20", label: "يحتاج تدخل" };
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-semibold ${color}`}>
      <span className="text-sm font-black">{score}</span>
      <span className="opacity-70">/ 100</span>
      <span>{label}</span>
    </div>
  );
}

// ─── Live Hatch Log (openings) ────────────────────────────────────────────────

function HatchLog({ cycleId, eggsSet, batchName }: { cycleId: number; eggsSet: number; batchName: string }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [count, setCount] = useState("");
  const [ts, setTs] = useState(() => new Date().toISOString().slice(0, 16));
  const [note, setNote] = useState("");

  const { data: openings = [] } = useQuery<HatchOpening[]>({
    queryKey: ["openings", cycleId],
    queryFn: () => apiFetch(`/hatching-cycles/${cycleId}/openings`),
    refetchInterval: 20_000,
  });

  const add = useMutation({
    mutationFn: (d: object) => apiFetch(`/hatching-cycles/${cycleId}/openings`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["openings", cycleId] }); setCount(""); setNote(""); setShowForm(false); },
  });
  const del = useMutation({
    mutationFn: (id: number) => apiFetch(`/hatch-openings/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["openings", cycleId] }),
  });

  const total = openings.reduce((s, o) => s + o.chicksCount, 0);
  const rate  = eggsSet > 0 ? ((total / eggsSet) * 100).toFixed(1) : "0";
  const fmt   = (iso: string) => new Date(iso).toLocaleString("ar-IQ", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-3">
      {/* Totals */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "إجمالي الصيصان", value: total.toLocaleString("ar-IQ"), color: "text-emerald-400" },
          { label: "نسبة الفقس",     value: `${rate}%`,                     color: "text-blue-400"   },
          { label: "عدد الفتحات",    value: openings.length.toString(),       color: "text-amber-400"  },
        ].map(s => (
          <div key={s.label} className="rounded-lg bg-white/5 border border-white/10 p-2 text-center">
            <div className={`text-xl font-black font-mono ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-white/40 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Opening list */}
      {openings.length > 0 && (
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {openings.map((o, i) => (
            <div key={o.id} className="flex items-center justify-between rounded-lg bg-white/5 border border-white/10 px-3 py-2">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-white/30">#{i + 1}</span>
                <div>
                  <span className="text-sm font-bold text-emerald-400">{o.chicksCount.toLocaleString("ar-IQ")} صوص</span>
                  <span className="text-[10px] text-white/40 ms-2">{fmt(o.openedAt)}</span>
                </div>
                {o.notes && <span className="text-[10px] text-white/50 truncate max-w-[100px]">{o.notes}</span>}
              </div>
              <button onClick={() => del.mutate(o.id)} className="text-white/20 hover:text-red-400 transition-colors p-1">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {showForm ? (
        <div className="rounded-lg bg-white/5 border border-white/10 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-white/50 mb-1 block">عدد الصيصان</label>
              <Input type="number" min="0" value={count} onChange={e => setCount(e.target.value)}
                className="h-8 text-sm bg-white/5 border-white/10 text-white" placeholder="0" />
            </div>
            <div>
              <label className="text-[10px] text-white/50 mb-1 block">التاريخ والوقت</label>
              <Input type="datetime-local" value={ts} onChange={e => setTs(e.target.value)}
                className="h-8 text-sm bg-white/5 border-white/10 text-white" />
            </div>
          </div>
          <Input value={note} onChange={e => setNote(e.target.value)}
            placeholder="ملاحظات (اختياري)" className="h-8 text-sm bg-white/5 border-white/10 text-white" />
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 h-8 text-xs bg-emerald-600 hover:bg-emerald-500"
              onClick={() => add.mutate({ chicksCount: parseInt(count) || 0, openedAt: new Date(ts).toISOString(), notes: note || null })}
              disabled={add.isPending || !count}>
              {add.isPending ? "جاري الحفظ…" : "تسجيل الفتحة"}
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs border-white/10 text-white/70"
              onClick={() => setShowForm(false)}>إلغاء</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm"
          className="w-full h-8 text-xs border-dashed border-white/20 text-white/50 hover:text-white hover:border-white/40 gap-1.5"
          onClick={() => setShowForm(true)}>
          <Plus className="w-3.5 h-3.5" /> تسجيل فتحة جديدة
        </Button>
      )}
    </div>
  );
}

// ─── Incubator Station ────────────────────────────────────────────────────────

function IncubatorStation({ cycle, incubator, now }: { cycle: Cycle; incubator: Incubator | undefined; now: number }) {
  const pd   = useMemo(() => computePhaseData(cycle, now), [cycle, now]);
  const { data: openings = [] } = useQuery<HatchOpening[]>({
    queryKey: ["openings", cycle.id],
    queryFn: () => apiFetch(`/hatching-cycles/${cycle.id}/openings`),
  });
  const health = useMemo(() => computeHealthScore(cycle, pd, openings), [cycle, pd, openings]);
  const c = PC[pd.phase];
  const [tab, setTab] = useState<"status"|"embryo"|"log">("status");

  const temp = (pd.phase === "lockdown" || pd.phase === "hatching")
    ? (cycle.lockdownTemperature ?? cycle.temperature) : cycle.temperature;
  const hum  = (pd.phase === "lockdown" || pd.phase === "hatching")
    ? (cycle.lockdownHumidity ?? cycle.humidity) : cycle.humidity;

  const tempOk = temp && Math.abs(temp - pd.idealTemp) <= 0.5;
  const humOk  = hum  && Math.abs(hum  - pd.idealHum)  <= 5;

  return (
    <div className={`relative rounded-2xl ring-2 ${c.ring} overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-800/90`}>
      {/* Top accent line */}
      <div className={`absolute inset-x-0 top-0 h-0.5 ${c.bar} opacity-80`} />

      {/* Header */}
      <div className={`px-5 py-4 ${c.bg} border-b border-white/5`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-[10px] font-semibold uppercase tracking-widest ${c.text} opacity-70`}>
                {incubator?.name ?? "ماكينة"}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${c.badge}`}>
                {pd.phaseLabel}
              </span>
            </div>
            <h3 className="text-white font-black text-lg leading-tight truncate">{cycle.batchName}</h3>
            <p className="text-white/40 text-xs mt-0.5">
              بدأت {new Date(cycle.startDate + "T12:00:00").toLocaleDateString("ar-IQ", { day: "numeric", month: "long" })}
              {cycle.setTime && ` — ${cycle.setTime}`}
            </p>
          </div>
          <div className="text-left shrink-0 space-y-1">
            <HealthBadge score={health} />
          </div>
        </div>

        {/* Day strip */}
        <div className="mt-3">
          <DayStrip day={pd.day} phase={pd.phase} />
        </div>
      </div>

      {/* Main metrics row */}
      <div className="grid grid-cols-3 divide-x divide-white/5 rtl:divide-x-reverse border-b border-white/5">
        {/* Day counter */}
        <div className="px-4 py-3 text-center">
          <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">اليوم</div>
          <div className={`text-4xl font-black font-mono leading-none ${c.text}`}>{pd.day}</div>
          <div className="text-[10px] text-white/30 mt-1">من 21</div>
        </div>

        {/* Countdown */}
        <div className="px-4 py-3 text-center">
          <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">
            {pd.phase === "hatching" ? "فقس نشط" : "للفقس"}
          </div>
          <Countdown pd={pd} textClass={c.text} />
          {pd.phase !== "completed" && pd.phase !== "failed" && (
            <div className="text-[10px] text-white/30 mt-1">
              {new Date(cycle.expectedHatchDate + "T12:00:00").toLocaleDateString("ar-IQ", { day: "numeric", month: "short" })}
            </div>
          )}
        </div>

        {/* Eggs */}
        <div className="px-4 py-3 text-center">
          <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">بيض</div>
          <div className="text-4xl font-black font-mono text-white leading-none">
            {cycle.eggsSet >= 1000 ? `${(cycle.eggsSet / 1000).toFixed(1)}K` : cycle.eggsSet}
          </div>
          <div className="text-[10px] text-white/30 mt-1">
            {incubator ? `${Math.round((cycle.eggsSet / incubator.capacity) * 100)}% طاقة` : "في الماكينة"}
          </div>
        </div>
      </div>

      {/* Sensor row */}
      <div className="grid grid-cols-2 divide-x divide-white/5 rtl:divide-x-reverse border-b border-white/5">
        <div className="px-4 py-2.5 flex items-center gap-2">
          <Thermometer className={`w-4 h-4 shrink-0 ${tempOk ? "text-emerald-400" : temp ? "text-amber-400" : "text-white/20"}`} />
          <div>
            <div className="text-[10px] text-white/40">حرارة / مثالي</div>
            <div className="text-sm font-bold text-white">
              {temp ? `${temp}°C` : "—"}
              <span className="text-white/30 text-xs ms-1">/ {pd.idealTemp}°C</span>
            </div>
          </div>
        </div>
        <div className="px-4 py-2.5 flex items-center gap-2">
          <Droplets className={`w-4 h-4 shrink-0 ${humOk ? "text-emerald-400" : hum ? "text-amber-400" : "text-white/20"}`} />
          <div>
            <div className="text-[10px] text-white/40">رطوبة / مثالي</div>
            <div className="text-sm font-bold text-white">
              {hum ? `${hum}%` : "—"}
              <span className="text-white/30 text-xs ms-1">/ {pd.idealHum}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex border-b border-white/5">
        {(["status","embryo","log"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              tab === t ? `${c.text} border-b-2 ${c.bar.replace("bg-","border-")} bg-white/5` : "text-white/30 hover:text-white/60"
            }`}>
            {t === "status" ? "الحالة" : t === "embryo" ? "الجنين" : `سجل الفقس`}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="px-4 py-3">
        {tab === "status" && (
          <div className="space-y-2">
            {/* Turning status */}
            <div className="flex items-center justify-between text-xs bg-white/5 rounded-lg px-3 py-2">
              <span className="text-white/50">التقليب</span>
              <span className={pd.turningRequired ? "text-amber-400 font-semibold" : "text-white/30"}>
                {pd.turningRequired ? "مطلوب 3x يومياً" : "موقوف"}
              </span>
            </div>
            {/* Notes */}
            {cycle.notes && (
              <div className="text-xs text-white/40 bg-white/5 rounded-lg px-3 py-2 line-clamp-2">{cycle.notes}</div>
            )}
            {/* Chicks count if completed/has openings */}
            {cycle.eggsHatched != null && (
              <div className="flex items-center justify-between text-xs bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                <span className="text-emerald-400/70">صيصان فقست</span>
                <span className="text-emerald-400 font-bold">{cycle.eggsHatched} ({Math.round(cycle.eggsHatched / cycle.eggsSet * 100)}%)</span>
              </div>
            )}
          </div>
        )}

        {tab === "embryo" && (
          <div className="space-y-2">
            <div className="rounded-lg bg-blue-950/40 border border-blue-500/20 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Cpu className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[10px] text-blue-400/70 font-semibold uppercase tracking-wide">اليوم {Math.min(pd.day, 21)}</span>
              </div>
              <p className="text-sm text-white font-semibold">{pd.embryoStage}</p>
              <p className="text-xs text-white/40 mt-0.5">{pd.embryoDetail}</p>
            </div>
            {/* Mini timeline — show ±2 days */}
            <div className="space-y-1">
              {[-1, 0, 1, 2].map(offset => {
                const d = Math.min(21, Math.max(1, pd.day + offset));
                const [stage] = EMBRYO_MAP[d] ?? ["—", ""];
                const isCurrent = offset === 0;
                return (
                  <div key={offset} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs ${
                    isCurrent ? "bg-blue-500/15 border border-blue-500/30" : "opacity-40"
                  }`}>
                    <span className={`font-mono text-[10px] w-6 shrink-0 ${isCurrent ? c.text : "text-white/40"}`}>{d}</span>
                    <span className={isCurrent ? "text-white" : "text-white/40"}>{stage}</span>
                    {isCurrent && <span className={`ms-auto text-[10px] font-bold ${c.text}`}>← الآن</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "log" && (
          <HatchLog cycleId={cycle.id} eggsSet={cycle.eggsSet} batchName={cycle.batchName} />
        )}
      </div>
    </div>
  );
}

// ─── Incubator Rankings ───────────────────────────────────────────────────────

function IncubatorRankings({ cycles, incubators }: { cycles: Cycle[]; incubators: Incubator[] }) {
  const completed = cycles.filter(c => c.status === "completed" && c.eggsHatched != null);

  const rankings = incubators.map(inc => {
    const incCycles = completed.filter(c => c.incubatorId === inc.id);
    if (incCycles.length === 0) {
      const active = cycles.find(c => c.incubatorId === inc.id && (c.status === "incubating" || c.status === "hatching"));
      return { inc, avgRate: null, totalChicks: 0, totalEggs: 0, bestRate: null, worstRate: null, cycleCount: incCycles.length, active };
    }
    const totalEggs = incCycles.reduce((s, c) => s + c.eggsSet, 0);
    const totalChicks = incCycles.reduce((s, c) => s + (c.eggsHatched ?? 0), 0);
    const avgRate = Math.round((totalChicks / totalEggs) * 100);
    const rates = incCycles.map(c => Math.round((c.eggsHatched ?? 0) / c.eggsSet * 100));
    const active = cycles.find(c => c.incubatorId === inc.id && (c.status === "incubating" || c.status === "hatching"));
    return { inc, avgRate, totalChicks, totalEggs, bestRate: Math.max(...rates), worstRate: Math.min(...rates), cycleCount: incCycles.length, active };
  }).sort((a, b) => (b.avgRate ?? -1) - (a.avgRate ?? -1));

  return (
    <div className="space-y-2">
      {rankings.map((r, i) => (
        <div key={r.inc.id} className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
          <div className="px-4 py-2.5 flex items-center gap-3">
            {/* Rank */}
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
              i === 0 ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
              i === 1 ? "bg-slate-500/20 text-slate-300 border border-slate-500/30" :
                        "bg-white/5 text-white/30 border border-white/10"
            }`}>{i + 1}</div>

            {/* Name + status */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white truncate">{r.inc.name}</span>
                {r.active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-semibold shrink-0">نشطة</span>}
                {r.inc.model && <span className="text-[10px] text-white/30 truncate">{r.inc.model}</span>}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-[10px] text-white/40">
                <span>{r.inc.capacity.toLocaleString()} بيضة / طاقة</span>
                {r.cycleCount > 0 && <span>{r.cycleCount} دورة مكتملة</span>}
              </div>
            </div>

            {/* Rate */}
            {r.avgRate !== null ? (
              <div className="text-left shrink-0">
                <div className={`text-2xl font-black font-mono ${r.avgRate >= 70 ? "text-emerald-400" : r.avgRate >= 50 ? "text-amber-400" : "text-red-400"}`}>
                  {r.avgRate}%
                </div>
                <div className="text-[10px] text-white/30">متوسط</div>
              </div>
            ) : (
              <div className="text-left shrink-0">
                <div className="text-sm font-semibold text-white/20">—</div>
                <div className="text-[10px] text-white/30">لا تاريخ</div>
              </div>
            )}
          </div>

          {/* Stats bar */}
          {r.avgRate !== null && (
            <div className="px-4 pb-2.5 grid grid-cols-3 gap-2 text-[10px]">
              <div className="text-center">
                <div className="text-white/30">أفضل</div>
                <div className="text-emerald-400 font-semibold">{r.bestRate}%</div>
              </div>
              <div className="text-center">
                <div className="text-white/30">أقل</div>
                <div className="text-red-400 font-semibold">{r.worstRate}%</div>
              </div>
              <div className="text-center">
                <div className="text-white/30">صيصان</div>
                <div className="text-white/70 font-semibold">{r.totalChicks.toLocaleString("ar-IQ")}</div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main Command Center ──────────────────────────────────────────────────────

type ConnMode = "connecting"|"sse"|"poll";

export default function HatchCommandCenter() {
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const base = import.meta.env.BASE_URL ?? "/";

  // ── Clock (1-minute tick, server-synced) ───────────────────────────────────
  const clockOffRef = useRef(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + clockOffRef.current), 60_000);
    return () => clearInterval(id);
  }, []);

  // ── SSE + fallback ─────────────────────────────────────────────────────────
  const sseErrRef = useRef(0);
  const [liveCycles, setLiveCycles] = useState<Cycle[]>([]);
  const [connMode, setConnMode] = useState<ConnMode>("connecting");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false; let es: EventSource | null = null; let poll: ReturnType<typeof setInterval> | null = null;
    const apply = (st: number, d: Cycle[]) => { if (cancelled) return; clockOffRef.current = st - Date.now(); setLiveCycles(d); setReady(true); };
    const fetchPoll = async () => { try { const d: Cycle[] = await apiFetch("/dashboard/active-cycles"); apply(Date.now(), d); } catch {} };
    const startPoll = () => { if (cancelled) return; setConnMode("poll"); fetchPoll(); poll = setInterval(fetchPoll, 30_000); };
    const connect = () => {
      if (cancelled) return;
      try {
        es = new EventSource(`${base}api/hatching/live-stream`, { withCredentials: true });
        es.onopen = () => { if (!cancelled) { sseErrRef.current = 0; setConnMode("sse"); } };
        es.onmessage = ev => {
          try { const p = JSON.parse(ev.data) as { serverTime: number; cycles: Cycle[] }; apply(p.serverTime, p.cycles); if (!cancelled) setConnMode("sse"); }
          catch {}
        };
        es.onerror = () => { es?.close(); es = null; sseErrRef.current++; if (sseErrRef.current >= 3) startPoll(); else if (!cancelled) setTimeout(connect, 5_000); };
      } catch { startPoll(); }
    };
    connect();
    return () => { cancelled = true; es?.close(); if (poll) clearInterval(poll); };
  }, [base]);

  // ── Data queries ───────────────────────────────────────────────────────────
  const { data: incubators = [] } = useQuery<Incubator[]>({
    queryKey: ["incubators-hicc"], queryFn: () => apiFetch("/incubators"), refetchInterval: 60_000,
  });
  const { data: allCycles = [] } = useQuery<Cycle[]>({
    queryKey: ["all-cycles-hicc"], queryFn: () => apiFetch("/hatching-cycles"), refetchInterval: 60_000,
  });
  const { data: analytics } = useQuery<Analytics>({
    queryKey: ["analytics-hicc"],
    queryFn: () => apiFetch("/farm-analytics/overview"),
    refetchInterval: 120_000,
  });

  // ── Derived ────────────────────────────────────────────────────────────────
  const completed = useMemo(() => allCycles.filter(c => c.status === "completed" && c.eggsHatched != null), [allCycles]);
  const insights  = useMemo(() => buildBrainInsights(liveCycles, allCycles, incubators, analytics ?? null, now), [liveCycles, allCycles, incubators, analytics, now]);
  const radar     = useMemo(() => buildRadarAlerts(liveCycles, now), [liveCycles, now]);
  const forecasts = useMemo(() => buildForecast(liveCycles, completed), [liveCycles, completed]);

  // Next hatch countdown
  const nextHatch = useMemo(() => {
    if (liveCycles.length === 0) return null;
    return liveCycles.reduce((closest, c) => {
      const t = parseDateLocal(c.expectedHatchDate).getTime();
      return t < parseDateLocal(closest.expectedHatchDate).getTime() ? c : closest;
    });
  }, [liveCycles]);

  // Highest priority cycle
  const priorityCycle = useMemo(() => {
    if (liveCycles.length === 0) return null;
    return liveCycles.reduce((p, c) => {
      const pd = computePhaseData(c, now);
      const pp = computePhaseData(p, now);
      const score = (x: PhaseData) =>
        x.phase === "hatching" ? 100 : x.phase === "lockdown" ? 80 : x.phase === "overdue" ? 90 : 60 - x.daysLeft;
      return score(pd) > score(pp) ? c : p;
    });
  }, [liveCycles, now]);

  const histAvg = useMemo(() => {
    if (completed.length === 0) return 0;
    const t = completed.reduce((s, c) => s + c.eggsSet, 0);
    const h = completed.reduce((s, c) => s + (c.eggsHatched ?? 0), 0);
    return t > 0 ? Math.round((h / t) * 100) : 0;
  }, [completed]);

  const fmt = (n: number) => n.toLocaleString("ar-IQ");

  // ── Loading state ──────────────────────────────────────────────────────────
  if (!ready) {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-slate-950 to-slate-900 border border-white/10 overflow-hidden animate-pulse">
        <div className="h-16 bg-gradient-to-r from-blue-950/60 via-slate-900 to-blue-950/60 flex items-center px-6 gap-3">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-white/30 text-sm font-mono">HATCH INTELLIGENCE COMMAND CENTER — جاري الاتصال…</span>
        </div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-16 bg-white/5 rounded-xl" />)}
        </div>
        <div className="p-4 pt-0"><Skeleton className="h-48 bg-white/5 rounded-xl" /></div>
      </div>
    );
  }

  // ── Full render ────────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl bg-gradient-to-br from-slate-950 via-slate-950/98 to-slate-900 border border-white/10 overflow-hidden shadow-2xl shadow-blue-950/20">

      {/* ══ COMMAND BANNER ═══════════════════════════════════════════════════════ */}
      <div className="relative bg-gradient-to-r from-blue-950/80 via-slate-900 to-blue-950/80 border-b border-white/10 overflow-hidden">
        {/* Subtle grid overlay */}
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 40px,rgba(255,255,255,.1) 40px,rgba(255,255,255,.1) 41px),repeating-linear-gradient(90deg,transparent,transparent 40px,rgba(255,255,255,.1) 40px,rgba(255,255,255,.1) 41px)" }} />

        <div className="relative px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-9 h-9 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center">
                <Radio className="w-5 h-5 text-blue-400" />
              </div>
              {connMode === "sse" && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-slate-950 animate-pulse" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-black text-base tracking-wide">HATCH INTELLIGENCE COMMAND CENTER</span>
                <span className="text-[10px] font-mono text-blue-400/60 bg-blue-500/10 border border-blue-500/20 px-1.5 rounded">V5</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                {connMode === "sse"  && <><Wifi className="w-3 h-3 text-emerald-400" /><span className="text-emerald-400">LIVE</span></>}
                {connMode === "poll" && <><RefreshCw className="w-3 h-3 text-amber-400" /><span className="text-amber-400">POLLING</span></>}
                {connMode === "connecting" && <><WifiOff className="w-3 h-3 text-white/30 animate-pulse" /><span className="text-white/30">CONNECTING…</span></>}
                <span className="text-white/20">·</span>
                <span className="text-white/40">{liveCycles.length} دورة نشطة</span>
                <span className="text-white/20">·</span>
                <span className="text-white/40">{incubators.length} ماكينة</span>
              </div>
            </div>
          </div>

          {/* Live clock */}
          <div className="text-left">
            <div className="text-white/20 text-[10px] font-mono uppercase">اليوم</div>
            <div className="text-white/60 text-xs font-mono">
              {new Date(now).toLocaleDateString("ar-IQ", { weekday: "long", day: "numeric", month: "long" })}
            </div>
          </div>
        </div>
      </div>

      {/* ══ COMMAND KPIs ══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y sm:divide-y-0 divide-white/5 rtl:divide-x-reverse border-b border-white/5">
        {[
          { label: "ماكينات نشطة",    value: liveCycles.length > 0 ? incubators.filter(i => liveCycles.some(c => c.incubatorId === i.id)).length.toString() : "0", sub: `من ${incubators.length}`,       color: "text-blue-400"   },
          { label: "دورات نشطة",      value: liveCycles.length.toString(),                                                                                         sub: `${allCycles.length} إجمالي`,    color: "text-blue-400"   },
          { label: "بيض في الحضن",    value: liveCycles.reduce((s,c) => s + c.eggsSet, 0) >= 1000 ? `${(liveCycles.reduce((s,c)=>s+c.eggsSet,0)/1000).toFixed(1)}K` : liveCycles.reduce((s,c)=>s+c.eggsSet,0).toString(), sub: "بيضة", color: "text-amber-400" },
          { label: "أقرب فقس",        value: nextHatch ? `${computePhaseData(nextHatch, now).daysLeft}ي ${computePhaseData(nextHatch, now).hoursLeft}س` : "—",      sub: nextHatch?.batchName ?? "لا يوجد", color: "text-emerald-400"},
          { label: "صيصان تاريخياً",  value: fmt(analytics?.hatching?.totalChicksHatched ?? 0),                                                                     sub: `${completed.length} دورة`,      color: "text-emerald-400"},
          { label: "معدل النجاح",     value: `${histAvg}%`,                                                                                                          sub: "متوسط تاريخي",                  color: histAvg >= 65 ? "text-emerald-400" : histAvg >= 45 ? "text-amber-400" : "text-red-400" },
        ].map((k, i) => (
          <div key={i} className="px-4 py-3 text-center hover:bg-white/3 transition-colors">
            <div className="text-[10px] text-white/30 uppercase tracking-wide mb-1 truncate">{k.label}</div>
            <div className={`text-2xl font-black font-mono leading-none ${k.color}`}>{k.value}</div>
            <div className="text-[10px] text-white/20 mt-1 truncate">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ══ BODY ══════════════════════════════════════════════════════════════════ */}
      <div className="p-4 space-y-4">

        {/* Incubator Stations */}
        {liveCycles.length > 0 ? (
          <div className={`grid gap-4 ${liveCycles.length > 1 ? "lg:grid-cols-2" : ""}`}>
            {liveCycles.map(cycle => (
              <IncubatorStation
                key={cycle.id}
                cycle={cycle}
                incubator={incubators.find(i => i.id === cycle.incubatorId)}
                now={now}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border-2 border-dashed border-white/10 py-10 text-center">
            <Egg className="w-10 h-10 text-white/10 mx-auto mb-3" />
            <p className="text-white/30 text-sm">لا توجد دورة تفقيس نشطة حالياً</p>
            <p className="text-white/20 text-xs mt-1">أضف دورة جديدة من صفحة التفقيس</p>
          </div>
        )}

        {/* Bottom grid: Brain + Radar + Forecast + Rankings */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* ── Central Brain ── */}
          <div className="rounded-xl bg-purple-950/20 border border-purple-500/20 overflow-hidden">
            <div className="px-4 py-3 bg-purple-950/40 border-b border-purple-500/20 flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-bold text-purple-300">Central Hatch Intelligence Brain</span>
              <span className="ms-auto text-[10px] font-mono text-purple-500">AI</span>
            </div>
            <div className="p-3 space-y-1.5">
              {insights.map((ins, i) => {
                const icons = {
                  critical: <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />,
                  warning:  <AlertCircle  className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />,
                  good:     <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />,
                  info:     <Zap          className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />,
                };
                const textColors = {
                  critical: "text-red-300", warning: "text-amber-300", good: "text-emerald-300", info: "text-blue-300",
                };
                return (
                  <div key={i} className="flex gap-2 bg-white/5 rounded-lg px-3 py-2">
                    {icons[ins.level]}
                    <span className={`text-xs leading-relaxed ${textColors[ins.level]}`}>{ins.text}</span>
                  </div>
                );
              })}
              {insights.length === 0 && <p className="text-xs text-white/20 text-center py-4">لا توجد بيانات كافية للتحليل</p>}
            </div>
          </div>

          {/* ── Hatch Radar ── */}
          <div className="rounded-xl bg-red-950/10 border border-red-500/15 overflow-hidden">
            <div className="px-4 py-3 bg-red-950/30 border-b border-red-500/15 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              <span className="text-sm font-bold text-red-300">Hatch Radar</span>
              <span className="ms-auto text-[10px] font-mono text-red-500">كاشف التهديدات</span>
            </div>
            <div className="p-3 space-y-1.5">
              {radar.map((a, i) => {
                const sev = { high: "bg-red-500/15 border-red-500/30 text-red-300", medium: "bg-amber-500/15 border-amber-500/30 text-amber-300", low: "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" }[a.severity];
                const icon = { high: <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />, medium: <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5" />, low: <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" /> }[a.severity];
                return (
                  <div key={i} className={`flex gap-2 rounded-lg px-3 py-2 border ${sev}`}>
                    {icon}
                    <div className="min-w-0">
                      <div className="text-xs font-semibold leading-tight">{a.title}</div>
                      <div className="text-[10px] opacity-60 mt-0.5 truncate">{a.detail}</div>
                    </div>
                    <span className={`ms-auto text-[9px] font-bold uppercase shrink-0 mt-0.5 ${a.severity === "high" ? "text-red-400" : a.severity === "medium" ? "text-amber-400" : "text-emerald-400"}`}>
                      {a.severity === "high" ? "مرتفع" : a.severity === "medium" ? "متوسط" : "منخفض"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Second row: Forecast + Rankings */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* ── Hatch Forecast ── */}
          <div className="rounded-xl bg-amber-950/10 border border-amber-500/15 overflow-hidden">
            <div className="px-4 py-3 bg-amber-950/30 border-b border-amber-500/15 flex items-center gap-2">
              <Target className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-bold text-amber-300">Hatch Forecast</span>
              <span className="ms-auto text-[10px] font-mono text-amber-600">توقع النتائج</span>
            </div>
            <div className="p-3">
              {forecasts.length > 0 ? forecasts.map((f, i) => {
                const cycle = liveCycles[i];
                if (!cycle) return null;
                const confLabel = { high: "ثقة عالية", medium: "ثقة متوسطة", low: "بيانات محدودة" }[f.confidence];
                const confColor = { high: "text-emerald-400", medium: "text-amber-400", low: "text-white/30" }[f.confidence];
                return (
                  <div key={cycle.id} className="space-y-3">
                    <div className="text-xs font-semibold text-white/60 mb-2">{cycle.batchName}</div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "بيض في الماكينة", value: fmt(f.eggsIn),        color: "text-white/70"   },
                        { label: "متوقع فقسه",      value: fmt(f.expectedHatch), color: "text-emerald-400"},
                        { label: "متوقع لا يفقس",   value: fmt(f.expectedFail),  color: "text-red-400"    },
                      ].map(s => (
                        <div key={s.label} className="rounded-lg bg-white/5 border border-white/10 p-2 text-center">
                          <div className={`text-lg font-black font-mono ${s.color}`}>{s.value}</div>
                          <div className="text-[10px] text-white/30 mt-0.5">{s.label}</div>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-white/40">التوقع: {f.pct}%</span>
                        <span className={`font-semibold ${confColor}`}>{confLabel}</span>
                      </div>
                      <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all"
                          style={{ width: `${f.pct}%` }} />
                      </div>
                      <div className="text-[10px] text-white/20">
                        بناءً على {completed.length} دورة مكتملة ({histAvg}% متوسط تاريخي)
                      </div>
                    </div>
                  </div>
                );
              }) : (
                <div className="text-center py-4">
                  <p className="text-white/20 text-xs">لا توجد دورات نشطة للتوقع</p>
                  {completed.length > 0 && <p className="text-white/15 text-[10px] mt-1">المتوسط التاريخي: {histAvg}%</p>}
                </div>
              )}
            </div>
          </div>

          {/* ── Incubator Rankings ── */}
          <div className="rounded-xl bg-slate-800/30 border border-white/10 overflow-hidden">
            <div className="px-4 py-3 bg-slate-800/50 border-b border-white/10 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-bold text-white/80">ترتيب الفقاسات</span>
              <span className="ms-auto text-[10px] font-mono text-white/20">RANKING</span>
            </div>
            <div className="p-3">
              {incubators.length > 0
                ? <IncubatorRankings cycles={allCycles} incubators={incubators} />
                : <p className="text-center text-white/20 text-xs py-4">لا توجد فقاسات مسجلة</p>
              }
            </div>
          </div>

        </div>

      </div>

      {/* Footer */}
      <div className="px-5 py-2.5 border-t border-white/5 flex items-center justify-between text-[10px] text-white/20">
        <span className="font-mono">HICC V5 · FarmX Intelligence Platform</span>
        <div className="flex items-center gap-1.5">
          {connMode === "sse"  && <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /><span>LIVE · 30s refresh</span></>}
          {connMode === "poll" && <><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /><span>POLLING · 30s</span></>}
        </div>
      </div>

    </div>
  );
}
