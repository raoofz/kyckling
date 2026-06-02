/**
 * HatchingMonitorPro — مراقب التفقيس الاحترافي
 * ─────────────────────────────────────────────
 * Per-incubator live monitoring with:
 *  • Real-time SSE data (fallback polling)
 *  • Hatch openings (multi-open tracking)
 *  • Daily log form
 *  • Smart AI analysis per cycle
 *  • Professional RTL-first design
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Egg, Thermometer, Droplets, Calendar, Clock, AlertTriangle,
  CheckCircle2, XCircle, Info, Wifi, WifiOff, RefreshCw,
  Plus, Trash2, ChevronDown, ChevronUp, FlameKindling,
  Bird, Target, TrendingUp, TrendingDown, Activity,
  Lock, Zap, AlertCircle, CheckSquare, Timer, RotateCcw,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CycleData {
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
  activeCycle?: CycleData | null;
}

interface HatchOpening {
  id: number;
  hatchingCycleId: number;
  openedAt: string;
  chicksCount: number;
  notes: string | null;
  openedByName: string | null;
}

interface DailyLog {
  id: number;
  hatchingCycleId: number;
  logDate: string;
  temperature: number | null;
  humidity: number | null;
  turningDone: boolean;
  notes: string | null;
  issues: string | null;
}

// ─── Incubation Science ───────────────────────────────────────────────────────

function parseDateStr(d: string): Date {
  return new Date(d + "T12:00:00");
}

function daysSince(startDate: string): number {
  const start = parseDateStr(startDate);
  const now = new Date();
  const diff = now.getTime() - start.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)) + 1);
}

function daysUntil(targetDate: string): number {
  const target = parseDateStr(targetDate);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

type IncubationPhase = "incubation" | "lockdown" | "hatching" | "overdue" | "completed" | "failed";

interface PhaseInfo {
  phase: IncubationPhase;
  dayOfCycle: number;
  progressPct: number;       // 0-100 across 21 days
  phasePct: number;          // 0-100 within current phase
  daysUntilHatch: number;
  hoursUntilHatch: number;
  idealTemp: number;
  idealHumidity: number;
  turningRequired: boolean;
  phaseLabel: string;
  phaseDesc: string;
  embryoStage: string;
}

function computePhase(cycle: CycleData): PhaseInfo {
  const day = daysSince(cycle.startDate);
  const daysLeft = daysUntil(cycle.expectedHatchDate);

  let phase: IncubationPhase;
  if (cycle.status === "completed") phase = "completed";
  else if (cycle.status === "failed") phase = "failed";
  else if (day >= 22) phase = "overdue";
  else if (day >= 19) phase = "hatching";
  else if (day >= 18) phase = "lockdown";
  else phase = "incubation";

  const progressPct = Math.min(100, Math.round((day / 21) * 100));

  let phasePct = 0;
  if (phase === "incubation") phasePct = Math.round((day / 18) * 100);
  else if (phase === "lockdown") phasePct = Math.round(((day - 18) / 1) * 100);
  else if (phase === "hatching") phasePct = Math.round(((day - 19) / 2) * 100);
  else phasePct = 100;

  // Ideal conditions per phase
  const idealTemp = (phase === "lockdown" || phase === "hatching") ? 37.2 : 37.7;
  const idealHumidity = (phase === "lockdown" || phase === "hatching") ? 70 : 55;
  const turningRequired = phase === "incubation" && day <= 17;

  // Embryo development stage by day
  const embryoStages: Record<number, string> = {
    1: "تكوين الجهاز العصبي", 2: "ظهور القلب", 3: "نبض القلب",
    4: "تشكّل الأطراف", 5: "تمايز الأعضاء", 6: "الجهاز الهضمي",
    7: "تكوّن العينين", 8: "الجهاز التنفسي", 9: "نمو المنقار",
    10: "ظهور الريش", 11: "الجهاز الهيكلي", 12: "نضج الأعضاء",
    13: "الطبقة الجلدية", 14: "استكمال الريش", 15: "دهون الجسم",
    16: "تكامل الأجهزة", 17: "آخر التقليبات", 18: "الانتقال للفقس",
    19: "ثقب الهواء", 20: "كسر القشرة", 21: "الخروج الكامل",
  };
  const embryoStage = embryoStages[Math.min(day, 21)] ?? "مكتمل";

  const phaseInfo: Record<IncubationPhase, { label: string; desc: string }> = {
    incubation: { label: "حضانة", desc: "تقليب منتظم مطلوب" },
    lockdown:   { label: "إغلاق", desc: "أوقف التقليب فوراً" },
    hatching:   { label: "فقس نشط", desc: "لا تفتح الماكينة" },
    overdue:    { label: "متأخرة", desc: "تأخر عن الموعد" },
    completed:  { label: "مكتملة", desc: "تمت عملية الفقس" },
    failed:     { label: "فاشلة", desc: "لم تنجح العملية" },
  };

  const now = new Date();
  const hatchTarget = parseDateStr(cycle.expectedHatchDate);
  const diffMs = hatchTarget.getTime() - now.getTime();
  const hoursUntilHatch = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60)));

  return {
    phase, dayOfCycle: day, progressPct, phasePct,
    daysUntilHatch: daysLeft, hoursUntilHatch,
    idealTemp, idealHumidity, turningRequired,
    phaseLabel: phaseInfo[phase].label,
    phaseDesc: phaseInfo[phase].desc,
    embryoStage,
  };
}

// ─── Smart Analysis ───────────────────────────────────────────────────────────

interface SmartAlert {
  level: "critical" | "warning" | "success" | "info";
  text: string;
}

function buildAlerts(cycle: CycleData, info: PhaseInfo, openings: HatchOpening[]): SmartAlert[] {
  const alerts: SmartAlert[] = [];

  // Missing data
  if (!cycle.startDate) alerts.push({ level: "critical", text: "تاريخ بداية الفقسة مفقود" });
  if (!cycle.temperature && !cycle.lockdownTemperature)
    alerts.push({ level: "warning", text: "لم يتم تسجيل درجة الحرارة" });
  if (!cycle.humidity && !cycle.lockdownHumidity)
    alerts.push({ level: "warning", text: "لم يتم تسجيل الرطوبة" });

  // Phase-specific
  if (info.phase === "incubation" && info.turningRequired)
    alerts.push({ level: "info", text: `اليوم ${info.dayOfCycle} — التقليب مطلوب ثلاث مرات يومياً` });
  if (info.phase === "lockdown")
    alerts.push({ level: "critical", text: "يوم الإغلاق — أوقف التقليب الآن ولا تفتح الباب" });
  if (info.phase === "hatching")
    alerts.push({ level: "warning", text: "فقس نشط — لا تفتح الماكينة إلا للضرورة القصوى" });
  if (info.phase === "overdue")
    alerts.push({ level: "critical", text: `تأخير ${Math.abs(info.daysUntilHatch)} يوم — راجع الإعدادات` });

  // Countdown
  if (info.daysUntilHatch === 1)
    alerts.push({ level: "warning", text: "🎉 موعد الفقس غداً — تأكد من توفر الماء والحرارة" });
  if (info.daysUntilHatch === 3)
    alerts.push({ level: "info", text: "بعد 3 أيام موعد الفقس — ابدأ بتحضير السقاة والعلف" });

  // Temperature check
  const temp = info.phase === "lockdown" ? (cycle.lockdownTemperature ?? cycle.temperature) : cycle.temperature;
  if (temp) {
    const diff = Math.abs(temp - info.idealTemp);
    if (diff > 1) alerts.push({ level: "critical", text: `الحرارة ${temp}°C بعيدة جداً عن المثالية ${info.idealTemp}°C` });
    else if (diff > 0.5) alerts.push({ level: "warning", text: `الحرارة ${temp}°C — قريبة من الحد (المثالي ${info.idealTemp}°C)` });
    else alerts.push({ level: "success", text: `الحرارة ممتازة: ${temp}°C` });
  }

  // Humidity check
  const humidity = info.phase === "lockdown" ? (cycle.lockdownHumidity ?? cycle.humidity) : cycle.humidity;
  if (humidity) {
    const diff = Math.abs(humidity - info.idealHumidity);
    if (diff > 10) alerts.push({ level: "critical", text: `الرطوبة ${humidity}% بعيدة عن المثالية ${info.idealHumidity}%` });
    else if (diff > 5) alerts.push({ level: "warning", text: `الرطوبة ${humidity}% — ابعد قليلاً (المثالي ${info.idealHumidity}%)` });
  }

  // Openings count warning
  if (openings.length > 3 && info.phase === "hatching")
    alerts.push({ level: "warning", text: `فُتحت الماكينة ${openings.length} مرات — كل فتح يقلل نسبة النجاح` });

  // No results after expected hatch
  if (info.phase === "overdue" && openings.length === 0)
    alerts.push({ level: "critical", text: "لم يتم تسجيل أي فتحة — سجّل النتائج الآن" });

  return alerts;
}

function buildAIAnalysis(cycle: CycleData, info: PhaseInfo, openings: HatchOpening[]): string[] {
  const lines: string[] = [];
  const totalChicks = openings.reduce((s, o) => s + o.chicksCount, 0);
  const hatchRate = totalChicks > 0 ? Math.round((totalChicks / cycle.eggsSet) * 100) : null;
  const finalRate = cycle.eggsHatched != null ? Math.round((cycle.eggsHatched / cycle.eggsSet) * 100) : hatchRate;

  if (info.phase === "completed" || info.phase === "overdue") {
    if (finalRate != null) {
      if (finalRate >= 80) lines.push(`✅ فقسة ممتازة — نسبة ${finalRate}% تتجاوز المعدل الصناعي (75%)`);
      else if (finalRate >= 60) lines.push(`⚡ فقسة جيدة — نسبة ${finalRate}% مقبولة، يمكن تحسينها`);
      else if (finalRate >= 40) lines.push(`⚠️ فقسة ضعيفة — نسبة ${finalRate}% تحت المتوسط`);
      else lines.push(`❌ نسبة ${finalRate}% ضعيفة جداً — يجب مراجعة جميع الإعدادات`);
    }
  } else if (info.phase === "incubation") {
    lines.push(`📅 اليوم ${info.dayOfCycle} من 21 — ${info.embryoStage}`);
    if (info.turningRequired) lines.push("🔄 التقليب مطلوب: صباحاً + ظهراً + مساءً");
  } else if (info.phase === "lockdown") {
    lines.push("🔒 دخلت مرحلة الإغلاق — أوقف التقليب ورفع الرطوبة إلى 70%");
  } else if (info.phase === "hatching") {
    lines.push(`🐣 الفقس جارٍ — بيض في الماكينة: ${cycle.eggsSet}`);
    if (totalChicks > 0) lines.push(`✅ تم تسجيل ${totalChicks} صوص حتى الآن (${Math.round((totalChicks / cycle.eggsSet) * 100)}%)`);
  }

  // Temperature analysis
  const temp = cycle.temperature;
  if (temp && info.phase === "incubation") {
    if (temp < 37.2) lines.push(`🌡️ الحرارة منخفضة (${temp}°C) → الفقس سيتأخر يوماً أو أكثر`);
    else if (temp > 38.5) lines.push(`🔥 الحرارة مرتفعة جداً (${temp}°C) → خطر موت الجنين`);
  }

  // What to do today
  if (info.phase === "incubation") {
    const nextLockdown = Math.max(0, 18 - info.dayOfCycle);
    if (nextLockdown > 0) lines.push(`📌 اليوم ${nextLockdown} يوم متبقي للإغلاق`);
  }

  return lines;
}

// ─── Phase Colors ─────────────────────────────────────────────────────────────

const PHASE_COLORS: Record<IncubationPhase, { bg: string; text: string; border: string; badge: string }> = {
  incubation: { bg: "bg-blue-50 dark:bg-blue-950/30",    text: "text-blue-700 dark:text-blue-300",   border: "border-blue-200 dark:border-blue-800",   badge: "bg-blue-100 text-blue-800" },
  lockdown:   { bg: "bg-amber-50 dark:bg-amber-950/30",  text: "text-amber-700 dark:text-amber-300", border: "border-amber-200 dark:border-amber-800",  badge: "bg-amber-100 text-amber-800" },
  hatching:   { bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-800", badge: "bg-emerald-100 text-emerald-800" },
  overdue:    { bg: "bg-red-50 dark:bg-red-950/30",      text: "text-red-700 dark:text-red-300",     border: "border-red-200 dark:border-red-800",     badge: "bg-red-100 text-red-800" },
  completed:  { bg: "bg-slate-50 dark:bg-slate-900/40",  text: "text-slate-600 dark:text-slate-400", border: "border-slate-200 dark:border-slate-700",  badge: "bg-slate-100 text-slate-700" },
  failed:     { bg: "bg-red-50 dark:bg-red-950/30",      text: "text-red-600 dark:text-red-400",     border: "border-red-200 dark:border-red-700",     badge: "bg-red-100 text-red-800" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function AlertRow({ alert }: { alert: SmartAlert }) {
  const icons = {
    critical: <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />,
    warning:  <AlertCircle  className="w-3.5 h-3.5 text-amber-500 shrink-0" />,
    success:  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />,
    info:     <Info         className="w-3.5 h-3.5 text-blue-500 shrink-0" />,
  };
  const textColors = {
    critical: "text-red-700 dark:text-red-300",
    warning:  "text-amber-700 dark:text-amber-300",
    success:  "text-emerald-700 dark:text-emerald-300",
    info:     "text-blue-700 dark:text-blue-300",
  };
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-border/30 last:border-0">
      {icons[alert.level]}
      <span className={`text-xs leading-snug ${textColors[alert.level]}`}>{alert.text}</span>
    </div>
  );
}

// Day progress bar — Day 1 to 21
function DayProgressBar({ day, phase }: { day: number; phase: IncubationPhase }) {
  const clampedDay = Math.min(Math.max(day, 0), 21);
  const segments = [
    { label: "حضانة", days: 18, color: "bg-blue-400" },
    { label: "إغلاق", days: 1,  color: "bg-amber-400" },
    { label: "فقس",   days: 2,  color: "bg-emerald-400" },
  ];
  const totalDays = 21;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>اليوم 1</span>
        <span className="font-semibold text-foreground text-xs">اليوم {Math.max(1, clampedDay)} / 21</span>
        <span>اليوم 21</span>
      </div>
      <div className="flex gap-0.5 h-3 rounded overflow-hidden">
        {segments.map((seg) => {
          const filled = Math.min(clampedDay, seg.days);
          const prev = segments.slice(0, segments.indexOf(seg)).reduce((s, x) => s + x.days, 0);
          const activeDays = Math.max(0, Math.min(clampedDay - prev, seg.days));
          const pct = (activeDays / seg.days) * 100;
          return (
            <div
              key={seg.label}
              className="relative rounded"
              style={{ flex: seg.days / totalDays }}
            >
              <div className="w-full h-full bg-muted rounded" />
              <div
                className={`absolute inset-y-0 left-0 rounded ${seg.color} transition-all`}
                style={{ width: `${pct}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-0.5 text-[9px] text-muted-foreground">
        {segments.map(s => (
          <span key={s.label} style={{ flex: s.days / totalDays }} className="text-center">{s.label}</span>
        ))}
      </div>
    </div>
  );
}

// ─── Hatch Openings Panel ─────────────────────────────────────────────────────

function HatchOpeningsPanel({ cycleId, eggsSet }: { cycleId: number; eggsSet: number }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [chicksCount, setChicksCount] = useState("");
  const [openedAt, setOpenedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState("");

  const { data: openings = [] } = useQuery<HatchOpening[]>({
    queryKey: ["hatch-openings", cycleId],
    queryFn: () => apiFetch(`/hatching-cycles/${cycleId}/openings`),
    refetchInterval: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: (data: { chicksCount: number; openedAt: string; notes: string }) =>
      apiFetch(`/hatching-cycles/${cycleId}/openings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hatch-openings", cycleId] });
      setChicksCount(""); setNotes(""); setShowForm(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/hatch-openings/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hatch-openings", cycleId] }),
  });

  const totalChicks = openings.reduce((s, o) => s + o.chicksCount, 0);
  const hatchRate = eggsSet > 0 ? Math.round((totalChicks / eggsSet) * 100) : 0;

  const formatDT = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("ar-IQ", { day: "numeric", month: "short" }) + " " +
           d.toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="space-y-3">
      {/* Summary row */}
      {openings.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-2 text-center">
            <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{totalChicks}</div>
            <div className="text-[10px] text-muted-foreground">صوص إجمالي</div>
          </div>
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-2 text-center">
            <div className="text-lg font-bold text-blue-700 dark:text-blue-300">{hatchRate}%</div>
            <div className="text-[10px] text-muted-foreground">نسبة الفقس</div>
          </div>
          <div className="rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 p-2 text-center">
            <div className="text-lg font-bold text-slate-700 dark:text-slate-300">{openings.length}</div>
            <div className="text-[10px] text-muted-foreground">فتحات</div>
          </div>
        </div>
      )}

      {/* Opening list */}
      {openings.length > 0 && (
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {openings.map((o, i) => (
            <div key={o.id} className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs font-mono">#{i + 1}</span>
                <span className="font-semibold text-foreground">{o.chicksCount} صوص</span>
                <span className="text-muted-foreground text-xs">{formatDT(o.openedAt)}</span>
              </div>
              <div className="flex items-center gap-2">
                {o.notes && <span className="text-xs text-muted-foreground truncate max-w-[120px]">{o.notes}</span>}
                <button
                  onClick={() => deleteMutation.mutate(o.id)}
                  className="text-muted-foreground/50 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add opening form */}
      {showForm ? (
        <div className="bg-muted/30 rounded-lg border border-border p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">عدد الصيصان</label>
              <Input
                type="number" min="0" placeholder="0"
                value={chicksCount}
                onChange={e => setChicksCount(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">الوقت</label>
              <Input
                type="datetime-local"
                value={openedAt}
                onChange={e => setOpenedAt(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <Input
            placeholder="ملاحظات (اختياري)"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="h-8 text-sm"
          />
          <div className="flex gap-2">
            <Button
              size="sm" className="flex-1 h-8 text-xs"
              onClick={() => addMutation.mutate({
                chicksCount: parseInt(chicksCount) || 0,
                openedAt: new Date(openedAt).toISOString(),
                notes,
              })}
              disabled={addMutation.isPending || !chicksCount}
            >
              {addMutation.isPending ? "جاري الحفظ…" : "حفظ الفتحة"}
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowForm(false)}>
              إلغاء
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline" size="sm"
          className="w-full h-8 text-xs border-dashed gap-1.5"
          onClick={() => setShowForm(true)}
        >
          <Plus className="w-3.5 h-3.5" />
          تسجيل فتحة جديدة
        </Button>
      )}
    </div>
  );
}

// ─── Daily Log Panel ──────────────────────────────────────────────────────────

function DailyLogPanel({ cycleId }: { cycleId: number }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().split("T")[0];
  const [showForm, setShowForm] = useState(false);
  const [temp, setTemp] = useState("");
  const [hum, setHum] = useState("");
  const [turning, setTurning] = useState(false);
  const [notes, setNotes] = useState("");
  const [issues, setIssues] = useState("");

  const { data: logs = [] } = useQuery<DailyLog[]>({
    queryKey: ["daily-logs", cycleId],
    queryFn: () => apiFetch(`/hatching-cycles/${cycleId}/daily-logs`),
    refetchInterval: 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: (data: object) =>
      apiFetch(`/hatching-cycles/${cycleId}/daily-logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-logs", cycleId] });
      setShowForm(false);
    },
  });

  const todayLog = logs.find(l => l.logDate === today);

  return (
    <div className="space-y-3">
      {/* Recent logs */}
      {logs.slice(0, 3).map(l => (
        <div key={l.id} className="flex items-start gap-2 bg-muted/30 rounded-lg px-3 py-2 text-xs">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-medium text-foreground">{l.logDate}</span>
              {l.temperature && <span className="text-muted-foreground">{l.temperature}°C</span>}
              {l.humidity && <span className="text-muted-foreground">{l.humidity}%</span>}
              {l.turningDone && <CheckSquare className="w-3 h-3 text-emerald-500" />}
            </div>
            {l.notes && <p className="text-muted-foreground truncate">{l.notes}</p>}
            {l.issues && <p className="text-red-500 truncate">⚠ {l.issues}</p>}
          </div>
        </div>
      ))}

      {/* Form */}
      {showForm ? (
        <div className="bg-muted/30 rounded-lg border border-border p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">سجل يوم {today}</p>
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" placeholder="الحرارة °C" value={temp} onChange={e => setTemp(e.target.value)} className="h-8 text-sm" />
            <Input type="number" placeholder="الرطوبة %" value={hum} onChange={e => setHum(e.target.value)} className="h-8 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={turning} onChange={e => setTurning(e.target.checked)} className="rounded" />
            تم التقليب اليوم
          </label>
          <Textarea placeholder="ملاحظات اليوم" value={notes} onChange={e => setNotes(e.target.value)} className="text-sm min-h-[60px]" />
          <Textarea placeholder="مشاكل أو أخطاء" value={issues} onChange={e => setIssues(e.target.value)} className="text-sm min-h-[50px]" />
          <div className="flex gap-2">
            <Button
              size="sm" className="flex-1 h-8 text-xs"
              onClick={() => saveMutation.mutate({
                logDate: today,
                temperature: temp ? parseFloat(temp) : null,
                humidity: hum ? parseFloat(hum) : null,
                turningDone: turning,
                notes: notes || null,
                issues: issues || null,
              })}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "جاري الحفظ…" : "حفظ السجل"}
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowForm(false)}>
              إلغاء
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline" size="sm"
          className="w-full h-8 text-xs border-dashed gap-1.5"
          onClick={() => setShowForm(true)}
        >
          <Plus className="w-3.5 h-3.5" />
          {todayLog ? "تحديث سجل اليوم" : "إضافة سجل اليوم"}
        </Button>
      )}
    </div>
  );
}

// ─── Single Cycle Card ────────────────────────────────────────────────────────

function CycleMonitorCard({ cycle, incubatorName }: { cycle: CycleData; incubatorName: string }) {
  const info = useMemo(() => computePhase(cycle), [cycle]);
  const colors = PHASE_COLORS[info.phase];
  const [activeTab, setActiveTab] = useState<"overview" | "openings" | "log" | "analysis">("overview");

  const { data: openings = [] } = useQuery<HatchOpening[]>({
    queryKey: ["hatch-openings", cycle.id],
    queryFn: () => apiFetch(`/hatching-cycles/${cycle.id}/openings`),
  });

  const alerts = useMemo(() => buildAlerts(cycle, info, openings), [cycle, info, openings]);
  const analysis = useMemo(() => buildAIAnalysis(cycle, info, openings), [cycle, info, openings]);

  const totalChicks = openings.reduce((s, o) => s + o.chicksCount, 0);
  const hatchPct = cycle.eggsSet > 0 ? Math.round(((cycle.eggsHatched ?? totalChicks) / cycle.eggsSet) * 100) : 0;

  const temp = info.phase === "lockdown" || info.phase === "hatching"
    ? (cycle.lockdownTemperature ?? cycle.temperature)
    : cycle.temperature;
  const humidity = info.phase === "lockdown" || info.phase === "hatching"
    ? (cycle.lockdownHumidity ?? cycle.humidity)
    : cycle.humidity;

  const tabs = [
    { id: "overview" as const, label: "نظرة عامة" },
    { id: "openings" as const, label: `فتحات (${openings.length})` },
    { id: "log" as const, label: "يومي" },
    { id: "analysis" as const, label: "تحليل" },
  ];

  const formatDate = (d: string) => {
    return new Date(d + "T12:00:00").toLocaleDateString("ar-IQ", {
      day: "numeric", month: "long", year: "numeric",
    });
  };

  return (
    <div className={`rounded-xl border-2 ${colors.border} overflow-hidden`}>
      {/* ── Header ── */}
      <div className={`${colors.bg} px-4 py-3`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-base text-foreground truncate">{cycle.batchName}</h3>
              <Badge className={`text-[10px] px-2 py-0.5 font-semibold ${colors.badge}`}>
                {info.phaseLabel}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{incubatorName}</p>
          </div>
          <div className="text-left shrink-0">
            <div className={`text-2xl font-black ${colors.text}`}>
              {info.phase === "completed" || info.phase === "failed" ? `${hatchPct}%` : `يوم ${info.dayOfCycle}`}
            </div>
            <div className="text-[10px] text-muted-foreground text-left">
              {info.phase === "completed" || info.phase === "failed" ? "نسبة الفقس" : "من 21"}
            </div>
          </div>
        </div>

        {/* Day progress bar */}
        {cycle.status !== "completed" && cycle.status !== "failed" && (
          <div className="mt-3">
            <DayProgressBar day={info.dayOfCycle} phase={info.phase} />
          </div>
        )}
      </div>

      {/* ── Date + countdown row ── */}
      <div className="grid grid-cols-2 divide-x divide-border/50 rtl:divide-x-reverse border-b border-border/30">
        <div className="px-3 py-2 text-center">
          <div className="text-[10px] text-muted-foreground mb-0.5">تاريخ البداية</div>
          <div className="text-xs font-semibold text-foreground">{formatDate(cycle.startDate)}</div>
          {cycle.setTime && <div className="text-[10px] text-muted-foreground">الساعة {cycle.setTime}</div>}
        </div>
        <div className="px-3 py-2 text-center">
          <div className="text-[10px] text-muted-foreground mb-0.5">موعد الفقس</div>
          <div className="text-xs font-semibold text-foreground">{formatDate(cycle.expectedHatchDate)}</div>
          {info.daysUntilHatch > 0 && info.phase !== "completed" && (
            <div className="text-[10px] text-amber-600 font-medium">
              بعد {info.daysUntilHatch} يوم
            </div>
          )}
          {info.daysUntilHatch <= 0 && info.phase === "hatching" && (
            <div className="text-[10px] text-emerald-600 font-medium animate-pulse">🎉 الآن!</div>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex border-b border-border/30 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors
              ${activeTab === tab.id
                ? `${colors.text} border-b-2 ${colors.border}`
                : "text-muted-foreground hover:text-foreground"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className="p-4">
        {activeTab === "overview" && (
          <div className="space-y-4">
            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: Egg,         label: "بيض في الماكينة", value: cycle.eggsSet.toString(),   color: "text-blue-600" },
                { icon: Bird,        label: "صيصان خارجة",     value: (cycle.eggsHatched ?? totalChicks).toString(), color: "text-emerald-600" },
                { icon: Thermometer, label: "الحرارة الحالية", value: temp ? `${temp}°C` : "—",   color: temp && Math.abs(temp - info.idealTemp) <= 0.5 ? "text-emerald-600" : "text-amber-600" },
                { icon: Droplets,    label: "الرطوبة الحالية", value: humidity ? `${humidity}%` : "—", color: "text-blue-600" },
              ].map(s => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className="bg-muted/30 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className={`w-3.5 h-3.5 ${s.color}`} />
                      <span className="text-[10px] text-muted-foreground">{s.label}</span>
                    </div>
                    <div className={`text-base font-bold ${s.color}`}>{s.value}</div>
                  </div>
                );
              })}
            </div>

            {/* Ideal conditions */}
            <div className="bg-muted/20 rounded-lg px-3 py-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">المثالي لهذه المرحلة:</span>
              <div className="flex gap-3">
                <span className="font-medium">{info.idealTemp}°C</span>
                <span className="font-medium">{info.idealHumidity}%</span>
                <span className="text-muted-foreground">{info.turningRequired ? "تقليب ✓" : "بدون تقليب"}</span>
              </div>
            </div>

            {/* Embryo stage */}
            {cycle.status === "incubating" && (
              <div className="flex items-center gap-2 text-xs bg-blue-50 dark:bg-blue-950/30 rounded-lg px-3 py-2">
                <Activity className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span className="text-blue-700 dark:text-blue-300">مرحلة الجنين: <strong>{info.embryoStage}</strong></span>
              </div>
            )}

            {/* Notes */}
            {cycle.notes && (
              <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                <span className="font-medium text-foreground">ملاحظات: </span>{cycle.notes}
              </div>
            )}

            {/* Alerts */}
            {alerts.length > 0 && (
              <div className="border border-border/40 rounded-lg overflow-hidden">
                <div className="px-3 py-1.5 bg-muted/30 border-b border-border/30 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  تنبيهات النظام
                </div>
                <div className="px-3 py-1">
                  {alerts.slice(0, 4).map((a, i) => <AlertRow key={i} alert={a} />)}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "openings" && (
          <HatchOpeningsPanel cycleId={cycle.id} eggsSet={cycle.eggsSet} />
        )}

        {activeTab === "log" && (
          <DailyLogPanel cycleId={cycle.id} />
        )}

        {activeTab === "analysis" && (
          <div className="space-y-2">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              مخ ذكي للتفقيس — تحليل آلي
            </div>
            {analysis.map((line, i) => (
              <div key={i} className="text-sm leading-relaxed bg-muted/30 rounded-lg px-3 py-2">
                {line}
              </div>
            ))}
            {analysis.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">لا يوجد تحليل متاح حالياً</p>
            )}
            {/* Technical details */}
            <div className="mt-3 border-t border-border/30 pt-3 text-[10px] text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>الحرارة المثالية لهذه المرحلة:</span>
                <span className="font-medium">{info.idealTemp}°C</span>
              </div>
              <div className="flex justify-between">
                <span>الرطوبة المثالية:</span>
                <span className="font-medium">{info.idealHumidity}%</span>
              </div>
              <div className="flex justify-between">
                <span>التقليب مطلوب:</span>
                <span className="font-medium">{info.turningRequired ? "نعم" : "لا"}</span>
              </div>
              <div className="flex justify-between">
                <span>الأيام الماضية:</span>
                <span className="font-medium">{info.dayOfCycle} يوم</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type ConnMode = "connecting" | "sse" | "poll";

export default function HatchingMonitorPro() {
  const { lang } = useLanguage();
  const ar = lang === "ar";

  const clockOffsetRef = useRef(0);
  const sseErrorsRef   = useRef(0);
  const [liveCycles,  setLiveCycles]  = useState<CycleData[]>([]);
  const [loaded,      setLoaded]      = useState(false);
  const [connMode,    setConnMode]    = useState<ConnMode>("connecting");
  const [activeInc,   setActiveInc]   = useState<number | null>(null);  // null = "all"

  // ── Fetch incubators ────────────────────────────────────────────────────────
  const { data: incubators = [] } = useQuery<Incubator[]>({
    queryKey: ["incubators-monitor"],
    queryFn: () => apiFetch("/incubators"),
    refetchInterval: 60_000,
  });

  // ── SSE + fallback polling ──────────────────────────────────────────────────
  const base = import.meta.env.BASE_URL ?? "/";
  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    function applyData(serverTime: number, data: CycleData[]) {
      if (cancelled) return;
      clockOffsetRef.current = serverTime - Date.now();
      setLiveCycles(data);
      setLoaded(true);
    }

    async function poll() {
      try {
        const data: CycleData[] = await apiFetch("/dashboard/active-cycles");
        applyData(Date.now(), data);
      } catch { /* silent */ }
    }

    function startPolling() {
      if (cancelled) return;
      setConnMode("poll");
      poll();
      pollTimer = setInterval(poll, 30_000);
    }

    function connect() {
      if (cancelled) return;
      try {
        es = new EventSource(`${base}api/hatching/live-stream`, { withCredentials: true });
        es.onopen = () => { if (!cancelled) { sseErrorsRef.current = 0; setConnMode("sse"); } };
        es.onmessage = (ev) => {
          try {
            const p = JSON.parse(ev.data) as { serverTime: number; cycles: CycleData[] };
            applyData(p.serverTime, p.cycles);
            if (!cancelled) setConnMode("sse");
          } catch { /* malformed */ }
        };
        es.onerror = () => {
          es?.close(); es = null;
          sseErrorsRef.current++;
          if (sseErrorsRef.current >= 3) startPolling();
          else if (!cancelled) setTimeout(connect, 5_000);
        };
      } catch { startPolling(); }
    }

    connect();
    return () => { cancelled = true; es?.close(); if (pollTimer) clearInterval(pollTimer); };
  }, [base]);

  // ── Filter cycles ───────────────────────────────────────────────────────────
  const displayCycles = useMemo(() => {
    if (activeInc === null) return liveCycles;
    return liveCycles.filter(c => c.incubatorId === activeInc);
  }, [liveCycles, activeInc]);

  // ── Incubators with active cycles ───────────────────────────────────────────
  const activeIncubators = useMemo(() => {
    return incubators.filter(inc =>
      liveCycles.some(c => c.incubatorId === inc.id)
    );
  }, [incubators, liveCycles]);

  const getIncubatorName = (id: number | null) => {
    if (!id) return ar ? "غير محدد" : "Okänd";
    return incubators.find(i => i.id === id)?.name ?? `#${id}`;
  };

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (!loaded) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Egg className="w-5 h-5 text-blue-500 animate-pulse" />
          <span className="text-sm font-semibold">{ar ? "مراقب التفقيس المباشر" : "Live Kläckningsövervakare"}</span>
        </div>
        <Card><CardContent className="pt-4 pb-4"><Skeleton className="h-40 w-full" /></CardContent></Card>
      </div>
    );
  }

  // ── Empty ───────────────────────────────────────────────────────────────────
  if (liveCycles.length === 0) {
    return (
      <Card className="border-dashed border-border/50">
        <CardContent className="pt-5 pb-5 flex items-center gap-3 text-muted-foreground">
          <Egg className="w-5 h-5 shrink-0 opacity-40" />
          <div>
            <p className="text-sm font-medium">{ar ? "لا توجد فقسة نشطة حالياً" : "Ingen aktiv kläckningscykel"}</p>
            <p className="text-xs opacity-60 mt-0.5">{ar ? "أضف فقسة جديدة من صفحة التفقيس" : "Lägg till en ny cykel"}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Egg className="w-5 h-5 text-blue-600" />
            {connMode === "sse" && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </div>
          <h2 className="text-base font-bold text-foreground">
            {ar ? "مراقب التفقيس المباشر" : "Live Kläckningsövervakare"}
          </h2>
          <Badge variant="outline" className="text-[10px] px-2 font-medium">
            {liveCycles.length} {ar ? "فقسة نشطة" : "aktiva"}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          {connMode === "sse"  && <><Wifi className="w-3 h-3 text-emerald-500" /><span className="text-emerald-600 dark:text-emerald-400 font-medium">{ar ? "مباشر" : "Live"}</span></>}
          {connMode === "poll" && <><RefreshCw className="w-3 h-3 text-amber-500" /><span className="text-amber-600 font-medium">{ar ? "دوري" : "Polling"}</span></>}
          {connMode === "connecting" && <><WifiOff className="w-3 h-3 text-muted-foreground animate-pulse" /><span className="text-muted-foreground">{ar ? "جاري…" : "Ansluter…"}</span></>}
        </div>
      </div>

      {/* Incubator filter tabs */}
      {activeIncubators.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveInc(null)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors
              ${activeInc === null
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
          >
            {ar ? "الكل" : "Alla"} ({liveCycles.length})
          </button>
          {activeIncubators.map(inc => (
            <button
              key={inc.id}
              onClick={() => setActiveInc(inc.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                ${activeInc === inc.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
            >
              {inc.name}
            </button>
          ))}
        </div>
      )}

      {/* Cycle cards */}
      <div className={`grid gap-4 ${displayCycles.length > 1 ? "lg:grid-cols-2" : ""}`}>
        {displayCycles.map(cycle => (
          <CycleMonitorCard
            key={cycle.id}
            cycle={cycle}
            incubatorName={getIncubatorName(cycle.incubatorId)}
          />
        ))}
      </div>

      {/* Footer */}
      <p className="text-[10px] text-muted-foreground/50 flex items-center justify-end gap-1">
        <Clock className="w-3 h-3" />
        {ar ? "يتحدث كل 30 ثانية · البيانات مباشرة من الخادم" : "Uppdateras var 30:e sekund"}
      </p>
    </div>
  );
}
