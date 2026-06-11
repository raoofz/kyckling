import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  useListHatchingCycles, getListHatchingCyclesQueryKey,
  useCreateHatchingCycle, useDeleteHatchingCycle, useUpdateHatchingCycle
} from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus, Egg, Pencil, Trash2, Thermometer, Droplets, Clock, ArrowLeftRight,
  Info, TrendingUp, TrendingDown, Minus, Target, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronUp, Box, Activity, Bell, Calendar,
  Timer, Shield, Eye, Zap, BarChart3, RefreshCw, Layers, Settings2,
  ChevronRight, DollarSign
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiPath } from "@/lib/api";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

// ── Constants ──────────────────────────────────────────────────────────────
const TOTAL_INCUBATION_DAYS = 21;
const LOCKDOWN_DAY = 18;

// ── MACHINES CONFIG (ثابت) ─────────────────────────────────────────────────
const MACHINES_CONFIG = [
  { id: "gimoka", name: "GIMOKA", nameAr: "جيموكا", capacity: 500, color: "violet" },
  { id: "iraq1",  name: "Iraq 1",  nameAr: "عراق 1",  capacity: 3000, color: "amber"  },
] as const;

const IDEAL = {
  tempDay1_18:  { min: 37.4, max: 37.8, ideal: 37.7 },
  tempDay18_21: { min: 36.5, max: 37.2, ideal: 36.9 },
  humDay1_18:   { min: 50,   max: 60,   ideal: 55   },
  humDay18_21:  { min: 65,   max: 75,   ideal: 70   },
  turningInterval: 4,
  candlingDays: [7, 14, 18],
};

// ── Utilities ──────────────────────────────────────────────────────────────
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
  const daysLeft = Math.max(0, TOTAL_INCUBATION_DAYS - Math.ceil(elapsedDays));
  const expectedHatchDate = new Date(start.getTime() + TOTAL_INCUBATION_DAYS * 86400000);
  const lockdownDate = new Date(start.getTime() + LOCKDOWN_DAY * 86400000);
  let phase: "early" | "development" | "lockdown" | "hatching" | "overdue";
  if (elapsedDays > TOTAL_INCUBATION_DAYS + 1)            phase = "overdue";
  else if (cycle.status === "hatching" || elapsedDays >= TOTAL_INCUBATION_DAYS) phase = "hatching";
  else if (elapsedDays >= LOCKDOWN_DAY)                   phase = "lockdown";
  else if (elapsedDays >= 4)                              phase = "development";
  else                                                    phase = "early";
  const isLockdown = elapsedDays >= LOCKDOWN_DAY;
  const idealTemp = isLockdown ? IDEAL.tempDay18_21 : IDEAL.tempDay1_18;
  const idealHum  = isLockdown ? IDEAL.humDay18_21  : IDEAL.humDay1_18;
  return { progress, currentDay, daysLeft, phase, elapsedDays, expectedHatchDate, lockdownDate, idealTemp, idealHum, isLockdown };
}

function generateAlerts(cycle: any, state: ReturnType<typeof computeCycleState>, machine: any) {
  if (!state) return [];
  const alerts: { type: "critical"|"warning"|"info"|"success"; msg: string }[] = [];
  if (state.phase === "overdue") alerts.push({ type:"critical", msg:"تجاوزت الفقسة 21 يوم! تحقق فوراً من الماكينة والبيض" });
  if (state.daysLeft <= 3 && state.daysLeft > 0 && state.phase !== "hatching") alerts.push({ type:"warning", msg:`باقي ${state.daysLeft} أيام فقط للفقس — جهّز المعدات` });
  if (state.daysLeft === 0) alerts.push({ type:"critical", msg:"اليوم هو يوم الفقس! راقب الماكينة باستمرار" });
  if (state.isLockdown && cycle.status === "incubating") alerts.push({ type:"warning", msg:"مرحلة الإغلاق — توقف عن التقليب وارفع الرطوبة لـ 70%" });
  if (cycle.temperature != null) {
    const t = parseFloat(cycle.temperature);
    if (t > state.idealTemp.max + 0.5) alerts.push({ type:"critical", msg:`حرارة مرتفعة جداً (${t}°C) — الحد ${state.idealTemp.max}°C` });
    else if (t < state.idealTemp.min - 0.5) alerts.push({ type:"critical", msg:`حرارة منخفضة جداً (${t}°C) — الحد ${state.idealTemp.min}°C` });
  }
  if (alerts.length === 0) alerts.push({ type:"success", msg:"كل شيء يعمل بشكل طبيعي" });
  return alerts;
}

