import { useEffect, useState, useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  RefreshCw,
  Sun,
  Sunrise,
  Sunset,
  Moon,
  CloudSun,
  Egg,
  AlertTriangle,
  ShieldAlert,
  Thermometer,
  Droplets,
  Activity,
  TrendingUp,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Timer,
  Bird,
  ShieldCheck,
  CircleDot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiPath } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HatchingCycle {
  id: number;
  incubator_id?: number;
  incubator_name?: string;
  start_date: string;
  expected_hatch_date?: string;
  hatch_date?: string;
  status: string;
  egg_count?: number;
  fertile_count?: number;
  hatched_count?: number;
  notes?: string;
}

interface Incubator {
  id: number;
  name: string;
  type?: string;
  capacity?: number;
  temperature?: number;
  humidity?: number;
  status?: string;
}

interface FarmTask {
  id: number;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  due_date?: string;
  completed?: boolean;
}

interface DashboardSummary {
  total_chickens?: number;
  total_eggs_today?: number;
  active_incubators?: number;
  active_cycles?: number;
  mortality_rate?: number;
  feed_stock?: number;
  [key: string]: unknown;
}

interface FarmAnalytics {
  daily_egg_production?: number;
  weekly_egg_production?: number;
  feed_consumption?: number;
  mortality_count?: number;
  revenue?: number;
  expenses?: number;
  [key: string]: unknown;
}

type Priority = "critical" | "high" | "normal";
type TimeBlock = "morning" | "mid-morning" | "noon" | "afternoon" | "evening";

interface PlanTask {
  id: string;
  time: string;
  block: TimeBlock;
  icon: React.ReactNode;
  title: string;
  titleSv: string;
  description: string;
  descriptionSv: string;
  priority: Priority;
  source: "system" | "cycle" | "incubator" | "task" | "analytics";
  cycleId?: number;
}

