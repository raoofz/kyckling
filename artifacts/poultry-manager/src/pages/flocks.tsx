import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Bird, Plus, Pencil, Trash2, Heart, Egg, AlertTriangle,
  ChevronRight, Activity, Search, Filter,
  X, CheckCircle2, Calendar, ArrowUpDown, Stethoscope, Wheat,
  ShoppingCart, Box, TrendingUp, Clock, Users, Package,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import FlockIntelligencePanel from "@/components/FlockIntelligencePanel";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Flock {
  id: number;
  name: string;
  breed: string;
  count: number;
  ageDays: number;
  birthDate: string | null;
  purpose: string;
  healthStatus: string;
  feedConsumptionKg: number | null;
  dailyEggTarget: number | null;
  notes: string | null;
  createdAt: string;
  totalEggs7d: number;
  avgDaily7d: number;
  latestLogDate: string | null;
}

interface ProductionLog {
  id: number;
  flockId: number;
  date: string;
  eggCount: number;
  notes: string | null;
  createdAt: string;
}

interface HealthLog {
  id: number;
  flockId: number;
  date: string;
  status: string;
  symptoms: string | null;
  treatment: string | null;
  notes: string | null;
  createdAt: string;
}

interface HatchingCycle {
  id: number;
  batchName: string;
  status: string;
  eggsSet: number;
  eggsHatched: number | null;
  startDate: string | null;
  setTime: string | null;
  incubatorId: number | null;
  notes: string | null;
}

interface Sale {
  id: number;
  hatchingCycleId: number | null;
  quantity: number;
  totalPrice: string;
  date: string;
}

interface Incubator {
  id: number;
  name: string;
  capacity: number;
}

interface BatchChickenInfo {
  cycle: HatchingCycle;
  machineName: string;
  totalHatched: number;
  totalSold: number;
  remaining: number;
  salesRevenue: number;
  ageDays: number;
  isActive: boolean;
  flocks: Flock[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL ?? "/";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}api/${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

function calcAgeDays(birthDate: string | null, ageDays: number) {
  if (!birthDate) return ageDays;
  const start = new Date(birthDate);
  const now = new Date();
  start.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 86_400_000));
}

function ageLabel(days: number, ar: boolean) {
  if (days < 30) return ar ? `${days} يوم` : `${days} dagar`;
  if (days < 365) return ar ? `${Math.round(days / 30)} شهر` : `${Math.round(days / 30)} mån`;
  return ar ? `${(days / 365).toFixed(1)} سنة` : `${(days / 365).toFixed(1)} år`;
}

function cycleDays(startDate: string | null): number {
  if (!startDate) return 0;
  const start = new Date(startDate);
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 86_400_000));
}

const fmt = (n: number) => n.toLocaleString("ar-IQ");

// ── Health / Purpose meta ─────────────────────────────────────────────────────