// ── Live Progress Bar ──────────────────────────────────────────────────────
function LiveProgressBar({ cycle }: { cycle: any }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);
  const state = computeCycleState(cycle);
  if (!state) return null;
  const PHASE_CFG = {
    early:       { bar:"bg-emerald-500", text:"text-emerald-700", label:"مرحلة مبكرة" },
    development: { bar:"bg-blue-500",    text:"text-blue-700",    label:"مرحلة التطور" },
    lockdown:    { bar:"bg-amber-500",   text:"text-amber-700",   label:"مرحلة الإغلاق" },
    hatching:    { bar:"bg-red-500",     text:"text-red-700",     label:"فقس نشط" },
    overdue:     { bar:"bg-rose-600",    text:"text-rose-700",    label:"تأخر عن الموعد" },
  };
  const cfg = PHASE_CFG[state.phase];
  return (
    <div className="space-y-1.5">
      <div className={`flex items-center justify-between text-xs font-semibold ${cfg.text}`}>
        <span>{cfg.label} — يوم {state.currentDay}</span>
        <span>{state.daysLeft} يوم متبقي · {state.progress.toFixed(1)}%</span>
      </div>
      <div className="h-3 bg-slate-100 rounded-full overflow-hidden relative border border-slate-200">
        <div className={`h-full rounded-full transition-all duration-500 ${cfg.bar}`} style={{ width:`${state.progress}%` }} />
        {IDEAL.candlingDays.map(d => (
          <div key={d} className="absolute top-0 h-full border-r border-dashed border-slate-400/40" style={{ left:`${(d/TOTAL_INCUBATION_DAYS)*100}%` }} />
        ))}
        <div className="absolute top-0 h-full border-r-2 border-dashed border-amber-400/70" style={{ left:`${(LOCKDOWN_DAY/TOTAL_INCUBATION_DAYS)*100}%` }} />
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground/60">
        <span>يوم ١</span><span>فحص ٧</span><span>فحص ١٤</span><span>إغلاق ١٨</span><span>فقس ٢١</span>
      </div>
    </div>
  );
}