interface RiskItem {
  level: "critical" | "high" | "medium";
  message: string;
  messageSv: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LABELS = {
  title: { ar: "الخطة اليومية", sv: "Daglig plan" },
  subtitle: { ar: "جدول ذكي مبني على بيانات المزرعة الحقيقية", sv: "Smart schema baserat på verklig gårdsdata" },
  refresh: { ar: "تحديث", sv: "Uppdatera" },
  progress: { ar: "تقدّم اليوم", sv: "Dagens framsteg" },
  tasks: { ar: "مهام", sv: "uppgifter" },
  completed: { ar: "مكتمل", sv: "Klart" },
  allDone: { ar: "أحسنت! أنجزت جميع مهام اليوم 🎉", sv: "Bra jobbat! Alla dagens uppgifter är klara 🎉" },
  activeCycles: { ar: "دورات التفريخ النشطة", sv: "Aktiva kläckningscykler" },
  day: { ar: "اليوم", sv: "Dag" },
  of: { ar: "من", sv: "av" },
  daysLeft: { ar: "أيام متبقية", sv: "dagar kvar" },
  hatchExpected: { ar: "موعد الفقس المتوقع", sv: "Förväntad kläckning" },
  eggs: { ar: "بيضة", sv: "ägg" },
  riskAssessment: { ar: "تقييم المخاطر", sv: "Riskbedömning" },
  noRisks: { ar: "لا توجد مخاطر حالياً ✓", sv: "Inga risker just nu ✓" },
  dailyStats: { ar: "إحصائيات اليوم", sv: "Dagens statistik" },
  totalChickens: { ar: "إجمالي الدجاج", sv: "Totalt antal höns" },
  eggsToday: { ar: "بيض اليوم", sv: "Ägg idag" },
  activeIncubators: { ar: "حاضنات نشطة", sv: "Aktiva kuvöser" },
  feedStock: { ar: "مخزون العلف", sv: "Foderlager" },
  morning: { ar: "🌅 الصباح الباكر", sv: "🌅 Tidig morgon" },
  "mid-morning": { ar: "☀️ منتصف الصباح", sv: "☀️ Förmiddag" },
  noon: { ar: "🌤️ الظهيرة", sv: "🌤️ Middag" },
  afternoon: { ar: "🌇 بعد الظهر", sv: "🌇 Eftermiddag" },
  evening: { ar: "🌙 المساء", sv: "🌙 Kväll" },
  morningTime: { ar: "06:00 – 08:00", sv: "06:00 – 08:00" },
  "mid-morningTime": { ar: "08:00 – 10:00", sv: "08:00 – 10:00" },
  noonTime: { ar: "12:00 – 14:00", sv: "12:00 – 14:00" },
  afternoonTime: { ar: "14:00 – 16:00", sv: "14:00 – 16:00" },
  eveningTime: { ar: "18:00 – 20:00", sv: "18:00 – 20:00" },
  critical: { ar: "حرج", sv: "Kritisk" },
  high: { ar: "عالي", sv: "Hög" },
  normal: { ar: "عادي", sv: "Normal" },
  overdue: { ar: "متأخر", sv: "Försenad" },
  today: { ar: "اليوم!", sv: "Idag!" },
  restricted: { ar: "هذه الصفحة للمشرفين فقط", sv: "Denna sida är bara för administratörer" },
  restrictedDesc: { ar: "تحتاج صلاحية المشرف للوصول إلى الخطة اليومية", sv: "Du behöver administratörsbehörighet för att se daglig plan" },
  loading: { ar: "جارٍ تحميل بيانات المزرعة...", sv: "Laddar gårdsdata..." },
  noData: { ar: "لا توجد بيانات حالياً", sv: "Inga data tillgängliga" },
  showMore: { ar: "عرض المزيد", sv: "Visa mer" },
  showLess: { ar: "عرض أقل", sv: "Visa mindre" },
  now: { ar: "الآن", sv: "Nu" },
  kg: { ar: "كجم", sv: "kg" },
  revenue: { ar: "الإيرادات", sv: "Intäkter" },
  expenses: { ar: "المصاريف", sv: "Kostnader" },
  production: { ar: "الإنتاج", sv: "Produktion" },
  hatching: { ar: "تفقيس", sv: "Kläckning" },
  fertile: { ar: "مخصبة", sv: "Fertila" },
} as const;

function label(key: keyof typeof LABELS, ar: boolean): string {
  return LABELS[key]?.[ar ? "ar" : "sv"] ?? key;
}

function daysBetween(a: string, b: string): number {
  const d1 = new Date(a);
  const d2 = new Date(b);
  return Math.ceil((d2.getTime() - d1.getTime()) / 86_400_000);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(d: string, ar: boolean): string {
  try {
    return new Date(d).toLocaleDateString(ar ? "ar-SA" : "sv-SE", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

function getGreeting(ar: boolean): string {
  const h = new Date().getHours();
  if (h < 12) return ar ? "صباح الخير ☀️" : "God morgon ☀️";
  if (h < 17) return ar ? "مساء الخير 🌤️" : "God eftermiddag 🌤️";
  return ar ? "مساء النور 🌙" : "God kväll 🌙";
}

function getCurrentBlock(): TimeBlock | null {
  const h = new Date().getHours();
  if (h >= 6 && h < 8) return "morning";
  if (h >= 8 && h < 10) return "mid-morning";
  if (h >= 12 && h < 14) return "noon";
  if (h >= 14 && h < 16) return "afternoon";
  if (h >= 18 && h < 20) return "evening";
  return null;
}

const BLOCK_ORDER: TimeBlock[] = ["morning", "mid-morning", "noon", "afternoon", "evening"];
const BLOCK_HOURS: Record<TimeBlock, number> = {
  morning: 6,
  "mid-morning": 8,
  noon: 12,
  afternoon: 14,
  evening: 18,
};

// ---------------------------------------------------------------------------
// Task generation from real data
// ---------------------------------------------------------------------------

function generateTasks(
  cycles: HatchingCycle[],
  incubators: Incubator[],
  tasks: FarmTask[],
  summary: DashboardSummary | null,
  analytics: FarmAnalytics | null,
): PlanTask[] {
  const today = todayStr();
  const plan: PlanTask[] = [];
  let id = 0;
  const nextId = () => `task-${++id}`;

  const activeCycles = cycles.filter(
    (c) => c.status === "active" || c.status === "incubating",
  );

  const hatchingSoon = activeCycles.filter((c) => {
    if (!c.expected_hatch_date) return false;
    const left = daysBetween(today, c.expected_hatch_date);
    return left >= 0 && left <= 3;
  });

  const needsTurning = activeCycles.filter((c) => {
    const day = daysBetween(c.start_date, today);
    return day >= 1 && day <= 18;
  });

  // ── Morning (06:00–08:00) ──

  if (activeCycles.length > 0) {
    plan.push({
      id: nextId(),
      time: "06:00",
      block: "morning",
      icon: <Thermometer className="w-4 h-4" />,
      title: `فحص الحاضنات (${activeCycles.length} نشطة)`,
      titleSv: `Kontrollera kuvöser (${activeCycles.length} aktiva)`,
      description: `تأكد من درجة الحرارة (37.5°C) والرطوبة (55-65%) في جميع الحاضنات النشطة`,
      descriptionSv: `Kontrollera temperatur (37.5°C) och luftfuktighet (55-65%) i alla aktiva kuvöser`,
      priority: hatchingSoon.length > 0 ? "critical" : "high",
      source: "incubator",
    });
  }

  plan.push({
    id: nextId(),
    time: "06:30",
    block: "morning",
    icon: <Bird className="w-4 h-4" />,
    title: "تقديم العلف الصباحي",
    titleSv: "Morgonfodring",
    description: summary?.total_chickens
      ? `إطعام ${summary.total_chickens} دجاجة – العلف الصباحي الرئيسي`
      : "تقديم وجبة العلف الصباحية الرئيسية للقطيع",
    descriptionSv: summary?.total_chickens
      ? `Fodra ${summary.total_chickens} höns – huvudfodring på morgonen`
      : "Ge morgonens huvudfoder till besättningen",
    priority: "high",
    source: "system",
  });

  plan.push({
    id: nextId(),
    time: "07:00",
    block: "morning",
    icon: <Droplets className="w-4 h-4" />,
    title: "فحص المياه والمشارب",
    titleSv: "Kontrollera vatten och drickare",
    description: "تأكد من نظافة وامتلاء جميع مصادر المياه",
    descriptionSv: "Kontrollera att alla vattenkällor är rena och fulla",
    priority: "normal",
    source: "system",
  });

  // ── Mid-morning (08:00–10:00) ──

  if (needsTurning.length > 0) {
    plan.push({
      id: nextId(),
      time: "08:00",
      block: "mid-morning",
      icon: <Egg className="w-4 h-4" />,
      title: `تقليب البيض (${needsTurning.length} دورة)`,
      titleSv: `Vänd ägg (${needsTurning.length} cykler)`,
      description: needsTurning
        .map((c) => {
          const day = daysBetween(c.start_date, today);
          return `الدورة #${c.id}: اليوم ${day} – ${c.egg_count ?? "?"} بيضة`;
        })
        .join("\n"),
      descriptionSv: needsTurning
        .map((c) => {
          const day = daysBetween(c.start_date, today);
          return `Cykel #${c.id}: Dag ${day} – ${c.egg_count ?? "?"} ägg`;
        })
        .join("\n"),
      priority: "high",
      source: "cycle",
    });
  }

  plan.push({
    id: nextId(),
    time: "08:30",
    block: "mid-morning",
    icon: <Activity className="w-4 h-4" />,
    title: "الفحص الصحي للقطيع",
    titleSv: "Hälsokontroll av besättningen",
    description: "مراقبة سلوك الدجاج، البحث عن علامات مرض أو إصابة",
    descriptionSv: "Observera hönsens beteende, leta efter tecken på sjukdom eller skador",
    priority: "normal",
    source: "system",
  });

  plan.push({
    id: nextId(),
    time: "09:00",
    block: "mid-morning",
    icon: <ShieldCheck className="w-4 h-4" />,
    title: "تنظيف الحظائر والأعشاش",
    titleSv: "Rengör hönshus och bon",
    description: "تنظيف الأرضيات، تبديل الفرشة، تنظيف صناديق البيض",
    descriptionSv: "Rengör golv, byt strö, rengör ägglådor",
    priority: "normal",
    source: "system",
  });

  // ── Noon (12:00–14:00) ──

  plan.push({
    id: nextId(),
    time: "12:00",
    block: "noon",
    icon: <Bird className="w-4 h-4" />,
    title: "التغذية الثانية",
    titleSv: "Andra fodringen",
    description: "تقديم الوجبة الثانية من العلف وتفقد المشارب",
    descriptionSv: "Ge andra fodergivan och kontrollera drickarna",
    priority: "normal",
    source: "system",
  });

  if (activeCycles.length > 0) {
    plan.push({
      id: nextId(),
      time: "12:30",
      block: "noon",
      icon: <Thermometer className="w-4 h-4" />,
      title: "فحص درجة حرارة الظهيرة",
      titleSv: "Middagstemperaturkontroll",
      description: `مراجعة قراءات الحرارة والرطوبة في ${activeCycles.length} حاضنة نشطة`,
      descriptionSv: `Kontrollera temperatur och luftfuktighet i ${activeCycles.length} aktiva kuvöser`,
      priority: "normal",
      source: "incubator",
    });
  }

  hatchingSoon.forEach((c) => {
    const left = daysBetween(today, c.expected_hatch_date!);
    plan.push({
      id: nextId(),
      time: "13:00",
      block: "noon",
      icon: <Egg className="w-4 h-4" />,
      title:
        left === 0
          ? `فقس متوقع اليوم! دورة #${c.id}`
          : `فقس قريب: ${left} أيام – دورة #${c.id}`,
      titleSv:
        left === 0
          ? `Kläckning förväntad idag! Cykel #${c.id}`
          : `Kläckning snart: ${left} dagar – Cykel #${c.id}`,
      description:
        left === 0
          ? `تجهيز صندوق الاستقبال، مراقبة مستمرة – ${c.egg_count ?? "?"} بيضة`
          : `راقب عن كثب، جهّز مستلزمات الاستقبال – ${c.egg_count ?? "?"} بيضة`,
      descriptionSv:
        left === 0
          ? `Förbered mottagningslåda, kontinuerlig övervakning – ${c.egg_count ?? "?"} ägg`
          : `Övervaka noggrant, förbered mottagningsutrustning – ${c.egg_count ?? "?"} ägg`,
      priority: "critical",
      source: "cycle",
      cycleId: c.id,
    });
  });

  // ── Afternoon (14:00–16:00) ──

  plan.push({
    id: nextId(),
    time: "14:00",
    block: "afternoon",
    icon: <BarChart3 className="w-4 h-4" />,
    title: "تسجيل الإنتاج",
    titleSv: "Registrera produktion",
    description: analytics?.daily_egg_production
      ? `إنتاج البيض حتى الآن: ${analytics.daily_egg_production} بيضة – سجّل العدد النهائي`
      : "جمع وتسجيل عدد البيض المنتج اليوم",
    descriptionSv: analytics?.daily_egg_production
      ? `Äggproduktion hittills: ${analytics.daily_egg_production} ägg – registrera slutsiffran`
      : "Samla och registrera dagens äggproduktion",
    priority: "high",
    source: "analytics",
  });

  plan.push({
    id: nextId(),
    time: "15:00",
    block: "afternoon",
    icon: <TrendingUp className="w-4 h-4" />,
    title: "متابعة المبيعات",
    titleSv: "Försäljningsuppföljning",
    description: analytics?.revenue
      ? `الإيرادات الحالية: ${analytics.revenue} – تابع الطلبات والعملاء`
      : "مراجعة طلبات العملاء ومتابعة المبيعات",
    descriptionSv: analytics?.revenue
      ? `Nuvarande intäkter: ${analytics.revenue} – följ upp beställningar och kunder`
      : "Granska kundbeställningar och följ upp försäljning",
    priority: "normal",
    source: "analytics",
  });

  // inject user-created tasks
  const pendingTasks = tasks.filter(
    (t) => !t.completed && t.status !== "completed",
  );
  pendingTasks.slice(0, 3).forEach((t) => {
    plan.push({
      id: nextId(),
      time: "15:30",
      block: "afternoon",
      icon: <CircleDot className="w-4 h-4" />,
      title: t.title ?? t.description ?? `مهمة #${t.id}`,
      titleSv: t.title ?? t.description ?? `Uppgift #${t.id}`,
      description: t.description ?? "",
      descriptionSv: t.description ?? "",
      priority: t.priority === "high" || t.priority === "critical" ? "high" : "normal",
      source: "task",
    });
  });

  // ── Evening (18:00–20:00) ──

  if (activeCycles.length > 0) {
    plan.push({
      id: nextId(),
      time: "18:00",
      block: "evening",
      icon: <Thermometer className="w-4 h-4" />,
      title: "الفحص المسائي للحاضنات",
      titleSv: "Kvällskontroll av kuvöser",
      description: "مراجعة نهائية لدرجة الحرارة والرطوبة وضبط الإعدادات الليلية",
      descriptionSv: "Slutkontroll av temperatur och luftfuktighet, justera nattinställningar",
      priority: "high",
      source: "incubator",
    });
  }

  plan.push({
    id: nextId(),
    time: "19:00",
    block: "evening",
    icon: <ShieldCheck className="w-4 h-4" />,
    title: "إغلاق الحظائر وتأمينها",
    titleSv: "Stäng och säkra hönshus",
    description: "التأكد من دخول جميع الدجاج وإغلاق الأبواب والنوافذ",
    descriptionSv: "Se till att alla höns är inne, stäng dörrar och fönster",
    priority: "high",
    source: "system",
  });

  plan.push({
    id: nextId(),
    time: "19:30",
    block: "evening",
    icon: <CalendarClock className="w-4 h-4" />,
    title: "التخطيط للغد",
    titleSv: "Planera för imorgon",
    description: "مراجعة الجدول، تحضير الأعلاف، ملاحظة المهام المعلقة",
    descriptionSv: "Granska schemat, förbered foder, notera väntande uppgifter",
    priority: "normal",
    source: "system",
  });

  return plan;
}

function assessRisks(
  cycles: HatchingCycle[],
  incubators: Incubator[],
  summary: DashboardSummary | null,
): RiskItem[] {
  const today = todayStr();
  const risks: RiskItem[] = [];

  cycles
    .filter((c) => c.status === "active" || c.status === "incubating")
    .forEach((c) => {
      if (c.expected_hatch_date) {
        const left = daysBetween(today, c.expected_hatch_date);
        if (left < 0) {
          risks.push({
            level: "critical",
            message: `الدورة #${c.id} متأخرة عن موعد الفقس بـ ${Math.abs(left)} أيام!`,
            messageSv: `Cykel #${c.id} är ${Math.abs(left)} dagar försenad från kläckningsdatum!`,
          });
        } else if (left === 0) {
          risks.push({
            level: "critical",
            message: `الدورة #${c.id} – موعد الفقس اليوم! راقب باستمرار`,
            messageSv: `Cykel #${c.id} – kläckning idag! Övervaka kontinuerligt`,
          });
        } else if (left <= 2) {
          risks.push({
            level: "high",
            message: `الدورة #${c.id} – الفقس خلال ${left} أيام، جهّز المعدات`,
            messageSv: `Cykel #${c.id} – kläckning om ${left} dagar, förbered utrustning`,
          });
        }
      }
    });

  incubators.forEach((inc) => {
    if (inc.temperature !== undefined && inc.temperature !== null) {
      if (inc.temperature < 36.5 || inc.temperature > 38.5) {
        risks.push({
          level: "critical",
          message: `حاضنة "${inc.name}" – درجة الحرارة غير طبيعية: ${inc.temperature}°C`,
          messageSv: `Kuvös "${inc.name}" – onormal temperatur: ${inc.temperature}°C`,
        });
      }
    }
    if (inc.humidity !== undefined && inc.humidity !== null) {
      if (inc.humidity < 40 || inc.humidity > 80) {
        risks.push({
          level: "high",
          message: `حاضنة "${inc.name}" – رطوبة خارج النطاق: ${inc.humidity}%`,
          messageSv: `Kuvös "${inc.name}" – luftfuktighet utanför intervall: ${inc.humidity}%`,
        });
      }
    }
  });

  if (summary?.mortality_rate && summary.mortality_rate > 5) {
    risks.push({
      level: "high",
      message: `معدل النفوق مرتفع: ${summary.mortality_rate}% – راجع الأسباب`,
      messageSv: `Hög dödlighet: ${summary.mortality_rate}% – undersök orsakerna`,
    });
  }

  return risks.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2 };
    return order[a.level] - order[b.level];
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProgressBar({ value, ar }: { value: number; ar: boolean }) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {label("progress", ar)}
        </span>
        <span
          className={cn(
            "text-sm font-bold tabular-nums",
            value === 100
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-600 dark:text-amber-400",
          )}
        >
          {value}%
        </span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-muted/50 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700 ease-out",
            value === 100
              ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
              : "bg-gradient-to-r from-amber-500 to-orange-400",
          )}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function StatCard({
  icon,
  labelText,
  value,
  sub,
}: {
  icon: React.ReactNode;
  labelText: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border bg-card/60 p-3 text-center">
      <div className="text-muted-foreground">{icon}</div>
      <span className="text-lg font-bold tabular-nums">{value}</span>
      <span className="text-[11px] text-muted-foreground leading-tight">
        {labelText}
      </span>
      {sub && (
        <span className="text-[10px] text-muted-foreground/70">{sub}</span>
      )}
    </div>
  );
}

function CycleCard({
  cycle,
  ar,
}: {
  cycle: HatchingCycle;
  ar: boolean;
}) {
  const today = todayStr();
  const currentDay = daysBetween(cycle.start_date, today);
  const totalDays = cycle.expected_hatch_date
    ? daysBetween(cycle.start_date, cycle.expected_hatch_date)
    : 21;
  const daysLeft = cycle.expected_hatch_date
    ? daysBetween(today, cycle.expected_hatch_date)
    : null;
  const progress = Math.min(100, Math.max(0, (currentDay / totalDays) * 100));

  const isOverdue = daysLeft !== null && daysLeft < 0;
  const isToday = daysLeft === 0;
  const isSoon = daysLeft !== null && daysLeft > 0 && daysLeft <= 3;

  return (
    <div className="rounded-xl border bg-card/80 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Egg className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-semibold">
            {cycle.incubator_name ?? `#${cycle.id}`}
          </span>
        </div>
        {isOverdue && (
          <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0 text-[10px]">
            {label("overdue", ar)}
          </Badge>
        )}
        {isToday && (
          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 text-[10px] animate-pulse">
            {label("today", ar)}
          </Badge>
        )}
        {isSoon && (
          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 text-[10px]">
            {daysLeft} {label("daysLeft", ar)}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>
          {label("day", ar)} {currentDay} {label("of", ar)} {totalDays}
        </span>
        {cycle.egg_count && (
          <span>
            {cycle.egg_count} {label("eggs", ar)}
          </span>
        )}
        {cycle.fertile_count !== undefined && cycle.fertile_count !== null && (
          <span>
            {cycle.fertile_count} {label("fertile", ar)}
          </span>
        )}
      </div>

      <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            isOverdue
              ? "bg-red-500"
              : isToday
                ? "bg-emerald-500"
                : isSoon
                  ? "bg-amber-500"
                  : "bg-blue-500",
          )}
          style={{ width: `${progress}%` }}
        />
      </div>

      {cycle.expected_hatch_date && (
        <div className="text-[11px] text-muted-foreground">
          {label("hatchExpected", ar)}: {formatDate(cycle.expected_hatch_date, ar)}
        </div>
      )}
    </div>
  );
}

function TaskItem({
  task,
  checked,
  onToggle,
  ar,
  isCurrentBlock,
  isPast,
}: {
  task: PlanTask;
  checked: boolean;
  onToggle: () => void;
  ar: boolean;
  isCurrentBlock: boolean;
  isPast: boolean;
}) {
  const priorityColors: Record<Priority, string> = {
    critical: "border-red-500/60 bg-red-50/50 dark:bg-red-950/20",
    high: "border-amber-500/40 bg-amber-50/30 dark:bg-amber-950/10",
    normal: "border-border",
  };

  const priorityDot: Record<Priority, string> = {
    critical: "bg-red-500",
    high: "bg-amber-500",
    normal: "bg-blue-400",
  };

  const priorityLabel: Record<Priority, string> = {
    critical: label("critical", ar),
    high: label("high", ar),
    normal: label("normal", ar),
  };

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "w-full text-start rounded-xl border p-3 transition-all group",
        "hover:shadow-sm active:scale-[0.99]",
        checked ? "opacity-50 border-border bg-muted/30" : priorityColors[task.priority],
        isCurrentBlock && !checked && "ring-1 ring-amber-400/30",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          <div
            className={cn(
              "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
              checked
                ? "bg-emerald-500 border-emerald-500"
                : `border-current ${priorityDot[task.priority].replace("bg-", "text-")}`,
            )}
          >
            {checked && <CheckCircle2 className="w-3 h-3 text-white" />}
          </div>
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "text-muted-foreground",
                checked && "opacity-50",
              )}
            >
              {task.icon}
            </span>
            <span
              className={cn(
                "text-sm font-semibold leading-snug",
                checked && "line-through decoration-muted-foreground/40",
                task.priority === "critical" && !checked && "text-red-700 dark:text-red-400",
              )}
            >
              {ar ? task.title : task.titleSv}
            </span>
            {task.priority === "critical" && !checked && (
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
            )}
          </div>
          <p
            className={cn(
              "text-xs text-muted-foreground leading-relaxed whitespace-pre-line",
              checked && "line-through decoration-muted-foreground/30",
            )}
          >
            {ar ? task.description : task.descriptionSv}
          </p>
        </div>

        <div className="shrink-0 flex flex-col items-end gap-1">
          <span
            className={cn(
              "text-[11px] font-mono font-semibold tabular-nums",
              isPast && !isCurrentBlock
                ? "text-muted-foreground/50"
                : isCurrentBlock
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-foreground/70",
            )}
          >
            {task.time}
          </span>
          {task.priority !== "normal" && !checked && (
            <Badge
              variant="outline"
              className={cn(
                "text-[9px] px-1.5 py-0 h-4",
                task.priority === "critical"
                  ? "border-red-300 text-red-600 dark:border-red-800 dark:text-red-400"
                  : "border-amber-300 text-amber-600 dark:border-amber-800 dark:text-amber-400",
              )}
            >
              {priorityLabel[task.priority]}
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}

function TimeBlockSection({
  block,
  tasks,
  checkedIds,
  onToggle,
  ar,
}: {
  block: TimeBlock;
  tasks: PlanTask[];
  checkedIds: Set<string>;
  onToggle: (id: string) => void;
  ar: boolean;
}) {
  const currentBlock = getCurrentBlock();
  const isCurrentBlock = block === currentBlock;
  const blockHour = BLOCK_HOURS[block];
  const currentHour = new Date().getHours();
  const isPast = blockHour + 2 <= currentHour && !isCurrentBlock;

  const blockIcons: Record<TimeBlock, React.ReactNode> = {
    morning: <Sunrise className="w-4 h-4" />,
    "mid-morning": <Sun className="w-4 h-4" />,
    noon: <CloudSun className="w-4 h-4" />,
    afternoon: <Sunset className="w-4 h-4" />,
    evening: <Moon className="w-4 h-4" />,
  };

  if (tasks.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <div
          className={cn(
            "flex items-center gap-2 text-sm font-bold",
            isCurrentBlock
              ? "text-amber-600 dark:text-amber-400"
              : isPast
                ? "text-muted-foreground/50"
                : "text-foreground",
          )}
        >
          {blockIcons[block]}
          <span>{label(block, ar)}</span>
        </div>
        <span className="text-[11px] text-muted-foreground font-mono">
          {label(`${block}Time` as keyof typeof LABELS, ar)}
        </span>
        {isCurrentBlock && (
          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-0 text-[10px] animate-pulse">
            {label("now", ar)}
          </Badge>
        )}
      </div>
      <div className="space-y-2">
        {tasks.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            checked={checkedIds.has(task.id)}
            onToggle={() => onToggle(task.id)}
            ar={ar}
            isCurrentBlock={isCurrentBlock}
            isPast={isPast}
          />
        ))}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-16 w-full rounded-xl" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DailyPlanPage() {
  const { user, isAdmin } = useAuth();
  const { lang } = useLanguage();
  const ar = lang === "ar";

  const [loading, setLoading] = useState(true);
  const [cycles, setCycles] = useState<HatchingCycle[]>([]);
  const [incubators, setIncubators] = useState<Incubator[]>([]);
  const [farmTasks, setFarmTasks] = useState<FarmTask[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [analytics, setAnalytics] = useState<FarmAnalytics | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(`daily-plan-checked-${todayStr()}`);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [showAllCycles, setShowAllCycles] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const opts: RequestInit = { credentials: "include" };

    const [cyclesRes, summaryRes, tasksRes, analyticsRes, incubatorsRes] =
      await Promise.allSettled([
        fetch(apiPath("/hatching-cycles"), opts).then((r) =>
          r.ok ? r.json() : null,
        ),
        fetch(apiPath("/dashboard/summary"), opts).then((r) =>
          r.ok ? r.json() : null,
        ),
        fetch(apiPath("/tasks"), opts).then((r) => (r.ok ? r.json() : null)),
        fetch(apiPath("/farm-analytics/overview"), opts).then((r) =>
          r.ok ? r.json() : null,
        ),
        fetch(apiPath("/incubators"), opts).then((r) =>
          r.ok ? r.json() : null,
        ),
      ]);

    if (cyclesRes.status === "fulfilled" && cyclesRes.value) {
      const data = cyclesRes.value;
      setCycles(Array.isArray(data) ? data : data.cycles ?? data.data ?? []);
    }
    if (summaryRes.status === "fulfilled" && summaryRes.value) {
      setSummary(summaryRes.value);
    }
    if (tasksRes.status === "fulfilled" && tasksRes.value) {
      const data = tasksRes.value;
      setFarmTasks(Array.isArray(data) ? data : data.tasks ?? data.data ?? []);
    }
    if (analyticsRes.status === "fulfilled" && analyticsRes.value) {
      setAnalytics(analyticsRes.value);
    }
    if (incubatorsRes.status === "fulfilled" && incubatorsRes.value) {
      const data = incubatorsRes.value;
      setIncubators(
        Array.isArray(data) ? data : data.incubators ?? data.data ?? [],
      );
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Persist checked state per day
  useEffect(() => {
    try {
      localStorage.setItem(
        `daily-plan-checked-${todayStr()}`,
        JSON.stringify([...checkedIds]),
      );
    } catch {}
  }, [checkedIds]);

  const tasks = useMemo(
    () => generateTasks(cycles, incubators, farmTasks, summary, analytics),
    [cycles, incubators, farmTasks, summary, analytics],
  );

  const risks = useMemo(
    () => assessRisks(cycles, incubators, summary),
    [cycles, incubators, summary],
  );

  const activeCycles = useMemo(
    () =>
      cycles.filter((c) => c.status === "active" || c.status === "incubating"),
    [cycles],
  );

  const tasksByBlock = useMemo(() => {
    const map: Record<TimeBlock, PlanTask[]> = {
      morning: [],
      "mid-morning": [],
      noon: [],
      afternoon: [],
      evening: [],
    };
    tasks.forEach((t) => map[t.block].push(t));
    return map;
  }, [tasks]);

  const toggleTask = useCallback((id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const completedCount = tasks.filter((t) => checkedIds.has(t.id)).length;
  const progress =
    tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  const displayedCycles = showAllCycles
    ? activeCycles
    : activeCycles.slice(0, 3);

  const worstRisk: "critical" | "high" | "medium" | "low" =
    risks.length === 0
      ? "low"
      : risks[0].level;

  const riskBorderColor = {
    critical: "border-red-500/50",
    high: "border-amber-500/40",
    medium: "border-amber-400/30",
    low: "border-emerald-500/30",
  }[worstRisk];

  // ── Admin gate ──
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <ShieldAlert className="w-16 h-16 text-muted-foreground/40" />
        <h2 className="text-xl font-bold">{label("restricted", ar)}</h2>
        <p className="text-muted-foreground">{label("restrictedDesc", ar)}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-8">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/25">
            <CalendarClock className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{label("title", ar)}</h1>
            <p className="text-xs text-muted-foreground">
              {label("subtitle", ar)}
            </p>
          </div>
        </div>
        <Button
          onClick={fetchAll}
          disabled={loading}
          size="sm"
          variant="outline"
          className="gap-2"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          {label("refresh", ar)}
        </Button>
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : (
        <>
          {/* ── Greeting + Progress ── */}
          <Card className="border-none shadow-sm bg-gradient-to-l from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-lg font-bold">{getGreeting(ar)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDate(todayStr(), ar)} ·{" "}
                    {tasks.length} {label("tasks", ar)}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span className="font-mono tabular-nums">
                    {new Date().toLocaleTimeString(ar ? "ar-SA" : "sv-SE", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
              <ProgressBar value={progress} ar={ar} />
              <div className="text-xs text-muted-foreground">
                {completedCount}/{tasks.length} {label("completed", ar)}
              </div>
            </CardContent>
          </Card>

          {/* ── Daily Stats ── */}
          {summary && (
            <div>
              <h2 className="text-sm font-bold mb-2 px-1">
                {label("dailyStats", ar)}
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard
                  icon={<Bird className="w-5 h-5" />}
                  labelText={label("totalChickens", ar)}
                  value={summary.total_chickens ?? "–"}
                />
                <StatCard
                  icon={<Egg className="w-5 h-5" />}
                  labelText={label("eggsToday", ar)}
                  value={
                    analytics?.daily_egg_production ??
                    summary.total_eggs_today ??
                    "–"
                  }
                />
                <StatCard
                  icon={<Thermometer className="w-5 h-5" />}
                  labelText={label("activeIncubators", ar)}
                  value={summary.active_incubators ?? incubators.length}
                />
                <StatCard
                  icon={<BarChart3 className="w-5 h-5" />}
                  labelText={label("feedStock", ar)}
                  value={
                    summary.feed_stock !== undefined
                      ? `${summary.feed_stock}`
                      : "–"
                  }
                  sub={summary.feed_stock !== undefined ? label("kg", ar) : undefined}
                />
              </div>
            </div>
          )}

          {/* ── Risk Assessment ── */}
          <Card className={cn("border shadow-sm", riskBorderColor)}>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle
                  className={cn(
                    "w-4 h-4",
                    worstRisk === "critical"
                      ? "text-red-500"
                      : worstRisk === "high"
                        ? "text-amber-500"
                        : "text-emerald-500",
                  )}
                />
                {label("riskAssessment", ar)}
                {risks.length > 0 && (
                  <Badge
                    className={cn(
                      "border-0 text-[10px]",
                      worstRisk === "critical"
                        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                    )}
                  >
                    {risks.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {risks.length === 0 ? (
                <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                  {label("noRisks", ar)}
                </p>
              ) : (
                <div className="space-y-2">
                  {risks.map((risk, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex items-start gap-2 rounded-lg px-3 py-2 text-xs",
                        risk.level === "critical"
                          ? "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300"
                          : "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
                      )}
                    >
                      <div
                        className={cn(
                          "w-2 h-2 rounded-full mt-1 shrink-0",
                          risk.level === "critical"
                            ? "bg-red-500"
                            : "bg-amber-500",
                        )}
                      />
                      <span className="leading-relaxed">
                        {ar ? risk.message : risk.messageSv}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Active Hatching Cycles ── */}
          {activeCycles.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <Timer className="w-4 h-4 text-amber-500" />
                  {label("activeCycles", ar)}
                  <Badge variant="outline" className="text-[10px] px-1.5 h-4">
                    {activeCycles.length}
                  </Badge>
                </h2>
                {activeCycles.length > 3 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs gap-1 h-7"
                    onClick={() => setShowAllCycles((v) => !v)}
                  >
                    {showAllCycles ? (
                      <>
                        {label("showLess", ar)}
                        <ChevronUp className="w-3 h-3" />
                      </>
                    ) : (
                      <>
                        {label("showMore", ar)}
                        <ChevronDown className="w-3 h-3" />
                      </>
                    )}
                  </Button>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {displayedCycles.map((cycle) => (
                  <CycleCard key={cycle.id} cycle={cycle} ar={ar} />
                ))}
              </div>
            </div>
          )}

          {/* ── Timeline ── */}
          <div className="space-y-5">
            {BLOCK_ORDER.map((block) => (
              <TimeBlockSection
                key={block}
                block={block}
                tasks={tasksByBlock[block]}
                checkedIds={checkedIds}
                onToggle={toggleTask}
                ar={ar}
              />
            ))}
          </div>

          {/* ── All Done ── */}
          {completedCount === tasks.length && tasks.length > 0 && (
            <Card className="border-none shadow-sm bg-emerald-50 dark:bg-emerald-950/20">
              <CardContent className="p-5 text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                  {label("allDone", ar)}
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