const HEALTH_META: Record<string, { labelAr: string; labelSv: string; color: string; bg: string; border: string; icon: typeof CheckCircle2 }> = {
  healthy: { labelAr: "بصحة جيدة", labelSv: "Frisk", color: "#10b981", bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-200 dark:border-emerald-800", icon: CheckCircle2 },
  sick: { labelAr: "مريضة", labelSv: "Sjuk", color: "#ef4444", bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-200 dark:border-red-800", icon: AlertTriangle },
  recovering: { labelAr: "في التعافي", labelSv: "Återhämtning", color: "#f59e0b", bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800", icon: Activity },
  quarantine: { labelAr: "حجر صحي", labelSv: "Karantän", color: "#8b5cf6", bg: "bg-violet-50 dark:bg-violet-950/30", border: "border-violet-200 dark:border-violet-800", icon: AlertTriangle },
  treated: { labelAr: "تمت المعالجة", labelSv: "Behandlad", color: "#3b82f6", bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-200 dark:border-blue-800", icon: CheckCircle2 },
};
const getHealth = (s: string) => HEALTH_META[s] ?? HEALTH_META.healthy;

const PURPOSE_META: Record<string, { labelAr: string; labelSv: string; emoji: string; color: string }> = {
  eggs: { labelAr: "بياض", labelSv: "Ägg", emoji: "🥚", color: "text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800" },
  meat: { labelAr: "لحم", labelSv: "Kött", emoji: "🍗", color: "text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800" },
  hatching: { labelAr: "تفقيس", labelSv: "Kläckning", emoji: "🐣", color: "text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" },
  mixed: { labelAr: "مختلط", labelSv: "Blandat", emoji: "🔄", color: "text-blue-700 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800" },
};
const getPurpose = (p: string) => PURPOSE_META[p] ?? PURPOSE_META.mixed;

// ══ BATCH CARD ═══════════════════════════════════════════════════════════════

function BatchCard({ batch, ar, onViewFlocks }: {
  batch: BatchChickenInfo; ar: boolean; onViewFlocks: (b: BatchChickenInfo) => void;
}) {
  const isCompleted = batch.cycle.status === "completed";
  const isFailed = batch.cycle.status === "failed";
  const isIncubating = batch.cycle.status === "incubating" || batch.cycle.status === "hatching";
  const hatchRate = batch.cycle.eggsSet > 0 && batch.totalHatched > 0
    ? Math.round((batch.totalHatched / batch.cycle.eggsSet) * 100) : 0;

  const statusConfig = isIncubating
    ? { label: ar ? "قيد التفقيس" : "Inkuberar", color: "text-blue-600", bg: "bg-blue-100", border: "border-blue-300", dot: "bg-blue-500 animate-pulse" }
    : isCompleted
      ? batch.remaining > 0
        ? { label: ar ? "دجاج موجود" : "Kycklingar kvar", color: "text-emerald-600", bg: "bg-emerald-100", border: "border-emerald-300", dot: "bg-emerald-500" }
        : { label: ar ? "تم البيع بالكامل" : "Alla sålda", color: "text-gray-500", bg: "bg-gray-100", border: "border-gray-300", dot: "bg-gray-400" }
      : { label: ar ? "فشلت" : "Misslyckad", color: "text-red-500", bg: "bg-red-100", border: "border-red-300", dot: "bg-red-500" };

  return (
    <Card className={`overflow-hidden transition-all duration-300 hover:shadow-lg ${batch.remaining > 0 ? "border-emerald-200 dark:border-emerald-800" : "border-border/50"}`}>
      {/* Color strip */}
      <div className={`h-1.5 ${batch.remaining > 0 ? "bg-gradient-to-r from-emerald-400 to-teal-500" : isIncubating ? "bg-gradient-to-r from-blue-400 to-indigo-500" : "bg-gray-300"}`} />

      <CardContent className="p-4 space-y-3">
        {/* Row 1: batch name + status */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-bold text-foreground text-sm leading-snug truncate">
              {batch.cycle.batchName || (ar ? `الفقسة #${batch.cycle.id}` : `Sats #${batch.cycle.id}`)}
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
              <Box className="w-3 h-3" />
              {batch.machineName}
            </p>
          </div>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 ${statusConfig.color} ${statusConfig.bg} border ${statusConfig.border}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
            {statusConfig.label}
          </div>
        </div>

        {/* Row 2: Stats flow */}
        <div className="grid grid-cols-4 gap-1">
          <div className="bg-muted/50 rounded-lg py-2 text-center">
            <div className="text-lg font-black text-foreground leading-none">{fmt(batch.cycle.eggsSet)}</div>
            <div className="text-[8px] text-muted-foreground mt-1">{ar ? "بيضة" : "Ägg"}</div>
          </div>
          <div className="bg-muted/50 rounded-lg py-2 text-center">
            <div className="text-lg font-black text-amber-600 leading-none">
              {batch.totalHatched > 0 ? fmt(batch.totalHatched) : "—"}
            </div>
            <div className="text-[8px] text-muted-foreground mt-1">{ar ? "فقست" : "Kläckta"}</div>
          </div>
          <div className="bg-muted/50 rounded-lg py-2 text-center">
            <div className="text-lg font-black text-blue-600 leading-none">{fmt(batch.totalSold)}</div>
            <div className="text-[8px] text-muted-foreground mt-1">{ar ? "بيعت" : "Sålda"}</div>
          </div>
          <div className={`rounded-lg py-2 text-center ${batch.remaining > 0 ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-muted/50"}`}>
            <div className={`text-lg font-black leading-none ${batch.remaining > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
              {fmt(batch.remaining)}
            </div>
            <div className="text-[8px] text-muted-foreground mt-1">{ar ? "متبقية" : "Kvar"}</div>
          </div>
        </div>

        {/* Row 3: Visual flow arrow */}
        {isCompleted && batch.totalHatched > 0 && (
          <div className="relative">
            <div className="h-3 rounded-full bg-muted/40 overflow-hidden flex">
              {batch.totalSold > 0 && (
                <div
                  className="h-full bg-blue-400"
                  style={{ width: `${(batch.totalSold / batch.totalHatched) * 100}%` }}
                  title={ar ? `${fmt(batch.totalSold)} مباعة` : `${fmt(batch.totalSold)} sålda`}
                />
              )}
              {batch.remaining > 0 && (
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${(batch.remaining / batch.totalHatched) * 100}%` }}
                  title={ar ? `${fmt(batch.remaining)} متبقية` : `${fmt(batch.remaining)} kvar`}
                />
              )}
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
              <span className="flex items-center gap-0.5">
                <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                {ar ? "مباع" : "Sålt"} {Math.round((batch.totalSold / batch.totalHatched) * 100)}%
              </span>
              {batch.remaining > 0 && (
                <span className="flex items-center gap-0.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                  {ar ? "موجود" : "Kvar"} {Math.round((batch.remaining / batch.totalHatched) * 100)}%
                </span>
              )}
            </div>
          </div>
        )}

        {/* Row 4: Info strip */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/30 pt-2">
          <div className="flex items-center gap-3">
            {hatchRate > 0 && (
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-amber-500" />
                {ar ? `نسبة فقس ${hatchRate}%` : `${hatchRate}% kläckgrad`}
              </span>
            )}
            {batch.ageDays > 0 && isCompleted && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {ageLabel(batch.ageDays, ar)}
              </span>
            )}
            {batch.salesRevenue > 0 && (
              <span className="flex items-center gap-1">
                <ShoppingCart className="w-3 h-3 text-emerald-500" />
                {fmt(batch.salesRevenue)} {ar ? "د.ع" : "IQD"}
              </span>
            )}
          </div>
          {batch.remaining > 0 && batch.flocks.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] gap-1 text-emerald-600"
              onClick={() => onViewFlocks(batch)}
            >
              {ar ? "عرض الدجاج" : "Visa"}
              <ChevronRight className="w-3 h-3" />
            </Button>
          )}
        </div>

        {/* Incubating progress */}
        {isIncubating && batch.cycle.startDate && (
          <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-2.5 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-blue-600 font-semibold flex items-center gap-1">
                <Egg className="w-3 h-3" />
                {ar ? "قيد التفقيس" : "Under inkubation"}
              </span>
              <span className="text-blue-600 font-bold">
                {ar ? `اليوم ${cycleDays(batch.cycle.startDate) + 1} من 21` : `Dag ${cycleDays(batch.cycle.startDate) + 1}/21`}
              </span>
            </div>
            <div className="h-2 rounded-full bg-blue-100 dark:bg-blue-900/50 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all"
                style={{ width: `${Math.min(100, (cycleDays(batch.cycle.startDate) / 21) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ══ FLOCK DETAIL MODAL (simplified) ═══════════════════════════════════════════

function FlockDetailModal({ flock, onClose, onRefresh, isAdmin }: {
  flock: Flock; onClose: () => void; onRefresh: () => void; isAdmin: boolean;
}) {
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const { toast } = useToast();
  const [prodLogs, setProdLogs] = useState<ProductionLog[]>([]);
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>([]);
  const [tab, setTab] = useState<"overview" | "production" | "health" | "intelligence">("overview");
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [addProdOpen, setAddProdOpen] = useState(false);
  const [addHealthOpen, setAddHealthOpen] = useState(false);
  const [savingProd, setSavingProd] = useState(false);
  const [savingHealth, setSavingHealth] = useState(false);

  const health = getHealth(flock.healthStatus);
  const purpose = getPurpose(flock.purpose);
  const age = calcAgeDays(flock.birthDate, flock.ageDays);

  useEffect(() => {
    async function loadLogs() {
      setLoadingLogs(true);
      try {
        const [prod, hlth] = await Promise.all([
          apiFetch<ProductionLog[]>(`flocks/${flock.id}/production-logs`),
          apiFetch<HealthLog[]>(`flocks/${flock.id}/health-logs`),
        ]);
        setProdLogs(prod.slice(0, 30));
        setHealthLogs(hlth.slice(0, 20));
      } catch { /* silent */ }
      setLoadingLogs(false);
    }
    loadLogs();
  }, [flock.id]);

  const handleAddProd = async (data: any) => {
    setSavingProd(true);
    try {
      await apiFetch(`flocks/${flock.id}/production-logs`, { method: "POST", body: JSON.stringify(data) });
      toast({ title: ar ? "تم تسجيل الإنتاج" : "Produktion registrerad" });
      setAddProdOpen(false);
      onRefresh();
      const logs = await apiFetch<ProductionLog[]>(`flocks/${flock.id}/production-logs`);
      setProdLogs(logs.slice(0, 30));
    } catch (err: any) {
      toast({ title: ar ? "خطأ" : "Fel", description: err.message, variant: "destructive" });
    }
    setSavingProd(false);
  };

  const handleAddHealth = async (data: any) => {
    setSavingHealth(true);
    try {
      await apiFetch(`flocks/${flock.id}/health-logs`, { method: "POST", body: JSON.stringify(data) });
      toast({ title: ar ? "تم تسجيل الحالة" : "Hälsostatus uppdaterad" });
      setAddHealthOpen(false);
      onRefresh();
      const logs = await apiFetch<HealthLog[]>(`flocks/${flock.id}/health-logs`);
      setHealthLogs(logs.slice(0, 20));
    } catch (err: any) {
      toast({ title: ar ? "خطأ" : "Fel", description: err.message, variant: "destructive" });
    }
    setSavingHealth(false);
  };

  const chartData = useMemo(() => {
    const sorted = [...prodLogs].sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
    return sorted.map(l => ({
      date: new Date(l.date).toLocaleDateString(ar ? "ar-IQ" : "sv-SE", { month: "short", day: "numeric" }),
      eggs: l.eggCount,
    }));
  }, [prodLogs, ar]);

  return (
    <>
      <Dialog open onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle className="text-xl">{flock.name}</DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">{flock.breed} · {ageLabel(age, ar)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs px-2 py-1 rounded-full border font-medium ${purpose.color}`}>
                  {purpose.emoji} {ar ? purpose.labelAr : purpose.labelSv}
                </span>
                <span className="text-xs px-2 py-1 rounded-full border font-medium"
                  style={{ background: health.color + "18", color: health.color, borderColor: health.color + "44" }}>
                  {ar ? health.labelAr : health.labelSv}
                </span>
              </div>
            </div>
          </DialogHeader>

          <div className="flex gap-1 p-1 bg-muted rounded-lg">
            {[
              { key: "overview", labelAr: "عامة", labelSv: "Översikt" },
              { key: "production", labelAr: "الإنتاج", labelSv: "Produktion" },
              { key: "health", labelAr: "الصحة", labelSv: "Hälsa" },
              { key: "intelligence", labelAr: "🧠 ذكاء", labelSv: "🧠 AI" },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key as any)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${tab === t.key ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {ar ? t.labelAr : t.labelSv}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { icon: Bird, value: flock.count, labelAr: "طير", labelSv: "fåglar" },
                  { icon: Calendar, value: ageLabel(age, ar), labelAr: "العمر", labelSv: "Ålder" },
                  { icon: Egg, value: flock.avgDaily7d || "—", labelAr: "بيض/يوم", labelSv: "ägg/dag" },
                  { icon: Wheat, value: flock.feedConsumptionKg != null ? `${flock.feedConsumptionKg} كجم` : "—", labelAr: "علف/يوم", labelSv: "foder/dag" },
                ].map((s, i) => (
                  <div key={i} className="bg-muted/50 rounded-xl p-3 text-center">
                    <s.icon className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                    <div className="font-bold text-lg text-foreground">{s.value}</div>
                    <div className="text-[10px] text-muted-foreground">{ar ? s.labelAr : s.labelSv}</div>
                  </div>
                ))}
              </div>
              {flock.notes && (
                <div className="bg-muted/50 rounded-xl p-3 text-sm text-muted-foreground leading-relaxed">{flock.notes}</div>
              )}
            </div>
          )}

          {tab === "production" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{ar ? "سجل الإنتاج" : "Produktionshistorik"}</p>
                {isAdmin && (
                  <Button size="sm" className="gap-1.5" onClick={() => setAddProdOpen(true)}>
                    <Plus className="w-3.5 h-3.5" />
                    {ar ? "تسجيل يوم" : "Lägg till"}
                  </Button>
                )}
              </div>
              {loadingLogs ? <Skeleton className="h-40 w-full" /> : chartData.length > 0 ? (
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => [v, ar ? "بيضة" : "ägg"]}
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="eggs" radius={[4, 4, 0, 0]}>
                        {chartData.map((_, i) => <Cell key={i} fill="#f59e0b" />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Egg className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  {ar ? "لا يوجد سجل إنتاج بعد" : "Ingen produktionshistorik ännu"}
                </div>
              )}
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {prodLogs.map(l => (
                  <div key={l.id} className="flex items-center justify-between text-sm py-2 border-b border-border/40 last:border-0">
                    <span className="font-medium">{new Date(l.date).toLocaleDateString(ar ? "ar-IQ" : "sv-SE", { weekday: "short", month: "short", day: "numeric" })}</span>
                    <span className="font-bold text-amber-600">{l.eggCount} 🥚</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "health" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{ar ? "السجل الصحي" : "Hälsohistorik"}</p>
                {isAdmin && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAddHealthOpen(true)}>
                    <Stethoscope className="w-3.5 h-3.5" />
                    {ar ? "إضافة" : "Lägg till"}
                  </Button>
                )}
              </div>
              {loadingLogs ? <Skeleton className="h-40 w-full" /> : healthLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Heart className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  {ar ? "لا يوجد سجل صحي بعد" : "Ingen hälsohistorik ännu"}
                </div>
              ) : (
                <div className="space-y-3">
                  {healthLogs.map(l => {
                    const h = getHealth(l.status);
                    const HIcon = h.icon;
                    return (
                      <div key={l.id} className={`rounded-xl p-3 border ${h.border} ${h.bg}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <HIcon className="w-3.5 h-3.5" style={{ color: h.color }} />
                            <span className="font-semibold text-sm" style={{ color: h.color }}>{ar ? h.labelAr : h.labelSv}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(l.date).toLocaleDateString(ar ? "ar-IQ" : "sv-SE", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        </div>
                        {l.symptoms && <p className="text-xs text-muted-foreground"><strong>{ar ? "الأعراض:" : "Symptom:"}</strong> {l.symptoms}</p>}
                        {l.treatment && <p className="text-xs text-muted-foreground"><strong>{ar ? "العلاج:" : "Behandling:"}</strong> {l.treatment}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === "intelligence" && (
            <FlockIntelligencePanel flockId={flock.id} flockName={flock.name} ar={ar} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={addProdOpen} onOpenChange={setAddProdOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{ar ? "تسجيل إنتاج البيض" : "Registrera äggproduktion"}</DialogTitle></DialogHeader>
          <ProductionLogForm flockName={flock.name} onSubmit={handleAddProd} onClose={() => setAddProdOpen(false)} loading={savingProd} />
        </DialogContent>
      </Dialog>

      <Dialog open={addHealthOpen} onOpenChange={setAddHealthOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{ar ? "تسجيل حدث صحي" : "Registrera hälsohändelse"}</DialogTitle></DialogHeader>
          <HealthLogForm flockName={flock.name} onSubmit={handleAddHealth} onClose={() => setAddHealthOpen(false)} loading={savingHealth} />
        </DialogContent>
      </Dialog>
    </>
  );
}

// ══ FORMS ════════════════════════════════════════════════════════════════════

function FlockForm({ initial, onSubmit, onClose, loading, isEdit }: {
  initial?: Flock; onSubmit: (d: any) => void; onClose: () => void; loading?: boolean; isEdit?: boolean;
}) {
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const [form, setForm] = useState({
    name: initial?.name ?? "", breed: initial?.breed ?? "", count: initial?.count ?? 1,
    ageDays: initial ? calcAgeDays(initial.birthDate, initial.ageDays) : 0,
    birthDate: initial?.birthDate ?? "", purpose: initial?.purpose ?? "eggs",
    healthStatus: initial?.healthStatus ?? "healthy",
    feedConsumptionKg: initial?.feedConsumptionKg ?? "", dailyEggTarget: initial?.dailyEggTarget ?? "",
    notes: initial?.notes ?? "",
  });
  const set = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e?.target?.value ?? e }));

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit({
      ...form, count: Number(form.count), ageDays: Number(form.ageDays),
      feedConsumptionKg: form.feedConsumptionKg !== "" ? Number(form.feedConsumptionKg) : null,
      dailyEggTarget: form.dailyEggTarget !== "" ? Number(form.dailyEggTarget) : null,
      birthDate: form.birthDate || null,
    }); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label>{ar ? "اسم المجموعة" : "Flocksnamn"} *</Label>
          <Input value={form.name} onChange={set("name")} required autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label>{ar ? "السلالة" : "Ras"} *</Label>
          <Input value={form.breed} onChange={set("breed")} required />
        </div>
        <div className="space-y-1.5">
          <Label>{ar ? "عدد الطيور" : "Antal"} *</Label>
          <Input type="number" min={1} value={form.count} onChange={set("count")} required />
        </div>
        <div className="space-y-1.5">
          <Label>{ar ? "تاريخ الميلاد" : "Födelsedag"}</Label>
          <Input type="date" value={form.birthDate} onChange={e => {
            const val = e.target.value;
            setForm(f => ({ ...f, birthDate: val, ageDays: val ? calcAgeDays(val, 0) : f.ageDays }));
          }} />
        </div>
        <div className="space-y-1.5">
          <Label>{ar ? "الغرض" : "Syfte"}</Label>
          <Select value={form.purpose} onValueChange={v => setForm(f => ({ ...f, purpose: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(PURPOSE_META).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.emoji} {ar ? v.labelAr : v.labelSv}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{ar ? "الحالة الصحية" : "Hälsostatus"}</Label>
          <Select value={form.healthStatus} onValueChange={v => setForm(f => ({ ...f, healthStatus: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(HEALTH_META).map(([k, v]) => (
                <SelectItem key={k} value={k}>{ar ? v.labelAr : v.labelSv}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>{ar ? "ملاحظات" : "Anteckningar"}</Label>
          <Textarea value={form.notes} onChange={set("notes")} rows={2} />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onClose}>{ar ? "إلغاء" : "Avbryt"}</Button>
        <Button type="submit" disabled={loading}>{isEdit ? (ar ? "تحديث" : "Uppdatera") : (ar ? "إضافة" : "Lägg till")}</Button>
      </div>
    </form>
  );
}

function ProductionLogForm({ flockName, onSubmit, onClose, loading }: {
  flockName: string; onSubmit: (d: any) => void; onClose: () => void; loading?: boolean;
}) {
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({ date: today, eggCount: "", notes: "" });
  const set = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e?.target?.value ?? e }));
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit({ date: form.date, eggCount: Number(form.eggCount), notes: form.notes || null }); }} className="space-y-4">
      <p className="text-sm text-muted-foreground">{flockName}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{ar ? "التاريخ" : "Datum"}</Label>
          <Input type="date" value={form.date} onChange={set("date")} required />
        </div>
        <div className="space-y-1.5">
          <Label>{ar ? "عدد البيض" : "Antal ägg"}</Label>
          <Input type="number" min={0} value={form.eggCount} onChange={set("eggCount")} required />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onClose}>{ar ? "إلغاء" : "Avbryt"}</Button>
        <Button type="submit" disabled={loading}>{ar ? "تسجيل" : "Spara"}</Button>
      </div>
    </form>
  );
}

function HealthLogForm({ flockName, onSubmit, onClose, loading }: {
  flockName: string; onSubmit: (d: any) => void; onClose: () => void; loading?: boolean;
}) {
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({ date: today, status: "healthy", symptoms: "", treatment: "", notes: "" });
  const set = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e?.target?.value ?? e }));
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit({ date: form.date, status: form.status, symptoms: form.symptoms || null, treatment: form.treatment || null, notes: form.notes || null }); }} className="space-y-4">
      <p className="text-sm text-muted-foreground">{flockName}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{ar ? "التاريخ" : "Datum"}</Label>
          <Input type="date" value={form.date} onChange={set("date")} required />
        </div>
        <div className="space-y-1.5">
          <Label>{ar ? "الحالة" : "Status"}</Label>
          <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(HEALTH_META).map(([k, v]) => (
                <SelectItem key={k} value={k}>{ar ? v.labelAr : v.labelSv}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>{ar ? "الأعراض" : "Symptom"}</Label>
          <Input value={form.symptoms} onChange={set("symptoms")} />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>{ar ? "العلاج" : "Behandling"}</Label>
          <Input value={form.treatment} onChange={set("treatment")} />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onClose}>{ar ? "إلغاء" : "Avbryt"}</Button>
        <Button type="submit" disabled={loading}>{ar ? "تسجيل" : "Spara"}</Button>
      </div>
    </form>
  );
}

// ══ MAIN PAGE ═════════════════════════════════════════════════════════════════

export default function Flocks() {
  const { isAdmin } = useAuth();
  const { lang } = useLanguage();
  const { toast } = useToast();
  const ar = lang === "ar";

  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [cycles, setCycles] = useState<HatchingCycle[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [incubators, setIncubators] = useState<Incubator[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [editFlock, setEditFlock] = useState<Flock | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [detailFlock, setDetailFlock] = useState<Flock | null>(null);
  const [viewBatchFlocks, setViewBatchFlocks] = useState<BatchChickenInfo | null>(null);
  const [filterView, setFilterView] = useState<"all" | "alive" | "incubating">("all");

  const load = useCallback(async () => {
    try {
      const [f, c, s, inc] = await Promise.all([
        apiFetch<Flock[]>("flocks"),
        apiFetch<HatchingCycle[]>("hatching-cycles"),
        apiFetch<Sale[]>("sales").catch(() => [] as Sale[]),
        apiFetch<Incubator[]>("incubators").catch(() => [] as Incubator[]),
      ]);
      setFlocks(f);
      setCycles(c);
      setSales(s);
      setIncubators(inc);
    } catch (err: any) {
      toast({ title: ar ? "خطأ في التحميل" : "Laddningsfel", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  }, [ar, toast]);

  useEffect(() => { load(); }, [load]);

  const incubatorMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const inc of incubators) m.set(inc.id, inc.name);
    return m;
  }, [incubators]);

  const batches = useMemo<BatchChickenInfo[]>(() => {
    return cycles
      .sort((a, b) => a.id - b.id)
      .map(cycle => {
        const cycleSales = sales.filter(s => s.hatchingCycleId === cycle.id);
        const totalSold = cycleSales.reduce((sum, s) => sum + s.quantity, 0);
        const salesRevenue = cycleSales.reduce((sum, s) => sum + Number(s.totalPrice), 0);
        const totalHatched = cycle.eggsHatched ?? 0;
        const remaining = Math.max(0, totalHatched - totalSold);
        const machineName = cycle.incubatorId ? (incubatorMap.get(cycle.incubatorId) ?? "—") : "—";
        const ageDays = cycle.startDate ? cycleDays(cycle.startDate) : 0;
        const isActive = cycle.status === "incubating" || cycle.status === "hatching";
        const batchFlocks = flocks.filter(f => f.notes?.includes(`batch:${cycle.id}`) || f.notes?.includes(`فقسة:${cycle.id}`));

        return { cycle, machineName, totalHatched, totalSold, remaining, salesRevenue, ageDays, isActive, flocks: batchFlocks };
      });
  }, [cycles, sales, incubatorMap, flocks]);

  const filteredBatches = useMemo(() => {
    if (filterView === "alive") return batches.filter(b => b.remaining > 0);
    if (filterView === "incubating") return batches.filter(b => b.isActive);
    return batches;
  }, [batches, filterView]);

  const totalAliveChickens = useMemo(() => batches.reduce((s, b) => s + b.remaining, 0), [batches]);
  const totalSold = useMemo(() => batches.reduce((s, b) => s + b.totalSold, 0), [batches]);
  const totalHatched = useMemo(() => batches.reduce((s, b) => s + b.totalHatched, 0), [batches]);
  const totalRevenue = useMemo(() => batches.reduce((s, b) => s + b.salesRevenue, 0), [batches]);
  const activeBatches = useMemo(() => batches.filter(b => b.isActive).length, [batches]);
  const batchesWithChickens = useMemo(() => batches.filter(b => b.remaining > 0).length, [batches]);

  // CRUD
  const handleCreate = async (data: any) => {
    setSaving(true);
    try {
      await apiFetch("flocks", { method: "POST", body: JSON.stringify(data) });
      toast({ title: ar ? "تمت إضافة المجموعة" : "Flock tillagd" });
      setAddOpen(false);
      await load();
    } catch (err: any) {
      toast({ title: ar ? "خطأ" : "Fel", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleUpdate = async (data: any) => {
    if (!editFlock) return;
    setSaving(true);
    try {
      await apiFetch(`flocks/${editFlock.id}`, { method: "PUT", body: JSON.stringify(data) });
      toast({ title: ar ? "تم التحديث" : "Uppdaterad" });
      setEditFlock(null);
      await load();
    } catch (err: any) {
      toast({ title: ar ? "خطأ" : "Fel", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (deleteId == null) return;
    try {
      await apiFetch(`flocks/${deleteId}`, { method: "DELETE" });
      toast({ title: ar ? "تم الحذف" : "Borttagen" });
      setDeleteId(null);
      await load();
    } catch (err: any) {
      toast({ title: ar ? "خطأ" : "Fel", description: err.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Card key={i}><CardContent className="pt-5"><Skeleton className="h-20 w-full" /></CardContent></Card>)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <Card key={i}><CardContent className="p-4"><Skeleton className="h-48 w-full" /></CardContent></Card>)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bird className="w-6 h-6 text-primary" />
            {ar ? "دجاجات المزرعة" : "Gårdens Kycklingar"}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {ar
              ? `${cycles.length} فقسة · ${fmt(totalAliveChickens)} دجاجة حية · ${fmt(totalSold)} مباعة`
              : `${cycles.length} satser · ${fmt(totalAliveChickens)} levande · ${fmt(totalSold)} sålda`}
          </p>
        </div>
        {isAdmin && (
          <Button className="gap-2" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4" />
            {ar ? "إضافة مجموعة" : "Lägg till flock"}
          </Button>
        )}
      </div>

      {/* ── Hero Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
          <CardContent className="pt-3 pb-3 text-center">
            <Bird className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
            <div className="text-2xl font-black text-emerald-600">{fmt(totalAliveChickens)}</div>
            <div className="text-[10px] text-muted-foreground">{ar ? "دجاجة حية" : "Levande"}</div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-3 pb-3 text-center">
            <Egg className="w-5 h-5 text-amber-500 mx-auto mb-1" />
            <div className="text-2xl font-black text-foreground">{fmt(totalHatched)}</div>
            <div className="text-[10px] text-muted-foreground">{ar ? "فقست بالمجموع" : "Totalt kläckta"}</div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-3 pb-3 text-center">
            <ShoppingCart className="w-5 h-5 text-blue-500 mx-auto mb-1" />
            <div className="text-2xl font-black text-blue-600">{fmt(totalSold)}</div>
            <div className="text-[10px] text-muted-foreground">{ar ? "صوص مباع" : "Sålda"}</div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-3 pb-3 text-center">
            <TrendingUp className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
            <div className="text-2xl font-black text-emerald-600">{fmt(totalRevenue)}</div>
            <div className="text-[10px] text-muted-foreground">{ar ? "إيراد المبيعات" : "Intäkter"}</div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-3 pb-3 text-center">
            <Package className="w-5 h-5 text-violet-500 mx-auto mb-1" />
            <div className="text-2xl font-black text-foreground">{batchesWithChickens}</div>
            <div className="text-[10px] text-muted-foreground">{ar ? "فقسة فيها دجاج" : "Med kycklingar"}</div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-3 pb-3 text-center">
            <Egg className="w-5 h-5 text-blue-500 mx-auto mb-1" />
            <div className="text-2xl font-black text-blue-600">{activeBatches}</div>
            <div className="text-[10px] text-muted-foreground">{ar ? "فقسة نشطة" : "Aktiva satser"}</div>
          </CardContent>
        </Card>
      </div>

      {/* ── Filter Tabs ── */}
      <div className="flex gap-2">
        {[
          { key: "all" as const, label: ar ? `كل الفقسات (${cycles.length})` : `Alla satser (${cycles.length})` },
          { key: "alive" as const, label: ar ? `فيها دجاج (${batchesWithChickens})` : `Med kycklingar (${batchesWithChickens})` },
          { key: "incubating" as const, label: ar ? `قيد التفقيس (${activeBatches})` : `Inkuberar (${activeBatches})` },
        ].map(f => (
          <Button
            key={f.key}
            size="sm"
            variant={filterView === f.key ? "default" : "outline"}
            className="text-xs h-8"
            onClick={() => setFilterView(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* ── Batch Cards Grid ── */}
      {filteredBatches.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Bird className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h3 className="font-bold text-lg mb-1">{ar ? "لا توجد فقسات مطابقة" : "Inga matchande satser"}</h3>
            <p className="text-muted-foreground text-sm">{ar ? "جرب تغيير الفلتر" : "Ändra filter"}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBatches.map(batch => (
            <BatchCard
              key={batch.cycle.id}
              batch={batch}
              ar={ar}
              onViewFlocks={setViewBatchFlocks}
            />
          ))}
        </div>
      )}

      {/* ── Existing Flocks Section ── */}
      {flocks.length > 0 && (
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2 mb-3">
            <Users className="w-5 h-5 text-primary" />
            {ar ? "مجموعات الدجاج المسجلة" : "Registrerade flockar"}
            <Badge variant="secondary" className="text-xs">{flocks.length}</Badge>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {flocks.map(flock => {
              const health = getHealth(flock.healthStatus);
              const purpose = getPurpose(flock.purpose);
              const age = calcAgeDays(flock.birthDate, flock.ageDays);
              const HealthIcon = health.icon;
              return (
                <Card key={flock.id} className={`cursor-pointer transition-all hover:shadow-md ${health.border} ${health.bg}`}
                  onClick={() => setDetailFlock(flock)}>
                  <div className="h-1" style={{ background: health.color }} />
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm truncate">{flock.name}</h3>
                        <p className="text-[11px] text-muted-foreground">{flock.breed}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${purpose.color}`}>
                          {purpose.emoji}
                        </span>
                        <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                          style={{ background: health.color + "18", color: health.color }}>
                          <HealthIcon className="w-2.5 h-2.5" />
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-center">
                      <div className="bg-background/60 rounded py-1">
                        <div className="font-black text-sm">{flock.count}</div>
                        <div className="text-[8px] text-muted-foreground">{ar ? "طير" : "fåglar"}</div>
                      </div>
                      <div className="bg-background/60 rounded py-1">
                        <div className="font-black text-sm">{ageLabel(age, ar)}</div>
                        <div className="text-[8px] text-muted-foreground">{ar ? "العمر" : "Ålder"}</div>
                      </div>
                      <div className="bg-background/60 rounded py-1">
                        <div className="font-black text-sm text-amber-600">{flock.avgDaily7d || "—"}</div>
                        <div className="text-[8px] text-muted-foreground">{ar ? "بيض/يوم" : "ägg/dag"}</div>
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1 pt-1" onClick={e => e.stopPropagation()}>
                        <Button size="sm" variant="ghost" className="h-6 flex-1 text-[9px]" onClick={() => setDetailFlock(flock)}>
                          <ChevronRight className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => setEditFlock(flock)}>
                          <Pencil className="w-3 h-3 text-muted-foreground" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => setDeleteId(flock.id)}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Dialogs ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{ar ? "إضافة مجموعة جديدة" : "Lägg till ny flock"}</DialogTitle></DialogHeader>
          <FlockForm onSubmit={handleCreate} onClose={() => setAddOpen(false)} loading={saving} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editFlock} onOpenChange={v => !v && setEditFlock(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{ar ? "تعديل المجموعة" : "Redigera flock"}</DialogTitle></DialogHeader>
          {editFlock && <FlockForm initial={editFlock} onSubmit={handleUpdate} onClose={() => setEditFlock(null)} loading={saving} isEdit />}
        </DialogContent>
      </Dialog>

      {detailFlock && (
        <FlockDetailModal flock={detailFlock} onClose={() => setDetailFlock(null)} onRefresh={load} isAdmin={isAdmin} />
      )}

      <AlertDialog open={deleteId != null} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ar ? "تأكيد الحذف" : "Bekräfta borttagning"}</AlertDialogTitle>
            <AlertDialogDescription>
              {ar ? "سيتم حذف المجموعة وجميع سجلاتها بشكل نهائي." : "Flocken och all dess historik raderas permanent."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{ar ? "إلغاء" : "Avbryt"}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              {ar ? "نعم، احذف" : "Ja, radera"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