// ── StatBox ────────────────────────────────────────────────────────────────
function StatBox({ label, value, color, icon: Icon }: { label: string; value: any; color?: string; icon?: any }) {
  const colorMap: Record<string,string> = {
    slate:   "bg-slate-50   border-slate-200   text-slate-800",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    blue:    "bg-blue-50    border-blue-200    text-blue-700",
    amber:   "bg-amber-50   border-amber-200   text-amber-700",
    red:     "bg-red-50     border-red-200     text-red-700",
    violet:  "bg-violet-50  border-violet-200  text-violet-700",
    orange:  "bg-orange-50  border-orange-200  text-orange-700",
    sky:     "bg-sky-50     border-sky-200     text-sky-700",
  };
  const c = colorMap[color || "slate"];
  return (
    <div className={`rounded-xl px-3 py-2.5 border text-center ${c}`}>
      {Icon && <Icon className="w-4 h-4 mx-auto mb-1 opacity-60" />}
      <p className="text-lg font-bold leading-none">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

// ── Machine Card ───────────────────────────────────────────────────────────
function MachineCard({ incubator, activeCycle, onReadingSuccess }: {
  incubator: any; activeCycle: any; onReadingSuccess: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const machConf = MACHINES_CONFIG.find(m => m.name === incubator.name) || MACHINES_CONFIG[0];
  const realCapacity = machConf.capacity;
  const occupancy = activeCycle ? Math.round((activeCycle.eggsSet / realCapacity) * 100) : 0;
  const isActive = incubator.status === "active" || !!activeCycle;

  const { data: readings = [] } = useQuery<any[]>({
    queryKey: ["incubator-readings", incubator.id],
    queryFn: async () => {
      const r = await fetch(apiPath(`/incubators/${incubator.id}/readings`), { credentials:"include" });
      return r.ok ? r.json() : [];
    },
    enabled: expanded,
  });

  const chartData = useMemo(() =>
    readings.slice(0,40).reverse().map(r => ({
      time: new Date(r.recordedAt).toLocaleTimeString("ar", { hour:"2-digit", minute:"2-digit" }),
      temperature: r.temperature,
      humidity: r.humidity,
    })),
  [readings]);

  const state = activeCycle ? computeCycleState(activeCycle) : null;
  const expectedChicks = activeCycle ? Math.round(activeCycle.eggsSet * 0.72) : 0;

  const colorCls = {
    violet: { ring:"ring-violet-400", badge:"bg-violet-100 text-violet-700", icon:"text-violet-500", bar:"bg-violet-500", header:"from-violet-50 to-purple-50/40" },
    amber:  { ring:"ring-amber-400",  badge:"bg-amber-100  text-amber-700",  icon:"text-amber-500",  bar:"bg-amber-500",  header:"from-amber-50  to-yellow-50/40" },
  }[machConf.color] || { ring:"ring-primary", badge:"bg-primary/10 text-primary", icon:"text-primary", bar:"bg-primary", header:"from-muted/30 to-muted/10" };

  return (
    <Card className={`border-border/60 transition-all duration-200 hover:shadow-md ${isActive ? `ring-1 ${colorCls.ring}/40` : ""}`}>
      <CardHeader className={`pb-3 rounded-t-xl bg-gradient-to-br ${colorCls.header}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${isActive ? colorCls.badge : "bg-muted/50 text-muted-foreground"}`}>
              <Box className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base">{incubator.name}</CardTitle>
              <p className="text-xs text-muted-foreground">{machConf.nameAr} · سعة {realCapacity.toLocaleString()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`text-xs ${isActive ? colorCls.badge : "bg-muted/60 text-muted-foreground"} border-0`}>
              {isActive ? "نشطة" : "فارغة"}
            </Badge>
            <button onClick={() => setExpanded(e => !e)} className="p-1 rounded-lg hover:bg-black/5">
              <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* Capacity bar */}
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-muted-foreground">الإشغال</span>
            <span className="font-semibold">{activeCycle?.eggsSet || 0} / {realCapacity.toLocaleString()} بيضة · {occupancy}%</span>
          </div>
          <div className="h-2.5 bg-muted/50 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${colorCls.bar}`} style={{ width:`${Math.min(occupancy,100)}%` }} />
          </div>
        </div>

        {/* Live readings */}
        {incubator.latestReading && (
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/8 border border-red-100">
              <Thermometer className="w-4 h-4 text-red-500 shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground">الحرارة</p>
                <p className="text-sm font-bold text-red-600">{incubator.latestReading.temperature}°C</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-500/8 border border-blue-100">
              <Droplets className="w-4 h-4 text-blue-500 shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground">الرطوبة</p>
                <p className="text-sm font-bold text-blue-600">{incubator.latestReading.humidity}%</p>
              </div>
            </div>
          </div>
        )}

        {/* Active cycle info */}
        {activeCycle ? (
          <div className="space-y-3 p-3 rounded-xl bg-muted/30 border border-border/60">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold flex items-center gap-1.5">
                <Egg className="w-4 h-4 text-primary" />{activeCycle.batchName}
              </span>
              <span className="text-xs text-muted-foreground">{activeCycle.status}</span>
            </div>
            {state && <LiveProgressBar cycle={activeCycle} />}
            <div className="grid grid-cols-3 gap-2">
              <StatBox label="بيض" value={activeCycle.eggsSet} color="slate" />
              <StatBox label="صوص متوقع" value={`~${expectedChicks}`} color="emerald" />
              <StatBox label="يوم متبقي" value={state?.daysLeft ?? "—"} color="orange" />
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-sm text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
            <Box className="w-8 h-8 mx-auto mb-2 opacity-20" />
            <p>الماكينة فارغة</p>
          </div>
        )}

        {/* Expanded: chart */}
        {expanded && chartData.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border/40">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" />آخر القراءات
            </p>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-10" />
                  <XAxis dataKey="time" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} />
                  <Tooltip contentStyle={{ backgroundColor:"hsl(var(--card))", border:"1px solid hsl(var(--border))", borderRadius:8, fontSize:11 }} />
                  <Area type="monotone" dataKey="temperature" stroke="#ef4444" fill="#ef4444" fillOpacity={0.08} name="الحرارة" />
                  <Area type="monotone" dataKey="humidity"    stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.08} name="الرطوبة" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Cycle Card ─────────────────────────────────────────────────────────────
function CycleCard({ cycle, machine, isAdmin, onEdit, onDelete }: {
  cycle: any; machine: any; isAdmin: boolean; onEdit: () => void; onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isActive = cycle.status === "incubating" || cycle.status === "hatching";
  const state = isActive ? computeCycleState(cycle) : null;
  const alerts = isActive ? generateAlerts(cycle, state, machine) : [];
  const hatchRate = cycle.eggsHatched != null ? Math.round((cycle.eggsHatched / cycle.eggsSet) * 100) : null;

  const STATUS_COLORS: Record<string,string> = {
    incubating: "bg-blue-100 text-blue-700 border-blue-200",
    hatching:   "bg-amber-100 text-amber-700 border-amber-200",
    completed:  "bg-emerald-100 text-emerald-700 border-emerald-200",
    failed:     "bg-red-100 text-red-700 border-red-200",
  };
  const STATUS_LABELS: Record<string,string> = {
    incubating: "تحضين", hatching: "فقس", completed: "مكتملة", failed: "فاشلة"
  };

  const machConf = machine ? MACHINES_CONFIG.find(m => m.name === machine.name) : null;

  return (
    <Card className={`border-border/60 hover:shadow-md transition-all duration-200 ${isActive ? "ring-1 ring-primary/20" : ""}`}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm">{cycle.batchName}</h3>
            <Badge className={`text-[11px] border ${STATUS_COLORS[cycle.status] || "bg-muted text-muted-foreground"}`}>
              {STATUS_LABELS[cycle.status] || cycle.status}
            </Badge>
            {machine && (
              <Badge className={`text-[11px] border bg-violet-50 text-violet-700 border-violet-200`}>
                <Box className="w-3 h-3 mr-1" />{machine.name}
              </Badge>
            )}
            {isActive && state && (
              <Badge className="text-[11px] border bg-orange-50 text-orange-700 border-orange-200">
                <Timer className="w-3 h-3 mr-1" />يوم {state.currentDay} · {state.daysLeft} متبقي
              </Badge>
            )}
          </div>
          {isAdmin && (
            <div className="flex gap-1.5 shrink-0">
              <Button size="sm" variant="outline" onClick={onEdit} className="h-7 w-7 p-0"><Pencil className="w-3.5 h-3.5" /></Button>
              <Button size="sm" variant="destructive" onClick={onDelete} className="h-7 w-7 p-0"><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          )}
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="space-y-1 mb-3">
            {alerts.slice(0,2).map((a,i) => {
              const colors = { critical:"bg-red-50 border-red-200 text-red-700", warning:"bg-amber-50 border-amber-200 text-amber-700", info:"bg-blue-50 border-blue-200 text-blue-700", success:"bg-emerald-50 border-emerald-200 text-emerald-700" };
              return (
                <div key={i} className={`flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg border ${colors[a.type]}`}>
                  {a.type === "critical" ? <Zap className="w-3 h-3 shrink-0" /> : a.type === "warning" ? <AlertTriangle className="w-3 h-3 shrink-0" /> : <CheckCircle2 className="w-3 h-3 shrink-0" />}
                  {a.msg}
                </div>
              );
            })}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <StatBox label="بيض" value={cycle.eggsSet} color="slate" />
          {cycle.eggsHatched != null
            ? <StatBox label="صيصان" value={cycle.eggsHatched} color="emerald" />
            : <StatBox label="صوص متوقع" value={`~${Math.round(cycle.eggsSet*0.72)}`} color="blue" />
          }
          {hatchRate != null
            ? <StatBox label="نسبة الفقس" value={`${hatchRate}%`} color={hatchRate>=75?"emerald":hatchRate>=40?"amber":"red"} />
            : machine ? <StatBox label="إشغال الماكينة" value={`${machine ? Math.round((cycle.eggsSet / (machConf?.capacity || machine.capacity))*100) : 0}%`} color="violet" /> : null
          }
          {isActive && state
            ? <StatBox label="الفقس المتوقع" value={state.expectedHatchDate.toLocaleDateString("ar-IQ",{month:"short",day:"numeric"})} color="sky" />
            : cycle.actualHatchDate ? <StatBox label="تاريخ الفقس" value={cycle.actualHatchDate} color="emerald" /> : null
          }
        </div>

        {/* Progress for active */}
        {isActive && state && <LiveProgressBar cycle={cycle} />}

        {/* Hatch rate bar for completed */}
        {cycle.status === "completed" && hatchRate != null && (
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${hatchRate>=75?"bg-emerald-500":hatchRate>=40?"bg-amber-400":"bg-red-400"}`} style={{ width:`${Math.min(hatchRate,100)}%` }} />
            </div>
            <span className={`text-xs font-bold ${hatchRate>=75?"text-emerald-600":hatchRate>=40?"text-amber-600":"text-red-500"}`}>{hatchRate}%</span>
          </div>
        )}

        {/* Phase info */}
        <div className="flex flex-wrap gap-2 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />وضع: {cycle.startDate}</span>
          {cycle.lockdownDate && <span className="flex items-center gap-1"><ArrowLeftRight className="w-3 h-3" />تقليب: {cycle.lockdownDate}</span>}
          <span className="flex items-center gap-1"><Target className="w-3 h-3" />متوقع: {cycle.expectedHatchDate}</span>
          {cycle.temperature != null && <span className="flex items-center gap-1"><Thermometer className="w-3 h-3" />{cycle.temperature}°C</span>}
          {cycle.humidity != null && <span className="flex items-center gap-1"><Droplets className="w-3 h-3" />{cycle.humidity}%</span>}
        </div>

        {cycle.notes && <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-2.5 py-1.5 mt-2">{cycle.notes}</p>}
      </CardContent>
    </Card>
  );
}

// ── Hatching Analysis ──────────────────────────────────────────────────────
function HatchingAnalysis({ cycles }: { cycles: any[] }) {
  const completed = cycles.filter(c => c.status === "completed" && c.eggsHatched != null);
  if (completed.length < 2) return null;
  const rates = completed.map(c => ({ name: c.batchName, rate: Math.round((c.eggsHatched / c.eggsSet) * 100), eggs: c.eggsSet, hatched: c.eggsHatched }));
  const TARGET = 75;
  const best = Math.max(...rates.map(r => r.rate));
  const totalEggs = rates.reduce((s,r) => s+r.eggs, 0);
  const totalHatched = rates.reduce((s,r) => s+r.hatched, 0);
  const overallRate = Math.round((totalHatched / totalEggs) * 100);
  const latest = rates[rates.length - 1];
  const prev = rates[rates.length - 2];
  const delta = latest.rate - prev.rate;
  const trend = delta > 3 ? "up" : delta < -3 ? "down" : "stable";
  const PALETTE = ["#ef4444","#f59e0b","#3b82f6","#10b981","#8b5cf6","#f97316"];
  const maxRate = Math.max(TARGET, best) + 5;

  return (
    <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50/60 to-purple-50/40">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-indigo-900">تحليل مسار الفقس</CardTitle>
              <p className="text-xs text-indigo-500 font-normal">{completed.length} دفعات · {totalEggs} بيضة · {totalHatched} صوص</p>
            </div>
          </div>
          <div className={`flex items-center gap-1 text-sm font-bold ${trend==="up"?"text-emerald-600":trend==="down"?"text-red-500":"text-amber-500"}`}>
            {trend==="up"?<TrendingUp className="w-4 h-4"/>:trend==="down"?<TrendingDown className="w-4 h-4"/>:<Minus className="w-4 h-4"/>}
            {trend==="up"?"تحسن":trend==="down"?"تراجع":"مستقر"}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
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
        <div className="space-y-2">
          {rates.map((r,i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 truncate max-w-[55%]">{r.name}</span>
                <span className={`font-bold ${r.rate>=TARGET?"text-emerald-600":r.rate>=40?"text-amber-600":"text-red-500"}`}>{r.rate}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden relative">
                <div className="h-full rounded-full" style={{ width:`${(r.rate/maxRate)*100}%`, backgroundColor: PALETTE[i%PALETTE.length] }} />
                <div className="absolute top-0 h-full border-r-2 border-dashed border-slate-400/60" style={{ left:`${(TARGET/maxRate)*100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Cycle Form ─────────────────────────────────────────────────────────────
function CycleForm({ initial, incubators, onSubmit, onClose }: { initial?: any; incubators: any[]; onSubmit: (d: any) => void; onClose: () => void }) {
  const today = new Date().toISOString().split("T")[0];
  const in18 = new Date(Date.now() + 18*86400000).toISOString().split("T")[0];
  const in21 = new Date(Date.now() + 21*86400000).toISOString().split("T")[0];
  const [form, setForm] = useState({
    batchName: initial?.batchName ?? "",
    eggType:   initial?.eggType ?? "بيض مخصب",
    eggsSet:   initial?.eggsSet ?? 1,
    incubatorId: initial?.incubatorId ?? (incubators[0]?.id ?? ""),
    startDate: initial?.startDate ?? today,
    setTime:   initial?.setTime ?? "",
    lockdownDate:  initial?.lockdownDate ?? in18,
    expectedHatchDate: initial?.expectedHatchDate ?? in21,
    eggsHatched: initial?.eggsHatched ?? "",
    unhatched:   initial?.unhatched ?? "",
    dead:        initial?.dead ?? "",
    status:    initial?.status ?? "incubating",
    notes:     initial?.notes ?? "",
  });
  const toNum = (v: any) => v !== "" && v != null ? Number(v) : null;
  const toStr = (v: string) => v || null;

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit({ ...form, eggsSet: Number(form.eggsSet), incubatorId: Number(form.incubatorId), eggsHatched: toNum(form.eggsHatched), setTime: toStr(form.setTime), lockdownDate: toStr(form.lockdownDate), notes: toStr(form.notes) }); }}
      className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <Label>اسم الفقسة</Label>
          <Input value={form.batchName} onChange={e => setForm(f=>({...f,batchName:e.target.value}))} required />
        </div>
        <div className="space-y-1">
          <Label>نوع البيض</Label>
          <Input value={form.eggType} onChange={e => setForm(f=>({...f,eggType:e.target.value}))} placeholder="بيض مخصب" />
        </div>
        <div className="space-y-1">
          <Label>عدد البيض</Label>
          <Input type="number" min={1} value={form.eggsSet} onChange={e => setForm(f=>({...f,eggsSet:Number(e.target.value)}))} required />
        </div>
        <div className="col-span-2 space-y-1">
          <Label>الماكينة</Label>
          <Select value={String(form.incubatorId)} onValueChange={v => setForm(f=>({...f,incubatorId:Number(v)}))}>
            <SelectTrigger><SelectValue placeholder="اختر الماكينة" /></SelectTrigger>
            <SelectContent>
              {incubators.map((inc: any) => {
                const mc = MACHINES_CONFIG.find(m => m.name === inc.name);
                return <SelectItem key={inc.id} value={String(inc.id)}>{inc.name} — سعة {(mc?.capacity || inc.capacity).toLocaleString()}</SelectItem>;
              })}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>تاريخ وضع البيض</Label>
          <Input type="date" value={form.startDate} onChange={e => setForm(f=>({...f,startDate:e.target.value}))} required />
        </div>
        <div className="space-y-1">
          <Label>وقت وضع البيض</Label>
          <Input type="time" value={form.setTime} onChange={e => setForm(f=>({...f,setTime:e.target.value}))} />
        </div>
        <div className="space-y-1">
          <Label>تاريخ وقف التقليب</Label>
          <Input type="date" value={form.lockdownDate} onChange={e => setForm(f=>({...f,lockdownDate:e.target.value}))} />
        </div>
        <div className="space-y-1">
          <Label>تاريخ الفقس المتوقع</Label>
          <Input type="date" value={form.expectedHatchDate} onChange={e => setForm(f=>({...f,expectedHatchDate:e.target.value}))} required />
        </div>
        <div className="space-y-1">
          <Label>عدد الصيصان</Label>
          <Input type="number" min={0} value={form.eggsHatched} onChange={e => setForm(f=>({...f,eggsHatched:e.target.value}))} />
        </div>
        <div className="space-y-1">
          <Label>النافق</Label>
          <Input type="number" min={0} value={form.dead} onChange={e => setForm(f=>({...f,dead:e.target.value}))} />
        </div>
        <div className="col-span-2 space-y-1">
          <Label>الحالة</Label>
          <Select value={form.status} onValueChange={v => setForm(f=>({...f,status:v}))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="incubating">تحضين</SelectItem>
              <SelectItem value="hatching">فقس</SelectItem>
              <SelectItem value="completed">مكتملة</SelectItem>
              <SelectItem value="failed">فاشلة</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-1">
          <Label>ملاحظات</Label>
          <Input value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <Button type="button" variant="outline" onClick={onClose}>إلغاء</Button>
        <Button type="submit">حفظ</Button>
      </div>
    </form>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function Hatching() {
  const { data: cycles, isLoading: cyclesLoading } = useListHatchingCycles({ query: { queryKey: getListHatchingCyclesQueryKey() } });
  const createCycle  = useCreateHatchingCycle();
  const updateCycle  = useUpdateHatchingCycle();
  const deleteCycle  = useDeleteHatchingCycle();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const { lang } = useLanguage();

  const [addOpen,    setAddOpen]    = useState(false);
  const [editItem,   setEditItem]   = useState<any>(null);
  const [deleteId,   setDeleteId]   = useState<number | null>(null);
  const [activeTab,  setActiveTab]  = useState<"batches"|"machines">("batches");

  // Fetch incubators
  const { data: incubators = [], isLoading: incLoading } = useQuery<any[]>({
    queryKey: ["incubators"],
    queryFn: async () => {
      const r = await fetch(apiPath("/incubators"), { credentials: "include" });
      return r.ok ? r.json() : [];
    },
    refetchInterval: 30000,
  });

  const incubatorMap = useMemo(() => {
    const m = new Map<number,any>();
    incubators.forEach((inc:any) => m.set(inc.id, inc));
    return m;
  }, [incubators]);

  const sortById = (a: any, b: any) => a.id - b.id;
  const activeCycles = useMemo(() =>
    (cycles?.filter((c:any) => c.status==="incubating"||c.status==="hatching") || []).sort(sortById),
  [cycles]);
  const allCycles = useMemo(() =>
    (cycles || []).slice().sort(sortById),
  [cycles]);

  // Stats
  const totalEggs    = activeCycles.reduce((s:number,c:any) => s + c.eggsSet, 0);
  const totalHatched = (cycles||[]).filter((c:any)=>c.eggsHatched!=null).reduce((s:number,c:any) => s + (c.eggsHatched||0), 0);
  const completedWithRate = (cycles||[]).filter((c:any)=>c.status==="completed"&&c.eggsHatched!=null);
  const avgRate = completedWithRate.length
    ? Math.round(completedWithRate.reduce((s:number,c:any) => s + (c.eggsHatched/c.eggsSet)*100, 0) / completedWithRate.length)
    : 0;

  // Global alerts
  const globalAlerts = useMemo(() => {
    const all: {type:string;msg:string;batch:string}[] = [];
    activeCycles.forEach((cycle:any) => {
      const state = computeCycleState(cycle);
      const machine = incubatorMap.get(cycle.incubatorId);
      const alerts = generateAlerts(cycle, state, machine);
      alerts.filter(a => a.type==="critical"||a.type==="warning").forEach(a => {
        all.push({ type:a.type, msg:a.msg, batch:cycle.batchName });
      });
    });
    return all;
  }, [activeCycles, incubatorMap]);

  const refresh = () => qc.invalidateQueries({ queryKey: getListHatchingCyclesQueryKey() });

  const handleDelete = async () => {
    if (deleteId == null) return;
    try {
      await deleteCycle.mutateAsync({ id: deleteId });
      toast({ title: "تم حذف الفقسة" });
      setDeleteId(null);
      refresh();
    } catch(err: any) {
      toast({ title: "خطأ في الحذف", description: err?.message, variant:"destructive" });
    }
  };

  const isLoading = cyclesLoading || incLoading;

  return (
    <div className="space-y-5 animate-in fade-in duration-300">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Egg className="w-7 h-7 text-primary" />
            مركز التفقيس والماكينات
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">كل فقسة مرتبطة بماكينتها — قراءات حية وقرارات واضحة</p>
        </div>
        {isAdmin && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" />إضافة فقسة</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>إضافة فقسة جديدة</DialogTitle></DialogHeader>
              <CycleForm
                incubators={incubators}
                onSubmit={async d => {
                  try {
                    await createCycle.mutateAsync({ data: d });
                    toast({ title: "تمت إضافة الفقسة" });
                    setAddOpen(false);
                    refresh();
                  } catch(err: any) {
                    toast({ title: "خطأ", description: err?.message, variant:"destructive" });
                  }
                }}
                onClose={() => setAddOpen(false)}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* ── Summary Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/2">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{activeCycles.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">فقسات نشطة</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-gradient-to-br from-slate-50 to-white">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-700">{totalEggs.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">بيض في الماكينات</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{totalHatched.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">صيصان مسجلة</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-white">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{avgRate}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">متوسط الفقس</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Global Alerts ── */}
      {globalAlerts.length > 0 && (
        <Card className="border-red-200 bg-gradient-to-br from-red-50/80 to-amber-50/40">
          <CardContent className="py-3 px-4 space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-bold text-red-700">
              <Bell className="w-4 h-4" />{globalAlerts.length} تنبيه يتطلب انتباهك
            </div>
            {globalAlerts.slice(0,4).map((a,i) => (
              <div key={i} className={`text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-2 ${a.type==="critical"?"bg-red-100 text-red-700":"bg-amber-100 text-amber-700"}`}>
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span className="font-medium">{a.batch}:</span> {a.msg}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 p-1 bg-muted/40 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab("batches")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab==="batches" ? "bg-white shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Layers className="w-4 h-4" />
          الفقسات
          <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${activeTab==="batches"?"bg-primary/10 text-primary":"bg-muted text-muted-foreground"}`}>
            {activeCycles.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("machines")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab==="machines" ? "bg-white shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Box className="w-4 h-4" />
          الماكينات
          <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${activeTab==="machines"?"bg-primary/10 text-primary":"bg-muted text-muted-foreground"}`}>
            {incubators.length}
          </span>
        </button>
      </div>

      {/* ── TAB: BATCHES ── */}
      {activeTab === "batches" && (
        <div className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map(i=><Skeleton key={i} className="h-32 w-full rounded-xl"/>)}</div>
          ) : (
            <>
              {/* Active cycles */}
              {activeCycles.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-bold text-primary flex items-center gap-1.5">
                    <Activity className="w-4 h-4" />فقسات شغالة الآن ({activeCycles.length})
                  </h2>
                  {activeCycles.map((cycle:any) => (
                    <CycleCard key={cycle.id} cycle={cycle} machine={incubatorMap.get(cycle.incubatorId)} isAdmin={isAdmin} onEdit={() => setEditItem(cycle)} onDelete={() => setDeleteId(cycle.id)} />
                  ))}
                </div>
              )}

              {/* Analysis */}
              {cycles && cycles.length > 0 && <HatchingAnalysis cycles={cycles} />}

              {/* All cycles */}
              {allCycles.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-bold text-muted-foreground flex items-center gap-1.5">
                    <Egg className="w-4 h-4" />جميع الفقسات ({allCycles.length})
                  </h2>
                  {allCycles.map((cycle:any) => (
                    <CycleCard key={cycle.id} cycle={cycle} machine={incubatorMap.get(cycle.incubatorId)} isAdmin={isAdmin} onEdit={() => setEditItem(cycle)} onDelete={() => setDeleteId(cycle.id)} />
                  ))}
                </div>
              )}

              {!isLoading && allCycles.length === 0 && (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                    <Egg className="w-12 h-12 text-muted-foreground/30 mb-4" />
                    <h3 className="font-semibold text-lg mb-1">لا توجد فقسات</h3>
                    <p className="text-muted-foreground text-sm">أضف فقسة جديدة للبدء</p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ── TAB: MACHINES ── */}
      {activeTab === "machines" && (
        <div className="space-y-4">
          {/* Machine info banner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {MACHINES_CONFIG.map(mc => {
              const incubator = incubators.find((i:any) => i.name === mc.name);
              const activeCycle = incubator
                ? activeCycles.find((c:any) => c.incubatorId === incubator.id)
                : null;
              const occupancy = activeCycle ? Math.round((activeCycle.eggsSet / mc.capacity) * 100) : 0;
              const colorBadge = mc.color === "amber" ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-violet-100 text-violet-700 border-violet-200";
              const colorBar = mc.color === "amber" ? "bg-amber-500" : "bg-violet-500";
              return (
                <Card key={mc.id} className="border-border/60">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-bold text-base">{mc.name}</h3>
                        <p className="text-xs text-muted-foreground">{mc.nameAr} · سعة {mc.capacity.toLocaleString()} بيضة</p>
                      </div>
                      <Badge className={`border text-xs ${colorBadge}`}>
                        {activeCycle ? "نشطة" : "فارغة"}
                      </Badge>
                    </div>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-muted-foreground">الإشغال الحالي</span>
                      <span className="font-semibold">{activeCycle?.eggsSet || 0} / {mc.capacity.toLocaleString()} · {occupancy}%</span>
                    </div>
                    <div className="h-3 bg-muted/40 rounded-full overflow-hidden mb-3">
                      <div className={`h-full rounded-full ${colorBar}`} style={{ width:`${Math.min(occupancy,100)}%` }} />
                    </div>
                    {!incubator && (
                      <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-2.5 py-1.5 border border-amber-200 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />الماكينة غير مسجلة في النظام — يرجى إضافتها من قسم الإعدادات
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Full machine cards */}
          {incLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[1,2].map(i=><Skeleton key={i} className="h-64 rounded-xl"/>)}
            </div>
          ) : incubators.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Box className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>لا توجد ماكينات مسجلة</p>
                <p className="text-sm mt-1">أضف الماكينتين (GIMOKA و Iraq 1) من صفحة الماكينات</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {incubators.map((inc:any) => {
                const activeCycle = activeCycles.find((c:any) => c.incubatorId === inc.id);
                return <MachineCard key={inc.id} incubator={inc} activeCycle={activeCycle} onReadingSuccess={() => qc.invalidateQueries({ queryKey: ["incubators"] })} />;
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editItem} onOpenChange={v => !v && setEditItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>تعديل فقسة</DialogTitle></DialogHeader>
          {editItem && (
            <CycleForm
              initial={editItem}
              incubators={incubators}
              onSubmit={async d => {
                try {
                  await updateCycle.mutateAsync({ id: editItem.id, data: d });
                  toast({ title: "تم التعديل" });
                  setEditItem(null);
                  refresh();
                } catch(err: any) {
                  toast({ title: "خطأ", description: err?.message, variant:"destructive" });
                }
              }}
              onClose={() => setEditItem(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <AlertDialog open={deleteId != null} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>هل تريد حذف هذه الفقسة؟ لا يمكن التراجع.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">نعم، احذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
