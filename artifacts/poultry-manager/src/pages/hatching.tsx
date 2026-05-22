import { useState, useEffect, useRef, useMemo } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Egg, Pencil, Trash2, Thermometer, Droplets, Clock, ArrowLeftRight, Info, TrendingUp, TrendingDown, Minus, Target, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Box, CloudSun, Wind, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiPath } from "@/lib/api";

// ── Mosul Weather Widget ────────────────────────────────────────────────────
// West Mosul coordinates: 36.34°N, 43.10°E
const MOSUL_LAT = 36.34;
const MOSUL_LON = 43.10;

function MosulWeatherWidget({ ar }: { ar: boolean }) {
  const { data: weather, isLoading } = useQuery({
    queryKey: ["mosul-weather"],
    queryFn: async () => {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${MOSUL_LAT}&longitude=${MOSUL_LON}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=Asia/Baghdad`
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
        <CardContent className="py-3 px-4">
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  const { temperature_2m: temp, relative_humidity_2m: hum, wind_speed_10m: wind } = weather.current;

  const tempWarning = temp > 42 || temp < 5;
  const humWarning = hum < 20 || hum > 85;

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
                {ar ? "لمقارنة ظروف البيئة مع الماكينة" : "Jämför utomhusförhållanden med maskin"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Thermometer className={`w-4 h-4 ${tempWarning ? "text-red-500" : "text-orange-500"}`} />
              <div className="text-center">
                <p className={`text-lg font-bold leading-none ${tempWarning ? "text-red-500" : "text-orange-600"}`}>{temp}°C</p>
                <p className="text-[9px] text-muted-foreground">{ar ? "الحرارة" : "Temp"}</p>
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
              ? `تحذير: الظروف الخارجية ${tempWarning ? "الحرارة مرتفعة جداً" : ""} ${humWarning ? "الرطوبة غير مناسبة" : ""} - تأكد من ضبط الماكينة`
              : `Warning: Outdoor conditions ${tempWarning ? "extreme temperature" : ""} ${humWarning ? "unsuitable humidity" : ""} - check machine settings`}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Real-Time Incubation Tracker ────────────────────────────────────────────
const BASE_URL_TRACKER = import.meta.env.BASE_URL ?? "/";

function HatchingLiveTracker({ cycle, ar }: { cycle: any; ar: boolean }) {
  const TOTAL_DAYS = 21;
  const clockOffsetRef = useRef(0);    // server - device (ms), updated on mount
  const [clockReady, setClockReady] = useState(false);

  // Sync clock offset once on mount
  useEffect(() => {
    const before = Date.now();
    fetch(`${BASE_URL_TRACKER}api/server-time`, { credentials: "include" })
      .then(r => r.json())
      .then((d: { timestamp: number }) => {
        const after = Date.now();
        const rtt = after - before;
        // Estimate server time at response midpoint to minimise RTT error
        clockOffsetRef.current = d.timestamp - (before + rtt / 2);
      })
      .catch(() => {
        // Graceful fallback: device time (offset stays 0)
        console.warn("[HatchingLiveTracker] server-time fetch failed — using device clock");
      })
      .finally(() => setClockReady(true));
  }, []);

  function computeState() {
    const start = cycle.startDate
      ? new Date(`${cycle.startDate}T${cycle.setTime ?? "00:00"}:00`)
      : null;
    if (!start) return null;

    // Use server-adjusted "now" for all calculations
    const nowMs    = Date.now() + clockOffsetRef.current;
    const elapsedMs = nowMs - start.getTime();
    if (elapsedMs < 0) return null;

    const elapsedDays  = elapsedMs / 86400000;
    const progress     = Math.min((elapsedDays / TOTAL_DAYS) * 100, 100);
    const currentDay   = Math.floor(elapsedDays) + 1;
    const hourInDay    = Math.floor((elapsedDays % 1) * 24);
    const daysLeft     = Math.max(0, TOTAL_DAYS - Math.ceil(elapsedDays));

    // Phase thresholds
    let phase: "early" | "mid" | "lockdown" | "hatching";
    if (cycle.status === "hatching") {
      phase = "hatching";
    } else if (elapsedDays >= 18) {
      phase = "lockdown";
    } else if (elapsedDays >= 4) {
      phase = "mid";
    } else {
      phase = "early";
    }

    return { progress, currentDay, hourInDay, daysLeft, phase, elapsedDays };
  }

  const [state, setState] = useState<ReturnType<typeof computeState>>(null);

  // Recompute once clock is ready, then every 60s
  useEffect(() => {
    if (!clockReady) return;
    setState(computeState());
    const id = setInterval(() => setState(computeState()), 60_000);
    return () => clearInterval(id);
  }, [clockReady, cycle.startDate, cycle.setTime, cycle.status]);

  if (!state) return null;
  if (cycle.status === "completed" || cycle.status === "failed") return null;

  const PHASE_CONFIG = {
    early:    { bar: "bg-emerald-500", bg: "bg-emerald-50",  border: "border-emerald-200", text: "text-emerald-700", label: ar ? "بداية الحضانة" : "Tidig inkubation",   dot: "bg-emerald-400" },
    mid:      { bar: "bg-blue-500",    bg: "bg-blue-50",     border: "border-blue-200",    text: "text-blue-700",    label: ar ? "حضانة متأخرة" : "Sen inkubation",        dot: "bg-blue-400"    },
    lockdown: { bar: "bg-amber-500",   bg: "bg-amber-50",    border: "border-amber-200",   text: "text-amber-700",   label: ar ? "إغلاق الهاتشر" : "Lockdown-fas",          dot: "bg-amber-400"   },
    hatching: { bar: "bg-red-500",     bg: "bg-red-50",      border: "border-red-200",     text: "text-red-700",     label: ar ? "فقس نشط 🐣" : "Aktiv kläckning 🐣",      dot: "bg-red-400 animate-pulse" },
  };

  const cfg = PHASE_CONFIG[state.phase];

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-3 mt-2 space-y-2`}>
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
        <div
          className={`h-full rounded-full transition-all duration-1000 ${cfg.bar}`}
          style={{ width: `${state.progress}%` }}
        />
        {/* Phase markers at 18/21 */}
        <div className="absolute top-0 h-full border-r border-dashed border-slate-300/80" style={{ left: "85.7%" }} />
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground/60">
        <span>{ar ? "يوم ١" : "Dag 1"}</span>
        <span className="text-[9px]">{ar ? "إغلاق ١٨" : "Lockdown 18"}</span>
        <span>{ar ? "يوم ٢١ — فقس" : "Dag 21 — kläckning"}</span>
      </div>
    </div>
  );
}

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
  const gapToTarget = TARGET - latest.rate;

  const PALETTE = ["#ef4444","#f59e0b","#3b82f6","#10b981","#8b5cf6","#f97316"];
  const maxRate = Math.max(TARGET, best) + 5;

  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "up" ? "text-emerald-600" : trend === "down" ? "text-red-500" : "text-amber-500";

  const recommendations: { icon: "warn" | "ok"; text: string }[] = [];
  if (latest.rate < 30) recommendations.push({ icon: "warn", text: "نسبة الفقس أقل من 30٪ — تحقق من جودة البيض ودرجة الحرارة والرطوبة بشكل فوري" });
  if (latest.rate >= 30 && latest.rate < TARGET) recommendations.push({ icon: "warn", text: `الهدف ${TARGET}٪ — فجوة ${gapToTarget} نقطة. اضبط: 50-55٪ أيام 1-18، ارفع إلى 70-75٪ في آخر 3 أيام (الهاتشر)، والتقليب كل 4-6 ساعات` });
  if (latest.rate >= TARGET) recommendations.push({ icon: "ok", text: `أنت فوق الهدف (${TARGET}٪). للوصول إلى 80-85٪: تأكد من صحة المولدات، وسلامة البيض قبل الإدخال` });
  if (trend === "down" && delta < -5) recommendations.push({ icon: "warn", text: `انخفضت النسبة ${Math.abs(delta)} نقطة مقارنة بالدفعة السابقة — راجع جودة بيض التفريخ والتهوية` });
  if (trend === "up") recommendations.push({ icon: "ok", text: "مسار تحسن مستمر — استمر بنفس الإجراءات مع توثيق الإعدادات التفصيلية" });
  recommendations.push({ icon: "ok", text: "إدخال البيض مساءً (8–10م) يوفر فقساً في ساعات الصباح الأفضل للمراقبة" });

  return (
    <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-purple-50/50">
      <CardHeader className="pb-0 pt-4 px-5">
        <button
          className="flex items-center justify-between w-full"
          onClick={() => setExpanded(e => !e)}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Target className="w-4 h-4 text-white" />
            </div>
            <div className="text-right">
              <CardTitle className="text-base font-bold text-indigo-900">تحليل مسار الفقس</CardTitle>
              <p className="text-xs text-indigo-500 font-normal mt-0.5">{completed.length} دفعات مكتملة · {totalEggs} بيضة · {totalHatched} فرخ</p>
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
              <div className="text-xs text-muted-foreground mt-0.5">المجموع الكلي</div>
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
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${(r.rate / maxRate) * 100}%`, backgroundColor: PALETTE[i % PALETTE.length] }}
                  />
                  <div
                    className="absolute top-0 h-full border-r-2 border-dashed border-slate-400/60"
                    style={{ left: `${(TARGET / maxRate) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-600 mb-1">توصيات الذكاء الزراعي</div>
            {recommendations.map((rec, i) => (
              <div key={i} className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg ${rec.icon === "warn" ? "bg-amber-50 border border-amber-200 text-amber-800" : "bg-emerald-50 border border-emerald-200 text-emerald-800"}`}>
                {rec.icon === "warn" ? <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                <span>{rec.text}</span>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

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
        <p className="text-xs text-blue-600/70">
          <Info className="w-3 h-3 inline ml-1" />
          {t("hatching.phase1.recommend")}
        </p>
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
        <p className="text-xs text-amber-600/70">
          <Info className="w-3 h-3 inline ml-1" />
          {t("hatching.phase2.recommend")}
        </p>
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

function CycleCard({ cycle, machine, ar, t, STATUS_LABELS, STATUS_COLORS, lang, isAdmin, onEdit, onDelete }: {
  cycle: any; machine: any; ar: boolean; t: any; STATUS_LABELS: Record<string,string>; STATUS_COLORS: Record<string,string>; lang: string; isAdmin: boolean; onEdit: () => void; onDelete: () => void;
}) {
  const hatchRate = cycle.eggsHatched != null ? Math.round((cycle.eggsHatched / cycle.eggsSet) * 100) : null;
  const isActive = cycle.status === "incubating" || cycle.status === "hatching";
  const occupancy = machine ? Math.round((cycle.eggsSet / machine.capacity) * 100) : 0;

  const startDateTime = cycle.startDate
    ? new Date(`${cycle.startDate}T${cycle.setTime ?? "00:00"}:00`)
    : null;
  const expectedDate = cycle.expectedHatchDate ? new Date(cycle.expectedHatchDate) : null;

  let daysElapsed = 0;
  let hoursElapsed = 0;
  if (startDateTime && isActive) {
    const now = new Date();
    const elapsed = now.getTime() - startDateTime.getTime();
    daysElapsed = Math.floor(elapsed / 86400000);
    hoursElapsed = Math.floor((elapsed % 86400000) / 3600000);
  }

  let daysToHatch = 0;
  if (expectedDate && isActive) {
    daysToHatch = Math.max(0, Math.ceil((expectedDate.getTime() - Date.now()) / 86400000));
  }

  const expectedChicks = cycle.eggsSet ? Math.round(cycle.eggsSet * 0.72) : 0;
  const costPerEgg = 500;
  const totalCost = cycle.eggsSet * costPerEgg;
  const expectedRevenue = expectedChicks * 1500;

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
                  <Box className="w-3 h-3" />
                  {machine.name}
                </span>
              )}
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100 text-center">
                <p className="text-lg font-bold text-slate-800">{cycle.eggsSet}</p>
                <p className="text-[10px] text-muted-foreground">{ar ? "بيضة" : "Ägg"}</p>
              </div>
              {cycle.eggsHatched != null ? (
                <div className="bg-emerald-50 rounded-lg px-3 py-2 border border-emerald-100 text-center">
                  <p className="text-lg font-bold text-emerald-700">{cycle.eggsHatched}</p>
                  <p className="text-[10px] text-muted-foreground">{ar ? "صوص فقس" : "Kläckta"}</p>
                </div>
              ) : (
                <div className="bg-blue-50 rounded-lg px-3 py-2 border border-blue-100 text-center">
                  <p className="text-lg font-bold text-blue-700">~{expectedChicks}</p>
                  <p className="text-[10px] text-muted-foreground">{ar ? "صوص متوقع" : "Förväntat"}</p>
                </div>
              )}
              {hatchRate != null ? (
                <div className={`rounded-lg px-3 py-2 border text-center ${hatchRate >= 75 ? "bg-emerald-50 border-emerald-100" : hatchRate >= 40 ? "bg-amber-50 border-amber-100" : "bg-red-50 border-red-100"}`}>
                  <p className={`text-lg font-bold ${hatchRate >= 75 ? "text-emerald-700" : hatchRate >= 40 ? "text-amber-700" : "text-red-700"}`}>{hatchRate}%</p>
                  <p className="text-[10px] text-muted-foreground">{ar ? "نسبة الفقس" : "Kläckningsgrad"}</p>
                </div>
              ) : machine ? (
                <div className="bg-violet-50 rounded-lg px-3 py-2 border border-violet-100 text-center">
                  <p className="text-lg font-bold text-violet-700">{occupancy}%</p>
                  <p className="text-[10px] text-muted-foreground">{ar ? "نسبة الإشغال" : "Beläggning"}</p>
                </div>
              ) : null}
              {isActive ? (
                <div className="bg-orange-50 rounded-lg px-3 py-2 border border-orange-100 text-center">
                  <p className="text-lg font-bold text-orange-700">{daysToHatch}</p>
                  <p className="text-[10px] text-muted-foreground">{ar ? "يوم للفقس" : "Dagar kvar"}</p>
                </div>
              ) : (
                <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100 text-center">
                  <p className="text-lg font-bold text-slate-700">{cycle.actualHatchDate || "—"}</p>
                  <p className="text-[10px] text-muted-foreground">{ar ? "تاريخ الفقس" : "Kläckdatum"}</p>
                </div>
              )}
            </div>

            {/* Machine info for active */}
            {isActive && machine && (
              <div className="bg-violet-50/60 rounded-lg px-3 py-2 border border-violet-100">
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <span className="font-medium text-violet-700 flex items-center gap-1"><Box className="w-3.5 h-3.5" />{machine.name}</span>
                  <span className="text-muted-foreground">{ar ? "السعة:" : "Kapacitet:"} {machine.capacity}</span>
                  <span className="text-muted-foreground">{ar ? "المستخدم:" : "Används:"} {cycle.eggsSet}/{machine.capacity} ({occupancy}%)</span>
                  <span className="text-muted-foreground">{ar ? "العمر:" : "Ålder:"} {daysElapsed} {ar ? "يوم" : "dag"} {hoursElapsed} {ar ? "ساعة" : "tim"}</span>
                </div>
              </div>
            )}

            {/* Phase info */}
            <div className="flex flex-wrap gap-3 bg-blue-50/60 rounded-lg px-3 py-2 border border-blue-100">
              <span className="text-xs font-medium text-blue-700">{t("hatching.phase1.label")}</span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                {cycle.startDate}
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
                  {cycle.lockdownDate}
                  {cycle.lockdownTime && <span className="flex items-center gap-0.5 mx-1"><Clock className="w-3 h-3" />{cycle.lockdownTime}</span>}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground/50">{t("hatching.notTransferred")}</span>
              )}
              {cycle.lockdownTemperature != null && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Thermometer className="w-3 h-3" />{cycle.lockdownTemperature}°C
                </span>
              )}
              {cycle.lockdownHumidity != null && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Droplets className="w-3 h-3" />{cycle.lockdownHumidity}%
                </span>
              )}
              <span className="text-xs text-muted-foreground">{t("hatching.expected")} {cycle.expectedHatchDate}</span>
              {cycle.actualHatchDate && <span className="text-xs text-emerald-600">{t("hatching.actual")} {cycle.actualHatchDate}</span>}
            </div>

            {/* Live tracker */}
            {isActive && <HatchingLiveTracker cycle={cycle} ar={ar} />}

            {/* Hatch rate bar */}
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

            {cycle.notes && (
              <p className="text-xs text-muted-foreground bg-muted/30 rounded p-2">{cycle.notes}</p>
            )}
          </div>

          {isAdmin && (
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={onEdit}><Pencil className="w-3.5 h-3.5" /></Button>
              <Button size="sm" variant="destructive" onClick={onDelete}><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

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

  const activeCycles = useMemo(() => cycles?.filter((c: any) => c.status === "incubating" || c.status === "hatching") || [], [cycles]);
  const completedCycles = useMemo(() => cycles?.filter((c: any) => c.status === "completed" || c.status === "failed") || [], [cycles]);

  const filteredActive = filterMachine === "all" ? activeCycles : activeCycles.filter((c: any) => String(c.incubatorId) === filterMachine);
  const filteredCompleted = filterMachine === "all" ? completedCycles : completedCycles.filter((c: any) => String(c.incubatorId) === filterMachine);

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

      {/* Weather Widget */}
      <MosulWeatherWidget ar={ar} />

      {/* Machine filter + summary */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setFilterMachine("all")}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${filterMachine === "all" ? "bg-primary text-white border-primary" : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"}`}
        >
          {ar ? "جميع الماكينات" : "Alla maskiner"}
        </button>
        {incubators.map((inc: any) => (
          <button
            key={inc.id}
            onClick={() => setFilterMachine(String(inc.id))}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${filterMachine === String(inc.id) ? "bg-primary text-white border-primary" : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"}`}
          >
            <Box className="w-3 h-3" />
            {inc.name}
            <span className="opacity-70">({inc.capacity})</span>
          </button>
        ))}

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

      {!isLoading && cycles && cycles.length > 0 && <HatchingAnalysis cycles={cycles} />}

      {/* Active cycles section */}
      {filteredActive.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-primary flex items-center gap-1.5">
            <Egg className="w-4 h-4" />
            {ar ? `فقسات نشطة (${filteredActive.length})` : `Aktiva cykler (${filteredActive.length})`}
          </h2>
          {filteredActive.map((cycle: any) => {
            const machine = incubatorMap.get(cycle.incubatorId);
            return <CycleCard key={cycle.id} cycle={cycle} machine={machine} ar={ar} t={t} STATUS_LABELS={STATUS_LABELS} STATUS_COLORS={STATUS_COLORS} lang={lang} isAdmin={isAdmin} onEdit={() => setEditItem(cycle)} onDelete={() => setDeleteId(cycle.id)} />;
          })}
        </div>
      )}

      {/* Completed cycles section */}
      {filteredCompleted.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            {ar ? `فقسات مكتملة (${filteredCompleted.length})` : `Slutförda cykler (${filteredCompleted.length})`}
          </h2>
          {filteredCompleted.map((cycle: any) => {
            const machine = incubatorMap.get(cycle.incubatorId);
            return <CycleCard key={cycle.id} cycle={cycle} machine={machine} ar={ar} t={t} STATUS_LABELS={STATUS_LABELS} STATUS_COLORS={STATUS_COLORS} lang={lang} isAdmin={isAdmin} onEdit={() => setEditItem(cycle)} onDelete={() => setDeleteId(cycle.id)} />;
          })}
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
