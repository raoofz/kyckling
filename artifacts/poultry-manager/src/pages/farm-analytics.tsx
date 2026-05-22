import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiPath } from "@/lib/api";
import {
  TrendingUp, TrendingDown, DollarSign, Egg, Bird, Box, Leaf,
  BarChart3, ShoppingCart, Gauge, ArrowUp, ArrowDown, Minus,
  Wallet, PiggyBank, Receipt, Calculator, Coins, Package,
  Scale, CircleDollarSign, BadgeDollarSign, Banknote,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, Cell, PieChart, Pie,
} from "recharts";

const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

async function fetchJson(path: string) {
  const res = await fetch(apiPath(path), { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function fmt(n: number) {
  return n.toLocaleString("ar-IQ");
}

function KPI({ icon: Icon, label, value, sub, color, trend }: {
  icon: any; label: string; value: string | number; sub?: string;
  color: string; trend?: "up" | "down" | "stable";
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <p className="text-xl font-bold mt-0.5">{typeof value === "number" ? fmt(value) : value}</p>
              {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
            </div>
          </div>
          {trend && (
            <div className={`flex items-center gap-0.5 text-xs font-medium ${
              trend === "up" ? "text-emerald-500" : trend === "down" ? "text-red-500" : "text-gray-400"
            }`}>
              {trend === "up" ? <ArrowUp className="w-3 h-3" /> : trend === "down" ? <ArrowDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function FinancialStat({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon: any }) {
  return (
    <div className={`p-3 rounded-xl ${color} text-center`}>
      <Icon className="w-4 h-4 mx-auto mb-1 opacity-60" />
      <p className="text-lg font-bold">{fmt(value)}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
      <p className="text-[9px] text-muted-foreground/70">{value >= 1000000 ? `${(value/1000000).toFixed(1)}M` : value >= 1000 ? `${(value/1000).toFixed(0)}K` : ""} دينار</p>
    </div>
  );
}

export default function FarmAnalyticsPage() {
  const { t, lang, dir } = useLanguage();
  const ar = lang === "ar";

  const { data, isLoading } = useQuery<any>({
    queryKey: ["farm-analytics"],
    queryFn: () => fetchJson("/farm-analytics/overview"),
  });

  const cycleChartData = useMemo(() => {
    if (!data?.hatching?.cycleBreakdown) return [];
    return data.hatching.cycleBreakdown
      .filter((c: any) => c.status === "completed")
      .map((c: any) => ({
        name: c.name.replace("الفقسة ", ""),
        eggs: c.eggsSet,
        hatched: c.eggsHatched || 0,
        rate: c.hatchRate || 0,
        revenue: c.saleRevenue,
        cost: c.eggCost,
        profit: c.profit,
      }));
  }, [data]);

  const revenueVsCostData = useMemo(() => {
    if (!data) return [];
    return [
      { name: ar ? "مبيعات الصيصان" : "Kycklingförsäljning", value: data.financial.totalSalesRevenue },
      { name: ar ? "توفير الأزولا" : "Azolla-besparing", value: data.azolla.totalSavings },
      { name: ar ? "تكلفة البيض" : "Äggkostnad", value: data.financial.totalEggCost },
    ];
  }, [data, ar]);

  if (isLoading || !data) {
    return (
      <div className="space-y-4" dir={dir}>
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  const f = data.financial;
  const s = data.sales;
  const h = data.hatching;
  const az = data.azolla;

  return (
    <div className="space-y-6" dir={dir}>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="w-7 h-7 text-primary" />
          {ar ? "الوضع المالي والتحليلات" : "Ekonomi och Analys"}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {ar ? "ملخص شامل للإيرادات والتكاليف والأرباح والتوفير" : "Fullständig översikt av intäkter, kostnader och vinst"}
        </p>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 1: Financial Summary KPIs */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI
          icon={Banknote}
          label={ar ? "إجمالي المبيعات" : "Total försäljning"}
          value={f.totalSalesRevenue}
          sub={`${fmt(s.totalChicksSold)} ${ar ? "صوص مباع" : "kycklingar sålda"}`}
          color="bg-emerald-500/15 text-emerald-500"
          trend="up"
        />
        <KPI
          icon={Receipt}
          label={ar ? "تكلفة البيض الكلية" : "Total äggkostnad"}
          value={f.totalEggCost}
          sub={`${fmt(h.totalEggsUsed + h.activeEggs)} ${ar ? "بيضة × 500 دينار" : "ägg × 500 dinar"}`}
          color="bg-red-500/15 text-red-500"
          trend="down"
        />
        <KPI
          icon={DollarSign}
          label={ar ? "صافي الربح" : "Nettovinst"}
          value={f.netProfit}
          sub={`${f.profitMargin}% ${ar ? "هامش ربح" : "marginal"}`}
          color={f.netProfit >= 0 ? "bg-green-500/15 text-green-500" : "bg-red-500/15 text-red-500"}
          trend={f.netProfit > 0 ? "up" : "down"}
        />
        <KPI
          icon={Leaf}
          label={ar ? "توفير الأزولا" : "Azolla-besparing"}
          value={az.totalSavings}
          sub={`${fmt(az.totalKg)} ${ar ? "كغ علف مجاني" : "kg gratis foder"}`}
          color="bg-teal-500/15 text-teal-500"
          trend="up"
        />
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 2: Detailed Financial Breakdown */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Wallet className="w-4 h-4 text-primary" />
            {ar ? "التفاصيل المالية الكاملة" : "Fullständig ekonomisk översikt"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Income section */}
          <div>
            <h3 className="text-xs font-bold text-emerald-700 mb-2 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              {ar ? "الإيرادات والدخل" : "Intäkter"}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <FinancialStat label={ar ? "مبيعات الصيصان" : "Kycklingförsäljning"} value={f.totalSalesRevenue} color="bg-emerald-50 text-emerald-700" icon={ShoppingCart} />
              <FinancialStat label={ar ? "توفير علف الأزولا" : "Azolla-besparing"} value={az.totalSavings} color="bg-teal-50 text-teal-700" icon={Leaf} />
              <FinancialStat label={ar ? "قيمة الدجاج المتبقي" : "Värde kvarvarande hönor"} value={f.chickenValue} color="bg-blue-50 text-blue-700" icon={Bird} />
              <FinancialStat label={ar ? "إجمالي الأصول" : "Totala tillgångar"} value={f.totalSalesRevenue + az.totalSavings + f.chickenValue} color="bg-green-50 text-green-700" icon={PiggyBank} />
            </div>
          </div>

          {/* Expense section */}
          <div>
            <h3 className="text-xs font-bold text-red-700 mb-2 flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5" />
              {ar ? "التكاليف والمصاريف" : "Kostnader"}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <FinancialStat label={ar ? "شراء بيض مخصب" : "Inköp av ägg"} value={f.totalEggCost} color="bg-red-50 text-red-700" icon={Egg} />
              <FinancialStat label={ar ? "مصاريف أخرى" : "Övriga kostnader"} value={Math.max(0, f.totalExpenses - f.totalEggCost)} color="bg-orange-50 text-orange-700" icon={Receipt} />
              <FinancialStat label={ar ? "إجمالي التكاليف" : "Totala kostnader"} value={f.totalEggCost} color="bg-red-50 text-red-700" icon={Calculator} />
              <FinancialStat
                label={ar ? "صافي الربح النهائي" : "Slutlig nettovinst"}
                value={f.netProfit}
                color={f.netProfit >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}
                icon={CircleDollarSign}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 3: Per-Chick Economics */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Bird className="w-4 h-4 text-primary" />
              {ar ? "اقتصاديات الصوص الواحد" : "Ekonomi per kyckling"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-4 rounded-xl bg-blue-50 border border-blue-100">
                <Coins className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                <p className="text-2xl font-bold text-blue-700">{fmt(f.costPerChick)}</p>
                <p className="text-xs text-muted-foreground mt-1">{ar ? "تكلفة إنتاج الصوص" : "Produktionskostnad"}</p>
                <p className="text-[9px] text-muted-foreground/70">{ar ? "دينار/صوص" : "dinar/kyckling"}</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                <BadgeDollarSign className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                <p className="text-2xl font-bold text-emerald-700">{fmt(f.revenuePerChick)}</p>
                <p className="text-xs text-muted-foreground mt-1">{ar ? "سعر بيع الصوص" : "Försäljningspris"}</p>
                <p className="text-[9px] text-muted-foreground/70">{ar ? "دينار/صوص" : "dinar/kyckling"}</p>
              </div>
              <div className={`text-center p-4 rounded-xl border ${f.profitPerChick >= 0 ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"}`}>
                <Scale className="w-5 h-5 mx-auto mb-1" style={{ color: f.profitPerChick >= 0 ? "#16a34a" : "#dc2626" }} />
                <p className={`text-2xl font-bold ${f.profitPerChick >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(f.profitPerChick)}</p>
                <p className="text-xs text-muted-foreground mt-1">{ar ? "ربح لكل صوص" : "Vinst per kyckling"}</p>
                <p className="text-[9px] text-muted-foreground/70">{ar ? "دينار/صوص" : "dinar/kyckling"}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                <p className="text-xs text-muted-foreground">{ar ? "إجمالي البيض المستخدم" : "Totalt använda ägg"}</p>
                <p className="text-lg font-bold">{fmt(h.totalEggsUsed)}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                <p className="text-xs text-muted-foreground">{ar ? "إجمالي الصيصان المفقوسة" : "Totalt kläckta"}</p>
                <p className="text-lg font-bold text-emerald-600">{fmt(h.totalChicksHatched)}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                <p className="text-xs text-muted-foreground">{ar ? "الصيصان المباعة" : "Sålda kycklingar"}</p>
                <p className="text-lg font-bold text-blue-600">{fmt(s.totalChicksSold)}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                <p className="text-xs text-muted-foreground">{ar ? "دجاج متبقي (117)" : "Kvarvarande (117)"}</p>
                <p className="text-lg font-bold text-violet-600">{fmt(f.chickenValue)}</p>
                <p className="text-[9px] text-muted-foreground">{ar ? "قيمة تقديرية" : "Uppskattat värde"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Revenue vs Cost chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-primary" />
              {ar ? "الإيرادات مقابل التكاليف" : "Intäkter vs Kostnader"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueVsCostData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [fmt(v) + " دينار", ""]}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    <Cell fill="#22c55e" />
                    <Cell fill="#14b8a6" />
                    <Cell fill="#ef4444" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 4: Azolla Savings */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {az.records > 0 && (
        <Card className="border-teal-200 bg-gradient-to-br from-teal-50/30 to-emerald-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Leaf className="w-4 h-4 text-teal-600" />
              {ar ? "توفير الأزولا — علف مجاني" : "Azolla-besparing — Gratis foder"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="text-center p-3 rounded-xl bg-teal-100/50 border border-teal-200">
                <p className="text-xl font-bold text-teal-700">{az.dailyKg} كغ</p>
                <p className="text-[10px] text-muted-foreground">{ar ? "إنتاج يومي" : "Daglig produktion"}</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-emerald-100/50 border border-emerald-200">
                <p className="text-xl font-bold text-emerald-700">{fmt(az.dailySavings)}</p>
                <p className="text-[10px] text-muted-foreground">{ar ? "توفير يومي" : "Daglig besparing"}</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-emerald-100/50 border border-emerald-200">
                <p className="text-xl font-bold text-emerald-700">{fmt(az.monthlySavings)}</p>
                <p className="text-[10px] text-muted-foreground">{ar ? "توفير شهري" : "Månadsbesparing"}</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-green-100/50 border border-green-200">
                <p className="text-xl font-bold text-green-700">{fmt(az.yearlySavings)}</p>
                <p className="text-[10px] text-muted-foreground">{ar ? "توفير سنوي" : "Årsbesparing"}</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-teal-100/50 border border-teal-200">
                <p className="text-xl font-bold text-teal-700">{fmt(az.totalKg)} كغ</p>
                <p className="text-[10px] text-muted-foreground">{ar ? `إجمالي ${az.records} يوم` : `Totalt ${az.records} dagar`}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 5: Per-Cycle Breakdown Table */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Egg className="w-4 h-4 text-amber-500" />
            {ar ? "أداء كل فقسة — تكاليف وأرباح" : "Prestanda per cykel — Kostnader och vinst"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground">
                  <th className="text-right py-2 px-2 font-medium">{ar ? "الفقسة" : "Cykel"}</th>
                  <th className="text-center py-2 px-2 font-medium">{ar ? "الماكينة" : "Maskin"}</th>
                  <th className="text-center py-2 px-2 font-medium">{ar ? "بيض" : "Ägg"}</th>
                  <th className="text-center py-2 px-2 font-medium">{ar ? "فقس" : "Kläckt"}</th>
                  <th className="text-center py-2 px-2 font-medium">{ar ? "نسبة" : "Grad"}</th>
                  <th className="text-center py-2 px-2 font-medium">{ar ? "مباع" : "Såld"}</th>
                  <th className="text-center py-2 px-2 font-medium">{ar ? "تكلفة البيض" : "Äggkostnad"}</th>
                  <th className="text-center py-2 px-2 font-medium">{ar ? "إيراد البيع" : "Intäkter"}</th>
                  <th className="text-center py-2 px-2 font-medium">{ar ? "الربح" : "Vinst"}</th>
                  <th className="text-center py-2 px-2 font-medium">{ar ? "الحالة" : "Status"}</th>
                </tr>
              </thead>
              <tbody>
                {h.cycleBreakdown.map((c: any) => {
                  const statusColor = c.status === "completed" ? "text-emerald-600 bg-emerald-50" :
                    c.status === "incubating" ? "text-blue-600 bg-blue-50" : "text-amber-600 bg-amber-50";
                  const statusLabel = c.status === "completed" ? (ar ? "مكتملة" : "Klar") :
                    c.status === "incubating" ? (ar ? "شغالة" : "Pågår") :
                    c.status === "hatching" ? (ar ? "تفقس" : "Kläcks") : c.status;
                  return (
                    <tr key={c.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-2 font-medium">{c.name}</td>
                      <td className="py-2 px-2 text-center">
                        <span className="bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded text-[10px]">{c.machine}</span>
                      </td>
                      <td className="py-2 px-2 text-center">{fmt(c.eggsSet)}</td>
                      <td className="py-2 px-2 text-center font-medium text-emerald-600">{c.eggsHatched != null ? fmt(c.eggsHatched) : "—"}</td>
                      <td className="py-2 px-2 text-center">
                        {c.hatchRate != null ? (
                          <span className={`font-bold ${c.hatchRate >= 70 ? "text-emerald-600" : c.hatchRate >= 40 ? "text-amber-600" : "text-red-600"}`}>
                            {c.hatchRate}%
                          </span>
                        ) : "—"}
                      </td>
                      <td className="py-2 px-2 text-center">{c.soldCount > 0 ? fmt(c.soldCount) : "—"}</td>
                      <td className="py-2 px-2 text-center text-red-600">{fmt(c.eggCost)}</td>
                      <td className="py-2 px-2 text-center text-emerald-600">{c.saleRevenue > 0 ? fmt(c.saleRevenue) : "—"}</td>
                      <td className="py-2 px-2 text-center">
                        {c.saleRevenue > 0 ? (
                          <span className={`font-bold ${c.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {c.profit >= 0 ? "+" : ""}{fmt(c.profit)}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusColor}`}>{statusLabel}</span>
                      </td>
                    </tr>
                  );
                })}
                {/* Totals row */}
                <tr className="border-t-2 border-primary/30 bg-primary/5 font-bold">
                  <td className="py-2 px-2">{ar ? "المجموع" : "Totalt"}</td>
                  <td className="py-2 px-2" />
                  <td className="py-2 px-2 text-center">{fmt(h.cycleBreakdown.reduce((s: number, c: any) => s + c.eggsSet, 0))}</td>
                  <td className="py-2 px-2 text-center text-emerald-600">{fmt(h.totalChicksHatched)}</td>
                  <td className="py-2 px-2 text-center text-primary">{Math.round(h.avgHatchRate)}%</td>
                  <td className="py-2 px-2 text-center">{fmt(s.totalChicksSold)}</td>
                  <td className="py-2 px-2 text-center text-red-600">{fmt(f.totalEggCost)}</td>
                  <td className="py-2 px-2 text-center text-emerald-600">{fmt(f.totalSalesRevenue)}</td>
                  <td className="py-2 px-2 text-center">
                    <span className={f.netProfit >= 0 ? "text-emerald-600" : "text-red-600"}>
                      {f.netProfit >= 0 ? "+" : ""}{fmt(f.netProfit)}
                    </span>
                  </td>
                  <td className="py-2 px-2" />
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 6: Per-Cycle Chart */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {cycleChartData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-primary" />
                {ar ? "نسبة الفقس لكل دفعة" : "Kläckningsgrad per cykel"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cycleChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="rate" name={ar ? "نسبة الفقس %" : "Kläckningsgrad %"} radius={[6, 6, 0, 0]}>
                      {cycleChartData.map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-primary" />
                {ar ? "ربح كل فقسة" : "Vinst per cykel"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cycleChartData.filter((c: any) => c.revenue > 0)}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      formatter={(v: number) => [fmt(v) + " دينار", ""]}
                    />
                    <Bar dataKey="revenue" name={ar ? "الإيراد" : "Intäkt"} fill="#22c55e" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="cost" name={ar ? "التكلفة" : "Kostnad"} fill="#ef4444" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 7: Machines + Hatching Summary */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Box className="w-4 h-4 text-violet-500" />
              {ar ? "حالة الماكينات" : "Maskinstatus"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.incubators.details.map((inc: any) => (
              <div key={inc.id} className="bg-violet-50/50 rounded-xl p-3 border border-violet-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm text-violet-800">{inc.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${inc.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
                    {inc.status === "active" ? (ar ? "نشطة" : "Aktiv") : (ar ? "متوقفة" : "Inaktiv")}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <p className="font-bold text-violet-700">{fmt(inc.capacity)}</p>
                    <p className="text-muted-foreground text-[10px]">{ar ? "السعة" : "Kapacitet"}</p>
                  </div>
                  <div>
                    <p className="font-bold text-blue-700">{inc.activeCycles}</p>
                    <p className="text-muted-foreground text-[10px]">{ar ? "فقسات نشطة" : "Aktiva cykler"}</p>
                  </div>
                  <div>
                    <p className="font-bold text-orange-700">{fmt(inc.activeEggs)}</p>
                    <p className="text-muted-foreground text-[10px]">{ar ? "بيض حالي" : "Aktuella ägg"}</p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Egg className="w-4 h-4 text-amber-500" />
              {ar ? "ملخص التفقيس" : "Kläckningssammanfattning"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-4 rounded-xl bg-muted/50 border border-border/60">
                <p className="text-3xl font-bold text-primary">{h.totalCycles}</p>
                <p className="text-xs text-muted-foreground mt-1">{ar ? "إجمالي الفقسات" : "Totala cykler"}</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                <p className="text-3xl font-bold text-emerald-600">{h.completedCycles}</p>
                <p className="text-xs text-muted-foreground mt-1">{ar ? "مكتملة" : "Slutförda"}</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-blue-50 border border-blue-100">
                <p className="text-3xl font-bold text-blue-600">{h.activeCycles}</p>
                <p className="text-xs text-muted-foreground mt-1">{ar ? "نشطة الآن" : "Aktiva nu"}</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-amber-50 border border-amber-100">
                <p className="text-3xl font-bold text-amber-600">{Math.round(h.avgHatchRate)}%</p>
                <p className="text-xs text-muted-foreground mt-1">{ar ? "معدل نجاح الفقس" : "Kläckgrad"}</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-slate-50 border border-slate-100 col-span-2">
                <p className="text-2xl font-bold text-slate-700">{fmt(h.activeEggs)}</p>
                <p className="text-xs text-muted-foreground mt-1">{ar ? "بيض قيد التفقيس حالياً" : "Ägg i inkubation nu"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
