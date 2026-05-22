import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiPath } from "@/lib/api";
import {
  Thermometer, Droplets, Egg, Timer, Plus, Settings2,
  AlertTriangle, CheckCircle2, Clock, TrendingUp, DollarSign,
  Gauge, ChevronRight, Zap, ShieldCheck, Box, BarChart3,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  CartesianGrid,
} from "recharts";

interface Incubator {
  id: number;
  name: string;
  model: string | null;
  capacity: number;
  status: string;
  location: string | null;
  purchaseDate: string | null;
  purchaseCost: number | null;
  notes: string | null;
  createdAt: string;
  activeCycle?: HatchCycle | null;
  latestReading?: { temperature: number; humidity: number; recordedAt: string } | null;
}

interface HatchCycle {
  id: number;
  batchName: string;
  eggsSet: number;
  eggsHatched: number | null;
  startDate: string;
  setTime: string | null;
  expectedHatchDate: string;
  status: string;
  temperature: number | null;
  humidity: number | null;
  incubatorId: number | null;
}

interface Reading {
  id: number;
  temperature: number;
  humidity: number;
  recordedAt: string;
}

interface Alert {
  id: number;
  type: string;
  message: string;
  severity: string;
  acknowledged: boolean;
  createdAt: string;
}

async function fetchJson(path: string) {
  const res = await fetch(apiPath(path), { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function postJson(path: string, body: any) {
  const res = await fetch(apiPath(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function putJson(path: string, body: any) {
  const res = await fetch(apiPath(path), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function calcDaysRunning(startDate: string): number {
  const start = new Date(startDate);
  const now = new Date();
  return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function calcHoursRunning(startDate: string, setTime?: string | null): string {
  const start = new Date(startDate);
  if (setTime) {
    const [h, m] = setTime.split(":").map(Number);
    start.setHours(h || 0, m || 0);
  }
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  return `${days} يوم ${hours} ساعة`;
}

function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  const colors: Record<string, string> = {
    active: "bg-green-500/15 text-green-400 border-green-500/30",
    idle: "bg-gray-500/15 text-gray-400 border-gray-500/30",
    maintenance: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  };
  return (
    <Badge className={`${colors[status] || colors.idle} border text-xs`}>
      {t(`incubators.status.${status}`)}
    </Badge>
  );
}

export default function IncubatorsPage() {
  const { t, lang, dir } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const ar = lang === "ar";

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", model: "", capacity: "", location: "", purchaseCost: "", purchaseDate: "", notes: "" });

  const { data: incubators = [], isLoading } = useQuery<Incubator[]>({
    queryKey: ["incubators"],
    queryFn: () => fetchJson("/incubators"),
  });

  const selected = useMemo(() => incubators.find(i => i.id === selectedId), [incubators, selectedId]);

  const { data: readings = [] } = useQuery<Reading[]>({
    queryKey: ["incubator-readings", selectedId],
    queryFn: () => fetchJson(`/incubators/${selectedId}/readings`),
    enabled: !!selectedId,
  });

  const { data: alerts = [] } = useQuery<Alert[]>({
    queryKey: ["incubator-alerts", selectedId],
    queryFn: () => fetchJson(`/incubators/${selectedId}/alerts`),
    enabled: !!selectedId,
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => postJson("/incubators", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incubators"] });
      toast({ title: t("incubators.created") });
      setShowAdd(false);
      setForm({ name: "", model: "", capacity: "", location: "", purchaseCost: "", purchaseDate: "", notes: "" });
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (alertId: number) => putJson(`/incubator-alerts/${alertId}/acknowledge`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incubator-alerts", selectedId] }),
  });

  const handleCreate = () => {
    if (!form.name || !form.capacity) return;
    createMutation.mutate({
      name: form.name,
      model: form.model || null,
      capacity: Number(form.capacity),
      location: form.location || null,
      purchaseCost: form.purchaseCost ? Number(form.purchaseCost) : null,
      purchaseDate: form.purchaseDate || null,
      notes: form.notes || null,
    });
  };

  const unacknowledgedAlerts = alerts.filter(a => !a.acknowledged);

  // Chart data from readings
  const chartData = useMemo(() => {
    return readings.slice(0, 50).reverse().map(r => ({
      time: new Date(r.recordedAt).toLocaleTimeString(ar ? "ar" : "sv-SE", { hour: "2-digit", minute: "2-digit" }),
      temperature: r.temperature,
      humidity: r.humidity,
    }));
  }, [readings, ar]);

  if (isLoading) {
    return (
      <div className="space-y-4" dir={dir}>
        <Skeleton className="h-10 w-60" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map(i => <Skeleton key={i} className="h-64" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir={dir}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Box className="w-7 h-7 text-primary" />
            {t("incubators.title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{t("incubators.subtitle")}</p>
        </div>
        <Button onClick={() => setShowAdd(!showAdd)} size="sm" className="gap-1">
          <Plus className="w-4 h-4" />
          {t("incubators.add")}
        </Button>
      </div>

      {/* Add Form */}
      {showAdd && (
        <Card className="border-primary/30">
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Input placeholder={t("incubators.name")} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <Input placeholder={t("incubators.model")} value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
              <Input type="number" placeholder={t("incubators.capacity")} value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} />
              <Input placeholder={t("incubators.location")} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
              <Input type="number" placeholder={t("incubators.purchaseCost")} value={form.purchaseCost} onChange={e => setForm(f => ({ ...f, purchaseCost: e.target.value }))} />
              <Input type="date" placeholder={t("incubators.purchaseDate")} value={form.purchaseDate} onChange={e => setForm(f => ({ ...f, purchaseDate: e.target.value }))} />
            </div>
            <Input placeholder={t("common.notes")} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={createMutation.isPending} size="sm">{t("common.save")}</Button>
              <Button variant="outline" onClick={() => setShowAdd(false)} size="sm">{t("common.cancel")}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Incubator Cards */}
      {incubators.length === 0 ? (
        <Card className="py-16 text-center text-muted-foreground">
          <Box className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{t("incubators.empty")}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {incubators.map(inc => {
            const isSelected = selectedId === inc.id;
            const cycle = inc.activeCycle;
            const occupancy = cycle ? Math.round((cycle.eggsSet / inc.capacity) * 100) : 0;
            const daysRunning = cycle ? calcDaysRunning(cycle.startDate) : 0;
            const expectedChicks = cycle ? Math.round(cycle.eggsSet * 0.7) : 0;
            const costPerEgg = 500;
            const totalCost = cycle ? cycle.eggsSet * costPerEgg : 0;
            const expectedRevenue = expectedChicks * 1500;

            return (
              <Card
                key={inc.id}
                className={`cursor-pointer transition-all duration-200 hover:shadow-lg ${
                  isSelected ? "ring-2 ring-primary border-primary/50" : "hover:border-primary/30"
                }`}
                onClick={() => setSelectedId(isSelected ? null : inc.id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        inc.status === "active" ? "bg-green-500/15" : "bg-gray-500/15"
                      }`}>
                        <Box className={`w-6 h-6 ${inc.status === "active" ? "text-green-400" : "text-gray-400"}`} />
                      </div>
                      <div>
                        <CardTitle className="text-base">{inc.name}</CardTitle>
                        {inc.model && <p className="text-xs text-muted-foreground">{inc.model}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={inc.status} t={t} />
                      <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isSelected ? "rotate-90" : ""}`} />
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Capacity & Occupancy */}
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{t("incubators.occupancy")}</span>
                        <span className="font-medium">{occupancy}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            occupancy > 80 ? "bg-green-500" : occupancy > 40 ? "bg-yellow-500" : "bg-gray-400"
                          }`}
                          style={{ width: `${occupancy}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                        <span>{cycle?.eggsSet || 0} / {inc.capacity} {t("incubators.eggs")}</span>
                      </div>
                    </div>
                  </div>

                  {/* Live readings */}
                  {inc.latestReading && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10">
                        <Thermometer className="w-4 h-4 text-red-400" />
                        <div>
                          <p className="text-xs text-muted-foreground">{t("incubators.temperature")}</p>
                          <p className="text-sm font-bold text-red-400">{inc.latestReading.temperature}°C</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10">
                        <Droplets className="w-4 h-4 text-blue-400" />
                        <div>
                          <p className="text-xs text-muted-foreground">{t("incubators.humidity")}</p>
                          <p className="text-sm font-bold text-blue-400">{inc.latestReading.humidity}%</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Active cycle info */}
                  {cycle ? (
                    <div className="space-y-2 p-3 rounded-xl bg-muted/50 border">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium flex items-center gap-1.5">
                          <Egg className="w-4 h-4 text-primary" />
                          {cycle.batchName}
                        </span>
                        <Badge variant="outline" className="text-xs">{cycle.status}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                        <div className="flex items-center gap-1.5">
                          <Timer className="w-3 h-3 text-muted-foreground" />
                          <span className="text-muted-foreground">{t("incubators.daysRunning")}:</span>
                          <span className="font-medium">{daysRunning}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          <span className="text-muted-foreground">{t("incubators.expectedHatch")}:</span>
                          <span className="font-medium">{cycle.expectedHatchDate}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <TrendingUp className="w-3 h-3 text-green-400" />
                          <span className="text-muted-foreground">{t("incubators.expectedChicks")}:</span>
                          <span className="font-medium text-green-400">~{expectedChicks}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <DollarSign className="w-3 h-3 text-amber-400" />
                          <span className="text-muted-foreground">{t("incubators.expectedProfit")}:</span>
                          <span className="font-medium text-amber-400">{(expectedRevenue - totalCost).toLocaleString()}</span>
                        </div>
                      </div>
                      {cycle.setTime && (
                        <p className="text-[10px] text-muted-foreground">
                          {t("incubators.ageHours")}: {calcHoursRunning(cycle.startDate, cycle.setTime)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-3 text-sm text-muted-foreground bg-muted/30 rounded-xl">
                      {t("incubators.noCycle")}
                    </div>
                  )}
                </CardContent>

                {/* Expanded detail */}
                {isSelected && (
                  <CardContent className="pt-0 space-y-4 border-t">
                    {/* Alerts */}
                    {unacknowledgedAlerts.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-yellow-400" />
                          {t("incubators.alerts")} ({unacknowledgedAlerts.length})
                        </h4>
                        {unacknowledgedAlerts.map(alert => (
                          <div key={alert.id} className={`flex items-start justify-between p-2.5 rounded-lg text-xs ${
                            alert.severity === "critical" ? "bg-red-500/10 border border-red-500/30" : "bg-yellow-500/10 border border-yellow-500/30"
                          }`}>
                            <div className="flex-1">
                              <p className="font-medium">{alert.message}</p>
                              <p className="text-muted-foreground mt-0.5">
                                {new Date(alert.createdAt).toLocaleString(ar ? "ar" : "sv-SE")}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs h-7"
                              onClick={(e) => { e.stopPropagation(); acknowledgeMutation.mutate(alert.id); }}
                            >
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              {t("incubators.acknowledge")}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Sensor Chart */}
                    {chartData.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium flex items-center gap-1.5">
                          <BarChart3 className="w-4 h-4 text-primary" />
                          {t("incubators.readings")}
                        </h4>
                        <div className="h-48 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                              <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                              <YAxis tick={{ fontSize: 10 }} />
                              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                              <Area type="monotone" dataKey="temperature" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} name={t("incubators.temperature")} />
                              <Area type="monotone" dataKey="humidity" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} name={t("incubators.humidity")} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {/* Purchase info */}
                    {inc.purchaseCost && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <DollarSign className="w-3 h-3" />
                        {t("incubators.purchaseCost")}: {Number(inc.purchaseCost).toLocaleString()} {t("sales.dinar")}
                        {inc.purchaseDate && ` - ${inc.purchaseDate}`}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
