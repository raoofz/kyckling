import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiPath } from "@/lib/api";
import {
  TrendingUp, TrendingDown, DollarSign, Egg, Bird, Box, Leaf,
  BarChart3, Target, ShoppingCart, Gauge, Activity, Zap,
  ArrowUp, ArrowDown, Minus, ShieldCheck,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";

interface Analytics {
  hatching: { totalCycles: number; completedCycles: number; avgHatchRate: number; activeCycles: number };
  financial: { totalIncome: number; totalExpenses: number; netProfit: number };
  sales: { totalChicksSold: number; totalRevenue: number; totalSales: number };
  incubators: { total: number; active: number };
  azolla: { totalKg: number; totalSavings: number; records: number };
  flocks: { totalFlocks: number };
}

const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

async function fetchJson(path: string) {
  const res = await fetch(apiPath(path), { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function KPICard({ icon: Icon, label, value, sub, color, trend }: {
  icon: any; label: string; value: string | number; sub?: string;
  color: string; trend?: "up" | "down" | "stable";
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-bold mt-0.5">{typeof value === "number" ? value.toLocaleString() : value}</p>
              {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
            </div>
          </div>
          {trend && (
            <div className={`flex items-center gap-0.5 text-xs font-medium ${
              trend === "up" ? "text-green-400" : trend === "down" ? "text-red-400" : "text-gray-400"
            }`}>
              {trend === "up" ? <ArrowUp className="w-3 h-3" /> : trend === "down" ? <ArrowDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function FarmAnalyticsPage() {
  const { t, lang, dir } = useLanguage();
  const ar = lang === "ar";

  const { data, isLoading } = useQuery<Analytics>({
    queryKey: ["farm-analytics"],
    queryFn: () => fetchJson("/farm-analytics/overview"),
  });

  const profitData = useMemo(() => {
    if (!data) return [];
    return [
      { name: ar ? "الإيرادات" : "Intäkter", value: data.financial.totalIncome },
      { name: ar ? "التكاليف" : "Kostnader", value: data.financial.totalExpenses },
    ];
  }, [data, ar]);

  const performanceData = useMemo(() => {
    if (!data) return [];
    return [
      { name: ar ? "معدل الفقس" : "Kläckgrad", value: Math.round(data.hatching.avgHatchRate) },
      { name: ar ? "ماكينات نشطة" : "Aktiva", value: data.incubators.active },
      { name: ar ? "فقسات مكتملة" : "Slutförda", value: data.hatching.completedCycles },
      { name: ar ? "صيصان مباعة" : "Sålda", value: data.sales.totalChicksSold },
    ];
  }, [data, ar]);

  if (isLoading || !data) {
    return (
      <div className="space-y-4" dir={dir}>
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  const profitMargin = data.financial.totalIncome > 0
    ? Math.round((data.financial.netProfit / data.financial.totalIncome) * 100) : 0;

  return (
    <div className="space-y-6" dir={dir}>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="w-7 h-7 text-primary" />
          {t("farmAnalytics.title")}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">{t("farmAnalytics.subtitle")}</p>
      </div>

      {/* Main KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard
          icon={Egg}
          label={t("farmAnalytics.hatchRate")}
          value={`${Math.round(data.hatching.avgHatchRate)}%`}
          sub={`${data.hatching.completedCycles} ${ar ? "فقسة مكتملة" : "slutförda"}`}
          color="bg-amber-500/15 text-amber-400"
          trend={data.hatching.avgHatchRate > 60 ? "up" : "down"}
        />
        <KPICard
          icon={DollarSign}
          label={t("farmAnalytics.netProfit")}
          value={data.financial.netProfit.toLocaleString()}
          sub={`${profitMargin}% ${ar ? "هامش ربح" : "marginal"}`}
          color={data.financial.netProfit >= 0 ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}
          trend={data.financial.netProfit > 0 ? "up" : "down"}
        />
        <KPICard
          icon={Bird}
          label={t("farmAnalytics.chicksSold")}
          value={data.sales.totalChicksSold}
          sub={`${data.sales.totalSales} ${ar ? "عملية بيع" : "försäljningar"}`}
          color="bg-blue-500/15 text-blue-400"
        />
        <KPICard
          icon={Leaf}
          label={t("farmAnalytics.azollaSaved")}
          value={data.azolla.totalSavings.toLocaleString()}
          sub={`${data.azolla.totalKg.toLocaleString()} ${ar ? "كغ" : "kg"}`}
          color="bg-emerald-500/15 text-emerald-400"
        />
        <KPICard
          icon={Box}
          label={t("farmAnalytics.incubators")}
          value={`${data.incubators.active}/${data.incubators.total}`}
          color="bg-purple-500/15 text-purple-400"
        />
        <KPICard
          icon={ShieldCheck}
          label={ar ? "القطعان" : "Flockar"}
          value={data.flocks.totalFlocks}
          color="bg-sky-500/15 text-sky-400"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Profit/Loss */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-primary" />
              {t("farmAnalytics.profitLoss")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-xl bg-green-500/10">
                  <p className="text-[10px] text-muted-foreground">{t("farmAnalytics.revenue")}</p>
                  <p className="text-lg font-bold text-green-400">{data.financial.totalIncome.toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-xl bg-red-500/10">
                  <p className="text-[10px] text-muted-foreground">{t("farmAnalytics.costs")}</p>
                  <p className="text-lg font-bold text-red-400">{data.financial.totalExpenses.toLocaleString()}</p>
                </div>
                <div className={`p-3 rounded-xl ${data.financial.netProfit >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                  <p className="text-[10px] text-muted-foreground">{t("farmAnalytics.netProfit")}</p>
                  <p className={`text-lg font-bold ${data.financial.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {data.financial.netProfit.toLocaleString()}
                  </p>
                </div>
              </div>
              {profitData.length > 0 && (
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={profitData}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        <Cell fill="#22c55e" />
                        <Cell fill="#ef4444" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Performance Metrics */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Gauge className="w-4 h-4 text-primary" />
              {t("farmAnalytics.machinePerf")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={performanceData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {performanceData.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Hatching Analysis */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Egg className="w-4 h-4 text-amber-400" />
            {ar ? "تحليل أداء التفقيس" : "Kläckningsprestanda"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 rounded-xl bg-muted/50">
              <p className="text-3xl font-bold text-primary">{data.hatching.totalCycles}</p>
              <p className="text-xs text-muted-foreground mt-1">{ar ? "إجمالي الفقسات" : "Totala cykler"}</p>
            </div>
            <div className="text-center p-4 rounded-xl bg-muted/50">
              <p className="text-3xl font-bold text-green-400">{data.hatching.completedCycles}</p>
              <p className="text-xs text-muted-foreground mt-1">{ar ? "مكتملة" : "Slutförda"}</p>
            </div>
            <div className="text-center p-4 rounded-xl bg-muted/50">
              <p className="text-3xl font-bold text-amber-400">{data.hatching.activeCycles}</p>
              <p className="text-xs text-muted-foreground mt-1">{ar ? "نشطة حالياً" : "Aktiva"}</p>
            </div>
            <div className="text-center p-4 rounded-xl bg-muted/50">
              <p className="text-3xl font-bold text-blue-400">{Math.round(data.hatching.avgHatchRate)}%</p>
              <p className="text-xs text-muted-foreground mt-1">{ar ? "معدل نجاح الفقس" : "Kläckgrad"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Azolla Section */}
      {data.azolla.records > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Leaf className="w-4 h-4 text-emerald-400" />
              {t("azolla.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 rounded-xl bg-emerald-500/10">
                <p className="text-2xl font-bold text-emerald-400">{data.azolla.totalKg.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("azolla.totalProduction")} ({t("common.kg")})</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-green-500/10">
                <p className="text-2xl font-bold text-green-400">{data.azolla.totalSavings.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("azolla.totalSavings")}</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-emerald-500/10">
                <p className="text-2xl font-bold text-emerald-400">
                  {data.azolla.records > 0 ? Math.round(data.azolla.totalSavings / data.azolla.records * 30).toLocaleString() : 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t("azolla.monthlySavings")}</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-green-500/10">
                <p className="text-2xl font-bold text-green-400">
                  {data.azolla.records > 0 ? Math.round(data.azolla.totalSavings / data.azolla.records * 365).toLocaleString() : 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t("azolla.yearlySavings")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
