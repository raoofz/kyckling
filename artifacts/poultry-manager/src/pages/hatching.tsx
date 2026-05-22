import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  useListHatchingCycles, getListHatchingCyclesQueryKey,
  useCreateHatchingCycle, useDeleteHatchingCycle, useUpdateHatchingCycle
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus, Egg, Pencil, Trash2, Thermometer, Droplets, Clock, ArrowLeftRight,
  Info, TrendingUp, TrendingDown, Minus, Target, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronUp, Box, CloudSun, Wind, MapPin, Bell, Calendar,
  Timer, Shield, Activity, Eye, Zap, BarChart3, RefreshCw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiPath } from "@/lib/api";

// ── Constants ──────────────────────────────────────────────────────────────
const TOTAL_INCUBATION_DAYS = 21;
const LOCKDOWN_DAY = 18;
const MOSUL_LAT = 36.34;
const MOSUL_LON = 43.10;

// Ideal incubation parameters
const IDEAL = {
  tempDay1_18: { min: 37.4, max: 37.8, ideal: 37.7, unit: "°C" },
  tempDay18_21: { min: 36.5, max: 37.2, ideal: 36.9, unit: "°C" },
  humDay1_18: { min: 50, max: 60, ideal: 55, unit: "%" },
  humDay18_21: { min: 65, max: 75, ideal: 70, unit: "%" },
  turningInterval: 4, // hours
  candlingDays: [7, 14, 18],
};

// ── Utility: compute cycle state ───────────────────────────────────────────
function computeCycleState(cycle: any) {
  const start = cycle.startDate
    ? new Date(`${cycle.startDate}T${cycle.setTime ?? "00:00"}:00`)
    : null;
  if (!start) return null;

  const nowMs = Date.now();
  const elapsedMs = nowMs - start.getTime();
  if (elapsedMs < 0) return null;

  const elapsedDays = elapsedMs / 86400000;
  const progress = Math.min((elapsedDays / TOTAL_INCUBATION_DAYS) * 100, 100);
  const currentDay = Math.floor(elapsedDays) + 1;
  const hourInDay = Math.floor((elapsedDays % 1) * 24);
  const minuteInHour = Math.floor(((elapsedDays % 1) * 24 % 1) * 60);
  const daysLeft = Math.max(0, TOTAL_INCUBATION_DAYS - Math.ceil(elapsedDays));
  const hoursLeft = Math.max(0, Math.floor((TOTAL_INCUBATION_DAYS * 24) - (elapsedDays * 24)));

  const expectedHatchDate = new Date(start.getTime() + TOTAL_INCUBATION_DAYS * 86400000);
  const lockdownDate = new Date(start.getTime() + LOCKDOWN_DAY * 86400000);

  let phase: "early" | "development" | "lockdown" | "hatching" | "overdue";
  if (elapsedDays > TOTAL_INCUBATION_DAYS + 1) {
    phase = "overdue";
  } else if (cycle.status === "hatching" || elapsedDays >= TOTAL_INCUBATION_DAYS) {
    phase = "hatching";
  } else if (elapsedDays >= LOCKDOWN_DAY) {
    phase = "lockdown";
  } else if (elapsedDays >= 4) {
    phase = "development";
  } else {
    phase = "early";
  }

  const isLockdown = elapsedDays >= LOCKDOWN_DAY;
  const idealTemp = isLockdown ? IDEAL.tempDay18_21 : IDEAL.tempDay1_18;
  const idealHum = isLockdown ? IDEAL.humDay18_21 : IDEAL.humDay1_18;

  const nextCandling = IDEAL.candlingDays.find(d => d > Math.floor(elapsedDays));
  const daysToCandling = nextCandling ? nextCandling - Math.floor(elapsedDays) : null;

  const hoursSinceLastTurn = hourInDay % IDEAL.turningInterval;
  const needsTurning = hoursSinceLastTurn >= IDEAL.turningInterval - 0.5 && !isLockdown;

  return {
    progress, currentDay, hourInDay, minuteInHour, daysLeft, hoursLeft,
    phase, elapsedDays, expectedHatchDate, lockdownDate,
    idealTemp, idealHum, nextCandling, daysToCandling, needsTurning, isLockdown
  };
}

// ── Smart Alerts Generator ─────────────────────────────────────────────────
function generateAlerts(cycle: any, state: ReturnType<typeof computeCycleState>, machine: any) {
  if (!state) return [];
  const alerts: { type: "critical" | "warning" | "info" | "success"; msg: string; icon: any }[] = [];

  if (state.phase === "overdue") {
    alerts.push({ type: "critical", msg: "تجاوزت الفقسة 21 يوم! تحقق فوراً من الماكينة والبيض", icon: AlertTriangle });
  }

  if (state.daysLeft <= 3 && state.daysLeft > 0 && state.phase !== "hatching") {
    alerts.push({ type: "warning", msg: `باقي ${state.daysLeft} أيام فقط للفقس — جهّز الحاضنات والمعدات`, icon: Bell });
  }

  if (state.daysLeft === 0) {
    alerts.push({ type: "critical", msg: "اليوم هو يوم الفقس المتوقع! راقب الماكينة باستمرار", icon: Egg });
  }

  if (state.isLockdown && cycle.status === "incubating") {
    alerts.push({ type: "warning", msg: "يجب نقل البيض للهاتشر (مرحلة الإغلاق) — توقف عن التقليب وارفع الرطوبة", icon: ArrowLeftRight });
  }

  if (state.needsTurning) {
    alerts.push({ type: "info", msg: `حان وقت تقليب البيض — كل ${IDEAL.turningInterval} ساعات`, icon: RefreshCw });
  }

  if (state.daysToCandling != null && state.daysToCandling <= 1) {
    alerts.push({ type: "info", msg: `غداً فحص الأشعة (الكشف عن التخصيب) — يوم ${state.nextCandling}`, icon: Eye });
  }

  if (state.daysToCandling === 0) {
    alerts.push({ type: "warning", msg: `اليوم يوم فحص الأشعة (يوم ${state.nextCandling}) — افحص البيض وأزل غير المخصب`, icon: Eye });
  }

  if (machine) {
    const occupancy = (cycle.eggsSet / machine.capacity) * 100;
    if (occupancy > 95) {
      alerts.push({ type: "warning", msg: `الماكينة ممتلئة تقريباً (${Math.round(occupancy)}%) — قد تؤثر على التهوية`, icon: Box });
    }
  }

  if (cycle.temperature != null) {
    const temp = parseFloat(cycle.temperature);
    if (temp > state.idealTemp.max + 0.5) {
      alerts.push({ type: "critical", msg: `الحرارة مرتفعة جداً (${temp}°C) — الحد الأقصى ${state.idealTemp.max}°C`, icon: Thermometer });
    } else if (temp < state.idealTemp.min - 0.5) {
      alerts.push({ type: "critical", msg: `الحرارة منخفضة جداً (${temp}°C) — الحد الأدنى ${state.idealTemp.min}°C`, icon: Thermometer });
    }
  }

  if (cycle.humidity != null) {
    const hum = parseFloat(cycle.humidity);
    if (hum > state.idealHum.max + 10) {
      alerts.push({ type: "warning", msg: `الرطوبة مرتفعة (${hum}%) — المثالي ${state.idealHum.min}-${state.idealHum.max}%`, icon: Droplets });
    } else if (hum < state.idealHum.min - 10) {
      alerts.push({ type: "warning", msg: `الرطوبة منخفضة (${hum}%) — المثالي ${state.idealHum.min}-${state.idealHum.max}%`, icon: Droplets });
    }
  }

  if (alerts.length === 0) {
    alerts.push({ type: "success", msg: "كل شيء يعمل بشكل طبيعي — استمر بالمراقبة", icon: CheckCircle2 });
  }

  return alerts;
}

// ── Weather Widget ─────────────────────────────────────────────────────────
function MosulWeatherWidget({ ar }: { ar: boolean }) {
  const { data: weather, isLoading } = useQuery({
    queryKey: ["mosul-weather"],
    queryFn: async () => {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${MOSUL_LAT}&longitude=${MOSUL_LON}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&hourly=temperature_2m,relative_humidity_2m&forecast_days=1&timezone=Asia/Baghdad`
      );
      if (!res.ok) throw new Error("Weather fetch failed");
      return res.json();
    },
    refetchInterval: 10 * 60_000,
    staleTime: 5 * 60_000,
  });

  if (isLoading || !weather?.current) {
    return (
      <Card className="border-sky-200 bg-gradient-to-br from-sky-50 to-blue-50">
        <CardContent className="py-3 px-4"><Skeleton className="h-16 w-full" /></CardContent>
      </Card>
    );
  }

  const { temperature_2m: temp, relative_humidity_2m: hum, wind_speed_10m: wind } = weather.current;
  const tempWarning = temp > 42 || temp < 5;
  const humWarning = hum < 20 || hum > 85;

  const hourlyTemps = weather.hourly?.temperature_2m?.slice(0, 24) ?? [];
  const maxTemp = hourlyTemps.length ? Math.max(...hourlyTemps).toFixed(1) : "—";
  const minTemp = hourlyTemps.length ? Math.min(...hourlyTemps).toFixed(1) : "—";

  return (
    <Card className={`border-sky-200 bg-gradient-to-br from-sky-50/80 to-blue-50/50 ${tempWarning ? "ring-1 ring-red-300" : ""}`}>
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-sky-500/15 flex items-center justify-center">
              <CloudSun className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <p className="text-xs text-sky-600 font-medium flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {ar ? "طقس الموصل - غرب" : "Mosul väder - Väst"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {ar ? "لمعرفة الظروف المحيطة بالماكينة" : "Utomhusförhållanden runt maskinen"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Thermometer className={`w-4 h-4 ${tempWarning ? "text-red-500" : "text-orange-500"}`} />
              <div className="text-center">
                <p className={`text-lg font-bold leading-none ${tempWarning ? "text-red-500" : "text-orange-600"}`}>{temp}°C</p>
                <p className="text-[9px] text-muted-foreground">{ar ? `أعلى ${maxTemp}° أدنى ${minTemp}°` : `Max ${maxTemp}° Min ${minTemp}°`}</p>
              </div>
            </div>

            <div className="w-px h-8 bg-sky-200" />

            <div className="flex items-center gap-1.5">
              <Droplets className={`w-4 h-4 ${humWarning ? "text-red-500" : "text-blue-500"}`} />
              <div className="text-center">
                <p className={`text-lg font-bold leading-none ${humWarning ? "text-red-500" : "text-blue-600"}`}>{hum}%</p>
                <p className="text-[9px] text-muted-foreground">{ar ? "الرطوبة" : "Fukt"}</p>
              </div>
            </div>

            <div className="w-px h-8 bg-sky-200" />

            <div className="flex items-center gap-1.5">
              <Wind className="w-4 h-4 text-gray-500" />
              <div className="text-center">
                <p className="text-lg font-bold leading-none text-gray-600">{wind}</p>
                <p className="text-[9px] text-muted-foreground">{ar ? "كم/س" : "km/h"}</p>
              </div>
            </div>
          </div>
        </div>

        {(tempWarning || humWarning) && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600 bg-red-50 px-2.5 py-1.5 rounded-lg border border-red-200">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {ar
              ? `تحذير: ${tempWarning ? "حرارة خارجية شديدة" : ""} ${humWarning ? "رطوبة خارجية غير مناسبة" : ""} — راقب إعدادات الماكينة`
              : `Warning: Extreme outdoor conditions — check machine settings`}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Live Tracker ───────────────────────────────────────────────────────────
const BASE_URL_TRACKER = import.meta.env.BASE_URL ?? "/";

function HatchingLiveTracker({ cycle, ar }: { cycle: any; ar: boolean }) {
  const clockOffsetRef = useRef(0);
  const [clockReady, setClockReady] = useState(false);

  useEffect(() => {
    const before = Date.now();
    fetch(`${BASE_URL_TRACKER}api/server-time`, { credentials: "include" })
      .then(r => r.json())
      .then((d: { timestamp: number }) => {
        const after = Date.now();
        const rtt = after - before;
        clockOffsetRef.current = d.timestamp - (before + rtt / 2);
      })
      .catch(() => {})
      .finally(() => setClockReady(true));
  }, []);

  function compute() {
    const start = cycle.startDate
      ? new Date(`${cycle.startDate}T${cycle.setTime ?? "00:00"}:00`)
      : null;
    if (!start) return null;

    const nowMs = Date.now() + clockOffsetRef.current;
    const elapsedMs = nowMs - start.getTime();
    if (elapsedMs < 0) return null;

    const elapsedDays = elapsedMs / 86400000;
    const progress = Math.min((elapsedDays / TOTAL_INCUBATION_DAYS) * 100, 100);
    const currentDay = Math.floor(elapsedDays) + 1;
    const hourInDay = Math.floor((elapsedDays % 1) * 24);
    const daysLeft = Math.max(0, TOTAL_INCUBATION_DAYS - Math.ceil(elapsedDays));

    let phase: "early" | "mid" | "lockdown" | "hatching";
    if (cycle.status === "hatching") phase = "hatching";
    else if (elapsedDays >= 18) phase = "lockdown";
    else if (elapsedDays >= 4) phase = "mid";
    else phase = "early";

    return { progress, currentDay, hourInDay, daysLeft, phase, elapsedDays };
  }

  const [state, setState] = useState<ReturnType<typeof compute>>(null);

  useEffect(() => {
    if (!clockReady) return;
    setState(compute());
    const id = setInterval(() => setState(compute()), 60_000);
    return () => clearInterval(id);
  }, [clockReady, cycle.startDate, cycle.setTime, cycle.status]);

  if (!state) return null;
  if (cycle.status === "completed" || cycle.status === "failed") return null;

  const PHASE_CONFIG = {
    early:    { bar: "bg-emerald-500", bg: "bg-emerald-50",  border: "border-emerald-200", text: "text-emerald-700", label: ar ? "مرحلة مبكرة (يوم 1-3)" : "Tidig fas (dag 1-3)", dot: "bg-emerald-400" },
    mid:      { bar: "bg-blue-500",    bg: "bg-blue-50",     border: "border-blue-200",    text: "text-blue-700",    label: ar ? "مرحلة التطور (يوم 4-17)" : "Utvecklingsfas (dag 4-17)", dot: "bg-blue-400" },
    lockdown: { bar: "bg-amber-500",   bg: "bg-amber-50",    border: "border-amber-200",   text: "text-amber-700",   label: ar ? "مرحلة الإغلاق (يوم 18-20)" : "Lockdown (dag 18-20)", dot: "bg-amber-400" },
    hatching: { bar: "bg-red-500",     bg: "bg-red-50",      border: "border-red-200",     text: "text-red-700",     label: ar ? "فقس نشط (يوم 21)" : "Aktiv kläckning (dag 21)", dot: "bg-red-400 animate-pulse" },
  };

  const cfg = PHASE_CONFIG[state.phase];

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-3 space-y-2`}>
      <div className={`flex items-center justify-between text-xs font-semibold ${cfg.text}`}>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </div>
        <div className="flex items-center gap-3 font-normal text-muted-foreground">
          <span className="font-bold">{state.progress.toFixed(1)}%</span>
          <span>{ar ? `يوم ${state.currentDay}، ساعة ${state.hourInDay}` : `Dag ${state.currentDay}, tim ${state.hourInDay}`}</span>
          <span>{ar ? `${state.daysLeft} يوم متبقي` : `${state.daysLeft} dag kvar`}</span>
        </div>
      </div>
      <div className="h-3 bg-white/70 rounded-full overflow-hidden border border-white/40 shadow-inner relative">
        <div className={`h-full rounded-full transition-all duration-1000 ${cfg.bar}`} style={{ width: `${state.progress}%` }} />
        {IDEAL.candlingDays.map(d => (
          <div key={d} className="absolute top-0 h-full border-r border-dotted border-slate-300/60" style={{ left: `${(d / TOTAL_INCUBATION_DAYS) * 100}%` }} title={ar ? `فحص يوم ${d}` : `Kontroll dag ${d}`} />
        ))}
        <div className="absolute top-0 h-full border-r-2 border-dashed border-amber-400/80" style={{ left: `${(LOCKDOWN_DAY / TOTAL_INCUBATION_DAYS) * 100}%` }} />
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground/60">
        <span>{ar ? "يوم ١" : "Dag 1"}</span>
        <span>{ar ? "فحص ٧" : "Kontroll 7"}</span>
        <span>{ar ? "فحص ١٤" : "Kontroll 14"}</span>
        <span>{ar ? "إغلاق ١٨" : "Lockdown 18"}</span>
        <span>{ar ? "فقس ٢١" : "Kläckning 21"}</span>
      </div>
    </div>
  );
}

// ── Hatching Analysis ──────────────────────────────────────────────────────
function HatchingAnalysis({ cycles }: { cycles: any[] }) {
  const [expanded, setExpanded] = useState(true);
  const completed = cycles.filter(c => c.status === "completed" && c.eggsHatched != null);
  if (completed.length < 2) return null;

  const rates = completed.map(c => ({ name: c.batchName, rate: Math.round((c.eggsHatched / c.eggsSet) * 100), eggs: c.eggsSet, hatched: c.eggsHatched }));
  const TARGET = 75;
  const best = Math.max(...rates.map(r => r.rate));
  const latest = rates[rates.length - 1];
  const prev = rates[rates.length - 2];
  const delta = latest.rate - prev.rate;
  const totalEggs = rates.reduce((s, r) => s + r.eggs, 0);
  const totalHatched = rates.reduce((s, r) => s + r.hatched, 0);
  const overallRate = Math.round((totalHatched / totalEggs) * 100);

  const trend = delta > 3 ? "up" : delta < -3 ? "down" : "stable";

  const PALETTE = ["#ef4444","#f59e0b","#3b82f6","#10b981","#8b5cf6","#f97316"];
  const maxRate = Math.max(TARGET, best) + 5;

  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "up" ? "text-emerald-600" : trend === "down" ? "text-red-500" : "text-amber-500";

  return (
    <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-purple-50/50">
      <CardHeader className="pb-0 pt-4 px-5">
        <button className="flex items-center justify-between w-full" onClick={() => setExpanded(e => !e)}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <div className="text-right">
              <CardTitle className="text-base font-bold text-indigo-900">تحليل مسار الفقس</CardTitle>
              <p className="text-xs text-indigo-500 font-normal mt-0.5">{completed.length} دفعات مكتملة · {totalEggs} بيضة · {totalHatched} صوص</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1 text-sm font-bold ${trendColor}`}>
              <TrendIcon className="w-4 h-4" />
              {trend === "up" ? "تحسن" : trend === "down" ? "تراجع" : "مستقر"}
            </div>
            {expanded ? <ChevronUp className="w-4 h-4 text-indigo-400" /> : <ChevronDown className="w-4 h-4 text-indigo-400" />}
          </div>
        </button>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-4 px-5 pb-5 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-indigo-100 p-3 text-center">
              <div className="text-2xl font-bold text-indigo-700">{latest.rate}%</div>
              <div className="text-xs text-muted-foreground mt-0.5">آخر دفعة</div>
            </div>
            <div className="bg-white rounded-xl border border-indigo-100 p-3 text-center">
              <div className="text-2xl font-bold text-emerald-600">{best}%</div>
              <div className="text-xs text-muted-foreground mt-0.5">أفضل نسبة</div>
            </div>
            <div className="bg-white rounded-xl border border-indigo-100 p-3 text-center">
              <div className="text-2xl font-bold text-slate-700">{overallRate}%</div>
              <div className="text-xs text-muted-foreground mt-0.5">المعدل العام</div>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-600">تطور نسبة الفقس</span>
              <span className="text-xs text-muted-foreground">الهدف: {TARGET}%</span>
            </div>
            {rates.map((r, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 truncate max-w-[55%]">{r.name}</span>
                  <span className={`font-bold ${r.rate >= TARGET ? "text-emerald-600" : r.rate >= 40 ? "text-amber-600" : "text-red-500"}`}>{r.rate}% <span className="font-normal text-muted-foreground">({r.hatched}/{r.eggs})</span></span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden relative">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(r.rate / maxRate) * 100}%`, backgroundColor: PALETTE[i % PALETTE.length] }} />
                  <div className="absolute top-0 h-full border-r-2 border-dashed border-slate-400/60" style={{ left: `${(TARGET / maxRate) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ── Incubation Schedule (what to do each day) ──────────────────────────────
function IncubationSchedule({ state, ar }: { state: ReturnType<typeof computeCycleState>; ar: boolean }) {
  if (!state) return null;

  const day = state.currentDay;
  const schedule: { day: string; task: string; done: boolean }[] = [
    { day: "1-3", task: ar ? "تأكد من الحرارة 37.7° والرطوبة 55% — لا تفتح الماكينة" : "Kontrollera temp 37.7° och fukt 55% — öppna inte", done: day > 3 },
    { day: "4", task: ar ? "ابدأ التقليب التلقائي كل 4 ساعات" : "Börja automatisk vändning var 4:e timme", done: day > 4 },
    { day: "7", task: ar ? "فحص الأشعة الأول — أزل البيض غير المخصب" : "Första ljustestning — ta bort ofertila ägg", done: day > 7 },
    { day: "10", task: ar ? "تحقق من التهوية ومستوى الماء" : "Kontrollera ventilation och vattennivå", done: day > 10 },
    { day: "14", task: ar ? "فحص الأشعة الثاني — أزل الأجنة الميتة" : "Andra ljustestning — ta bort döda embryon", done: day > 14 },
    { day: "18", task: ar ? "نقل للهاتشر — توقف عن التقليب — ارفع الرطوبة لـ 70%" : "Flytta till kläckare — sluta vända — höj fukt till 70%", done: day > 18 },
    { day: "19-20", task: ar ? "لا تفتح الهاتشر — راقب فقط" : "Öppna inte kläckaren — övervaka bara", done: day > 20 },
    { day: "21", task: ar ? "الفقس! — أخرج الصيصان بعد الجفاف — ماء وسكر" : "Kläckning! — Ta ut kycklingar efter torkning", done: day > 21 },
  ];

  const currentIdx = schedule.findIndex(s => {
    const parts = s.day.split("-").map(Number);
    if (parts.length === 2) return day >= parts[0] && day <= parts[1];
    return day === parts[0];
  });

  return (
    <div className="space-y-1">
      {schedule.map((s, i) => {
        const isCurrent = i === currentIdx;
        return (
          <div key={i} className={`flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
            isCurrent ? "bg-primary/10 border border-primary/30 font-semibold text-primary" :
            s.done ? "text-muted-foreground/50 line-through" : "text-muted-foreground"
          }`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
              isCurrent ? "bg-primary text-white" : s.done ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"
            }`}>
              {s.done ? "✓" : s.day.split("-")[0]}
            </div>
            <span className="flex-1">{ar ? `يوم ${s.day}:` : `Dag ${s.day}:`} {s.task}</span>
            {isCurrent && <span className="animate-pulse text-primary">◀</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── Cycle Card (comprehensive) ─────────────────────────────────────────────
function CycleCard({ cycle, machine, ar, t, STATUS_LABELS, STATUS_COLORS, isAdmin, onEdit, onDelete }: {
  cycle: any; machine: any; ar: boolean; t: any; STATUS_LABELS: Record<string,string>; STATUS_COLORS: Record<string,string>; isAdmin: boolean; onEdit: () => void; onDelete: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const isActive = cycle.status === "incubating" || cycle.status === "hatching";
  const state = isActive ? computeCycleState(cycle) : null;
  const alerts = isActive ? generateAlerts(cycle, state, machine) : [];
  const hatchRate = cycle.eggsHatched != null ? Math.round((cycle.eggsHatched / cycle.eggsSet) * 100) : null;
  const occupancy = machine ? Math.round((cycle.eggsSet / machine.capacity) * 100) : 0;
  const expectedChicks = Math.round(cycle.eggsSet * 0.72);

  return (
    <Card className={`border-border/60 hover:shadow-md transition-all duration-200 ${isActive ? "ring-1 ring-primary/20" : ""}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-3">
            {/* Header */}
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="font-semibold text-base">{cycle.batchName}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[cycle.status]}`}>
                {STATUS_LABELS[cycle.status]}
              </span>
              {machine && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-violet-100 text-violet-700 flex items-center gap-1">
                  <Box className="w-3 h-3" /> {machine.name}
                </span>
              )}
              {isActive && state && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700 flex items-center gap-1">
                  <Timer className="w-3 h-3" />
                  {ar ? `يوم ${state.currentDay} — ${state.daysLeft} متبقي` : `Dag ${state.currentDay} — ${state.daysLeft} kvar`}
                </span>
              )}
            </div>

            {/* Smart Alerts */}
            {alerts.length > 0 && (
              <div className="space-y-1.5">
                {alerts.map((alert, i) => {
                  const AlertIcon = alert.icon;
                  const colors = {
                    critical: "bg-red-50 border-red-200 text-red-700",
                    warning: "bg-amber-50 border-amber-200 text-amber-700",
                    info: "bg-blue-50 border-blue-200 text-blue-700",
                    success: "bg-emerald-50 border-emerald-200 text-emerald-700",
                  };
                  return (
                    <div key={i} className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${colors[alert.type]}`}>
                      <AlertIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>{alert.msg}</span>
                      {alert.type === "critical" && <Zap className="w-3 h-3 animate-pulse shrink-0" />}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              <StatBox label={ar ? "بيضة" : "Ägg"} value={cycle.eggsSet} color="slate" />
              {cycle.eggsHatched != null ? (
                <StatBox label={ar ? "صوص فقس" : "Kläckta"} value={cycle.eggsHatched} color="emerald" />
              ) : (
                <StatBox label={ar ? "صوص متوقع" : "Förväntat"} value={`~${expectedChicks}`} color="blue" />
              )}
              {hatchRate != null ? (
                <StatBox label={ar ? "نسبة الفقس" : "Kläckningsgrad"} value={`${hatchRate}%`} color={hatchRate >= 75 ? "emerald" : hatchRate >= 40 ? "amber" : "red"} />
              ) : machine ? (
                <StatBox label={ar ? "إشغال الماكينة" : "Beläggning"} value={`${occupancy}%`} color="violet" />
              ) : null}
              {isActive && state ? (
                <>
                  <StatBox label={ar ? "يوم متبقي" : "Dagar kvar"} value={state.daysLeft} color="orange" />
                  <StatBox label={ar ? "تاريخ الفقس" : "Kläckdatum"} value={state.expectedHatchDate.toLocaleDateString("ar-IQ", { month: "short", day: "numeric" })} color="sky" />
                  {machine && <StatBox label={ar ? "سعة الماكينة" : "Kapacitet"} value={machine.capacity} color="violet" />}
                </>
              ) : (
                <>
                  {cycle.actualHatchDate && <StatBox label={ar ? "تاريخ الفقس" : "Kläckdatum"} value={cycle.actualHatchDate} color="emerald" />}
                  {machine && <StatBox label={ar ? "الماكينة" : "Maskin"} value={machine.name} color="violet" small />}
                </>
              )}
            </div>

            {/* Ideal parameters display for active cycles */}
            {isActive && state && (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-orange-50/60 rounded-lg px-3 py-2 border border-orange-100">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Thermometer className="w-3.5 h-3.5 text-orange-600" />
                    <span className="text-xs font-semibold text-orange-700">{ar ? "الحرارة المطلوبة" : "Kräv temp"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-orange-700">{state.idealTemp.ideal}°C</span>
                    <span className="text-[10px] text-muted-foreground">({state.idealTemp.min} - {state.idealTemp.max}°C)</span>
                    {cycle.temperature != null && (
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                        parseFloat(cycle.temperature) >= state.idealTemp.min && parseFloat(cycle.temperature) <= state.idealTemp.max
                          ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                      }`}>
                        {ar ? "الحالي:" : "Nu:"} {cycle.temperature}°C
                      </span>
                    )}
                  </div>
                </div>
                <div className="bg-blue-50/60 rounded-lg px-3 py-2 border border-blue-100">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Droplets className="w-3.5 h-3.5 text-blue-600" />
                    <span className="text-xs font-semibold text-blue-700">{ar ? "الرطوبة المطلوبة" : "Kräv fukt"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-blue-700">{state.idealHum.ideal}%</span>
                    <span className="text-[10px] text-muted-foreground">({state.idealHum.min} - {state.idealHum.max}%)</span>
                    {cycle.humidity != null && (
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                        parseFloat(cycle.humidity) >= state.idealHum.min && parseFloat(cycle.humidity) <= state.idealHum.max
                          ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                      }`}>
                        {ar ? "الحالي:" : "Nu:"} {cycle.humidity}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Phase info */}
            <div className="flex flex-wrap gap-3 bg-blue-50/60 rounded-lg px-3 py-2 border border-blue-100">
              <span className="text-xs font-medium text-blue-700">{t("hatching.phase1.label")}</span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" /> {cycle.startDate}
                {cycle.setTime && <span className="flex items-center gap-0.5 mx-1"><Clock className="w-3 h-3" />{cycle.setTime}</span>}
              </span>
              {cycle.temperature != null && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Thermometer className="w-3 h-3" />{cycle.temperature}°C
                </span>
              )}
              {cycle.humidity != null && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Droplets className="w-3 h-3" />{cycle.humidity}%
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-3 bg-amber-50/60 rounded-lg px-3 py-2 border border-amber-100">
              <span className="text-xs font-medium text-amber-700">{t("hatching.phase2.label")}</span>
              {cycle.lockdownDate ? (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {cycle.lockdownDate}
                  {cycle.lockdownTime && <span className="flex items-center gap-0.5 mx-1"><Clock className="w-3 h-3" />{cycle.lockdownTime}</span>}
                </span>
              ) : isActive && state ? (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {ar ? "متوقع:" : "Förväntat:"} {state.lockdownDate.toLocaleDateString("ar-IQ", { month: "short", day: "numeric" })}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground/50">{t("hatching.notTransferred")}</span>
              )}
              {cycle.lockdownTemperature != null && (
                <span className="text-xs text-muted-foreground flex items-center gap-1"><Thermometer className="w-3 h-3" />{cycle.lockdownTemperature}°C</span>
              )}
              {cycle.lockdownHumidity != null && (
                <span className="text-xs text-muted-foreground flex items-center gap-1"><Droplets className="w-3 h-3" />{cycle.lockdownHumidity}%</span>
              )}
              <span className="text-xs text-muted-foreground">{t("hatching.expected")} {cycle.expectedHatchDate}</span>
              {cycle.actualHatchDate && <span className="text-xs text-emerald-600">{t("hatching.actual")} {cycle.actualHatchDate}</span>}
            </div>

            {/* Live tracker */}
            {isActive && <HatchingLiveTracker cycle={cycle} ar={ar} />}

            {/* Hatch rate bar for completed */}
            {cycle.status === "completed" && hatchRate != null && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${hatchRate >= 75 ? "bg-emerald-500" : hatchRate >= 40 ? "bg-amber-400" : "bg-red-400"}`}
                    style={{ width: `${Math.min(hatchRate, 100)}%` }}
                  />
                </div>
                <span className={`text-xs font-bold w-10 text-left ${hatchRate >= 75 ? "text-emerald-600" : hatchRate >= 40 ? "text-amber-600" : "text-red-500"}`}>{hatchRate}%</span>
              </div>
            )}

            {/* Expand for schedule */}
            {isActive && state && (
              <button onClick={() => setShowDetails(d => !d)} className="flex items-center gap-1.5 text-xs text-primary font-medium hover:underline">
                <Activity className="w-3.5 h-3.5" />
                {ar ? "جدول المهام والمراقبة" : "Uppgiftsschema och övervakning"}
                {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            )}
            {showDetails && isActive && state && (
              <div className="border border-primary/20 rounded-xl p-3 bg-primary/5">
                <p className="text-xs font-semibold text-primary mb-2 flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5" />
                  {ar ? "جدول المهام — لا تنسَ!" : "Uppgiftsschema — Glöm inte!"}
                </p>
                <IncubationSchedule state={state} ar={ar} />
              </div>
            )}

            {cycle.notes && (
              <p className="text-xs text-muted-foreground bg-muted/30 rounded p-2">{cycle.notes}</p>
            )}
          </div>

          {isAdmin && (
            <div className="flex flex-col gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={onEdit}><Pencil className="w-3.5 h-3.5" /></Button>
              <Button size="sm" variant="destructive" onClick={onDelete}><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatBox({ label, value, color, small }: { label: string; value: any; color: string; small?: boolean }) {
  const colorMap: Record<string, string> = {
    slate: "bg-slate-50 border-slate-100 text-slate-800",
    emerald: "bg-emerald-50 border-emerald-100 text-emerald-700",
    blue: "bg-blue-50 border-blue-100 text-blue-700",
    amber: "bg-amber-50 border-amber-100 text-amber-700",
    red: "bg-red-50 border-red-100 text-red-700",
    violet: "bg-violet-50 border-violet-100 text-violet-700",
    orange: "bg-orange-50 border-orange-100 text-orange-700",
    sky: "bg-sky-50 border-sky-100 text-sky-700",
  };
  const c = colorMap[color] || colorMap.slate;
  return (
    <div className={`rounded-lg px-3 py-2 border text-center ${c}`}>
      <p className={`font-bold leading-none ${small ? "text-sm" : "text-lg"}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

// ── Form ───────────────────────────────────────────────────────────────────
function CycleForm({ initial, onSubmit, onClose }: { initial?: any; onSubmit: (d: any) => void; onClose: () => void }) {
  const { t } = useLanguage();
  const today = new Date().toISOString().split("T")[0];
  const in18 = new Date(Date.now() + 18 * 86400000).toISOString().split("T")[0];
  const in21 = new Date(Date.now() + 21 * 86400000).toISOString().split("T")[0];
  const [form, setForm] = useState({
    batchName: initial?.batchName ?? "",
    eggsSet: initial?.eggsSet ?? 1,
    eggsHatched: initial?.eggsHatched ?? "",
    startDate: initial?.startDate ?? today,
    setTime: initial?.setTime ?? "",
    expectedHatchDate: initial?.expectedHatchDate ?? in21,
    actualHatchDate: initial?.actualHatchDate ?? "",
    lockdownDate: initial?.lockdownDate ?? in18,
    lockdownTime: initial?.lockdownTime ?? "",
    status: initial?.status ?? "incubating",
    temperature: initial?.temperature ?? "",
    humidity: initial?.humidity ?? "",
    lockdownTemperature: initial?.lockdownTemperature ?? "",
    lockdownHumidity: initial?.lockdownHumidity ?? "",
    notes: initial?.notes ?? "",
  });

  const toNum = (v: string) => v !== "" ? Number(v) : null;
  const toStr = (v: string) => v || null;

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        onSubmit({
          ...form,
          eggsHatched: toNum(String(form.eggsHatched)),
          temperature: toNum(String(form.temperature)),
          humidity: toNum(String(form.humidity)),
          lockdownTemperature: toNum(String(form.lockdownTemperature)),
          lockdownHumidity: toNum(String(form.lockdownHumidity)),
          actualHatchDate: toStr(form.actualHatchDate),
          setTime: toStr(form.setTime),
          lockdownDate: toStr(form.lockdownDate),
          lockdownTime: toStr(form.lockdownTime),
        });
      }}
      className="space-y-5 max-h-[70vh] overflow-y-auto pr-1"
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>{t("hatching.batchName")}</Label>
          <Input value={form.batchName} onChange={e => setForm(f => ({ ...f, batchName: e.target.value }))} placeholder={t("hatching.batchName.placeholder")} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("hatching.eggsSet")}</Label>
            <Input type="number" min={1} value={form.eggsSet} onChange={e => setForm(f => ({ ...f, eggsSet: Number(e.target.value) }))} required />
          </div>
          <div className="space-y-1.5">
            <Label>{t("hatching.status")}</Label>
            <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="incubating">{t("status.incubating")}</SelectItem>
                <SelectItem value="hatching">{t("status.hatching")}</SelectItem>
                <SelectItem value="completed">{t("status.completed")}</SelectItem>
                <SelectItem value="failed">{t("status.failed")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3">
        <div className="flex items-center gap-2 text-blue-700 font-semibold text-sm">
          <Thermometer className="w-4 h-4" />
          {t("hatching.phase1.title")}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("hatching.eggDate")}</Label>
            <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} required />
          </div>
          <div className="space-y-1.5">
            <Label>{t("hatching.setTime")}</Label>
            <Input type="time" value={form.setTime} onChange={e => setForm(f => ({ ...f, setTime: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("hatching.temperature")}</Label>
            <Input type="number" step="0.1" value={form.temperature} onChange={e => setForm(f => ({ ...f, temperature: e.target.value }))} placeholder="37.8" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("hatching.humidity")}</Label>
            <Input type="number" step="0.1" value={form.humidity} onChange={e => setForm(f => ({ ...f, humidity: e.target.value }))} placeholder="56" />
          </div>
        </div>
        <p className="text-xs text-blue-600/70"><Info className="w-3 h-3 inline ml-1" />{t("hatching.phase1.recommend")}</p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
        <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm">
          <ArrowLeftRight className="w-4 h-4" />
          {t("hatching.phase2.title")}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("hatching.transferDate")}</Label>
            <Input type="date" value={form.lockdownDate} onChange={e => setForm(f => ({ ...f, lockdownDate: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("hatching.transferTime")}</Label>
            <Input type="time" value={form.lockdownTime} onChange={e => setForm(f => ({ ...f, lockdownTime: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("hatching.temperature")}</Label>
            <Input type="number" step="0.1" value={form.lockdownTemperature} onChange={e => setForm(f => ({ ...f, lockdownTemperature: e.target.value }))} placeholder="37.2" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("hatching.humidity")}</Label>
            <Input type="number" step="0.1" value={form.lockdownHumidity} onChange={e => setForm(f => ({ ...f, lockdownHumidity: e.target.value }))} placeholder="70" />
          </div>
        </div>
        <p className="text-xs text-amber-600/70"><Info className="w-3 h-3 inline ml-1" />{t("hatching.phase2.recommend")}</p>
      </div>

      <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground font-semibold text-sm">
          <Egg className="w-4 h-4" />
          {t("hatching.results")}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("hatching.expectedDate")}</Label>
            <Input type="date" value={form.expectedHatchDate} onChange={e => setForm(f => ({ ...f, expectedHatchDate: e.target.value }))} required />
          </div>
          <div className="space-y-1.5">
            <Label>{t("hatching.actualDate")}</Label>
            <Input type="date" value={form.actualHatchDate} onChange={e => setForm(f => ({ ...f, actualHatchDate: e.target.value }))} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>{t("hatching.actualHatched")}</Label>
            <Input type="number" min={0} value={form.eggsHatched} onChange={e => setForm(f => ({ ...f, eggsHatched: e.target.value }))} placeholder={t("hatching.actualHatched.placeholder")} />
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>{t("hatching.additionalNotes")}</Label>
        <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder={t("hatching.optionalNotes")} />
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="submit">{t("hatching.saveBatch")}</Button>
      </div>
    </form>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function Hatching() {
  const { data: cycles, isLoading } = useListHatchingCycles({ query: { queryKey: getListHatchingCyclesQueryKey() } });
  const createCycle = useCreateHatchingCycle();
  const updateCycle = useUpdateHatchingCycle();
  const deleteCycle = useDeleteHatchingCycle();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const { t, lang } = useLanguage();
  const ar = lang === "ar";
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [filterMachine, setFilterMachine] = useState<string>("all");

  const { data: incubators = [] } = useQuery<any[]>({
    queryKey: ["incubators"],
    queryFn: async () => {
      const res = await fetch(apiPath("/incubators"), { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });

  const incubatorMap = useMemo(() => {
    const map = new Map<number, any>();
    incubators.forEach((inc: any) => map.set(inc.id, inc));
    return map;
  }, [incubators]);

  const STATUS_LABELS: Record<string, string> = {
    incubating: t("status.incubating"), hatching: t("status.hatching"),
    completed: t("status.completed"), failed: t("status.failed"),
  };
  const STATUS_COLORS: Record<string, string> = {
    incubating: "bg-blue-100 text-blue-700", hatching: "bg-amber-100 text-amber-700",
    completed: "bg-emerald-100 text-emerald-700", failed: "bg-red-100 text-red-700",
  };

  const sortById = (a: any, b: any) => a.id - b.id;

  const activeCycles = useMemo(() => (cycles?.filter((c: any) => c.status === "incubating" || c.status === "hatching") || []).sort(sortById), [cycles]);
  const allCyclesSorted = useMemo(() => (cycles || []).slice().sort(sortById), [cycles]);

  const filteredActive = filterMachine === "all" ? activeCycles : activeCycles.filter((c: any) => String(c.incubatorId) === filterMachine);
  const filteredAll = filterMachine === "all" ? allCyclesSorted : allCyclesSorted.filter((c: any) => String(c.incubatorId) === filterMachine);

  const refresh = () => qc.invalidateQueries({ queryKey: getListHatchingCyclesQueryKey() });

  const handleDelete = async () => {
    if (deleteId == null) return;
    try {
      await deleteCycle.mutateAsync({ id: deleteId });
      toast({ title: t("hatching.deleted") });
      setDeleteId(null);
      refresh();
    } catch (err: any) {
      toast({ title: t("common.deleteError"), description: err?.message, variant: "destructive" });
    }
  };

  // Global alerts summary
  const globalAlerts = useMemo(() => {
    const all: { type: string; msg: string; batch: string }[] = [];
    activeCycles.forEach((cycle: any) => {
      const state = computeCycleState(cycle);
      const machine = incubatorMap.get(cycle.incubatorId);
      const alerts = generateAlerts(cycle, state, machine);
      alerts.filter(a => a.type === "critical" || a.type === "warning").forEach(a => {
        all.push({ type: a.type, msg: a.msg, batch: cycle.batchName });
      });
    });
    return all;
  }, [activeCycles, incubatorMap]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("hatching.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("hatching.subtitle")}</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" />{t("hatching.newBatch")}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{t("hatching.addBatchTitle")}</DialogTitle></DialogHeader>
              <CycleForm
                onSubmit={async d => {
                  try {
                    await createCycle.mutateAsync({ data: d });
                    toast({ title: t("hatching.added") });
                    setOpen(false);
                    refresh();
                  } catch (err: any) {
                    toast({ title: t("common.addError"), description: err?.message ?? t("common.addErrorDesc"), variant: "destructive" });
                  }
                }}
                onClose={() => setOpen(false)}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Global alerts banner */}
      {globalAlerts.length > 0 && (
        <Card className="border-red-200 bg-gradient-to-br from-red-50/80 to-amber-50/50">
          <CardContent className="py-3 px-4 space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-bold text-red-700">
              <Bell className="w-4 h-4" />
              {ar ? `${globalAlerts.length} تنبيه يتطلب انتباهك` : `${globalAlerts.length} alerts need attention`}
            </div>
            {globalAlerts.slice(0, 5).map((a, i) => (
              <div key={i} className={`text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-2 ${a.type === "critical" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span className="font-medium">{a.batch}:</span> {a.msg}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Weather */}
      <MosulWeatherWidget ar={ar} />

      {/* Machine filter */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setFilterMachine("all")}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${filterMachine === "all" ? "bg-primary text-white border-primary" : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"}`}
        >
          {ar ? "جميع الماكينات" : "Alla maskiner"}
        </button>
        {incubators.map((inc: any) => {
          const activeCount = activeCycles.filter((c: any) => c.incubatorId === inc.id).length;
          return (
            <button
              key={inc.id}
              onClick={() => setFilterMachine(String(inc.id))}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${filterMachine === String(inc.id) ? "bg-primary text-white border-primary" : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"}`}
            >
              <Box className="w-3 h-3" />
              {inc.name}
              {activeCount > 0 && <span className={`w-4 h-4 text-[10px] rounded-full flex items-center justify-center ${filterMachine === String(inc.id) ? "bg-white/30" : "bg-primary/15 text-primary"}`}>{activeCount}</span>}
            </button>
          );
        })}

        <div className="flex flex-wrap gap-2 text-xs ms-auto">
          <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg border border-blue-200">
            <Thermometer className="w-3.5 h-3.5" />
            {t("hatching.legend.incubation")}
          </div>
          <div className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-lg border border-amber-200">
            <ArrowLeftRight className="w-3.5 h-3.5" />
            {t("hatching.legend.lockdown")}
          </div>
        </div>
      </div>

      {/* Active cycles - top section */}
      {filteredActive.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-primary flex items-center gap-1.5">
            <Activity className="w-4 h-4" />
            {ar ? `فقسات شغالة الآن (${filteredActive.length})` : `Pågående cykler (${filteredActive.length})`}
          </h2>
          {filteredActive.map((cycle: any) => (
            <CycleCard key={cycle.id} cycle={cycle} machine={incubatorMap.get(cycle.incubatorId)} ar={ar} t={t} STATUS_LABELS={STATUS_LABELS} STATUS_COLORS={STATUS_COLORS} isAdmin={isAdmin} onEdit={() => setEditItem(cycle)} onDelete={() => setDeleteId(cycle.id)} />
          ))}
        </div>
      )}

      {!isLoading && cycles && cycles.length > 0 && <HatchingAnalysis cycles={cycles} />}

      {/* All batches sorted 1→N */}
      {filteredAll.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-muted-foreground flex items-center gap-1.5">
            <Egg className="w-4 h-4" />
            {ar ? `جميع الفقسات بالترتيب (${filteredAll.length})` : `Alla cykler i ordning (${filteredAll.length})`}
          </h2>
          {filteredAll.map((cycle: any) => (
            <CycleCard key={cycle.id} cycle={cycle} machine={incubatorMap.get(cycle.incubatorId)} ar={ar} t={t} STATUS_LABELS={STATUS_LABELS} STATUS_COLORS={STATUS_COLORS} isAdmin={isAdmin} onEdit={() => setEditItem(cycle)} onDelete={() => setDeleteId(cycle.id)} />
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Card key={i}><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>)}</div>
      ) : cycles?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Egg className="w-12 h-12 text-muted-foreground/40 mb-4" />
            <h3 className="font-semibold text-lg mb-1">{t("hatching.noBatches")}</h3>
            <p className="text-muted-foreground text-sm">{t("hatching.noBatches.desc")}</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Edit dialog */}
      <Dialog open={!!editItem} onOpenChange={v => !v && setEditItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("hatching.editBatchTitle")}</DialogTitle></DialogHeader>
          {editItem && (
            <CycleForm
              initial={editItem}
              onSubmit={async d => {
                try {
                  await updateCycle.mutateAsync({ id: editItem.id, data: d });
                  toast({ title: t("hatching.updated") });
                  setEditItem(null);
                  refresh();
                } catch (err: any) {
                  toast({ title: t("common.updateError"), description: err?.message ?? t("common.addErrorDesc"), variant: "destructive" });
                }
              }}
              onClose={() => setEditItem(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteId != null} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("common.confirmDeleteBatch")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">{t("common.yesDelete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
