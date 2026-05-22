import { useState, useMemo } from "react";
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
  DollarSign, Plus, ShoppingCart, TrendingUp, Package,
  Trash2, Calendar, Users, Egg, Bird,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid,
} from "recharts";

interface Sale {
  id: number;
  customerId: number | null;
  hatchingCycleId: number | null;
  itemType: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  date: string;
  notes: string | null;
  customerName?: string;
  cycleName?: string;
}

interface Customer {
  id: number;
  name: string;
}

interface HatchCycle {
  id: number;
  batchName: string;
}

async function fetchJson(path: string) {
  const res = await fetch(apiPath(path), { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function postJson(path: string, body: any) {
  const res = await fetch(apiPath(path), {
    method: "POST", headers: { "Content-Type": "application/json" },
    credentials: "include", body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function SalesPage() {
  const { t, lang, dir } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const ar = lang === "ar";

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    customerId: "", hatchingCycleId: "", itemType: "chick",
    quantity: "", unitPrice: "1500", date: new Date().toISOString().split("T")[0], notes: "",
  });

  const { data: sales = [], isLoading } = useQuery<Sale[]>({
    queryKey: ["sales"], queryFn: () => fetchJson("/sales"),
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["customers"], queryFn: () => fetchJson("/customers"),
  });

  const { data: cycles = [] } = useQuery<HatchCycle[]>({
    queryKey: ["hatching-cycles"], queryFn: () => fetchJson("/hatching-cycles"),
  });

  const summary = useMemo(() => {
    const totalRevenue = sales.reduce((s, sale) => s + Number(sale.totalPrice), 0);
    const totalSold = sales.reduce((s, sale) => s + sale.quantity, 0);
    return { totalRevenue, totalSold, count: sales.length };
  }, [sales]);

  const monthlyData = useMemo(() => {
    const map = new Map<string, number>();
    sales.forEach(s => {
      const month = s.date.slice(0, 7);
      map.set(month, (map.get(month) || 0) + Number(s.totalPrice));
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, total]) => ({ month, total }));
  }, [sales]);

  const createMutation = useMutation({
    mutationFn: (body: any) => postJson("/sales", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast({ title: t("sales.recorded") });
      setShowAdd(false);
      setForm({ customerId: "", hatchingCycleId: "", itemType: "chick", quantity: "", unitPrice: "1500", date: new Date().toISOString().split("T")[0], notes: "" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(apiPath(`/sales/${id}`), { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sales"] }),
  });

  const handleCreate = () => {
    if (!form.quantity || !form.unitPrice) return;
    const qty = Number(form.quantity);
    const price = Number(form.unitPrice);
    createMutation.mutate({
      customerId: form.customerId ? Number(form.customerId) : null,
      hatchingCycleId: form.hatchingCycleId ? Number(form.hatchingCycleId) : null,
      itemType: form.itemType,
      quantity: qty,
      unitPrice: price,
      totalPrice: qty * price,
      date: form.date,
      notes: form.notes || null,
    });
  };

  const itemIcon = (type: string) => type === "chick" ? <Bird className="w-4 h-4" /> : <Egg className="w-4 h-4" />;

  if (isLoading) {
    return (
      <div className="space-y-4" dir={dir}>
        <Skeleton className="h-10 w-60" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28" />)}
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
            <ShoppingCart className="w-7 h-7 text-primary" />
            {t("sales.title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{t("sales.subtitle")}</p>
        </div>
        <Button onClick={() => setShowAdd(!showAdd)} size="sm" className="gap-1">
          <Plus className="w-4 h-4" />
          {t("sales.add")}
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("sales.totalRevenue")}</p>
                <p className="text-xl font-bold text-green-400">{summary.totalRevenue.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">{t("sales.dinar")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
                <Package className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("sales.totalSold")}</p>
                <p className="text-xl font-bold">{summary.totalSold.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("finance.transactions.count")}</p>
                <p className="text-xl font-bold">{summary.count}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      {monthlyData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("farmAnalytics.revenue")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name={t("sales.totalRevenue")} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add form */}
      {showAdd && (
        <Card className="border-primary/30">
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <select
                className="px-3 py-2 rounded-md border bg-background text-sm"
                value={form.itemType}
                onChange={e => setForm(f => ({ ...f, itemType: e.target.value }))}
              >
                <option value="chick">{t("sales.itemType.chick")}</option>
                <option value="egg">{t("sales.itemType.egg")}</option>
                <option value="chicken">{t("sales.itemType.chicken")}</option>
              </select>
              <Input type="number" placeholder={t("sales.quantity")} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
              <Input type="number" placeholder={t("sales.unitPrice")} value={form.unitPrice} onChange={e => setForm(f => ({ ...f, unitPrice: e.target.value }))} />
              <select
                className="px-3 py-2 rounded-md border bg-background text-sm"
                value={form.customerId}
                onChange={e => setForm(f => ({ ...f, customerId: e.target.value }))}
              >
                <option value="">{t("sales.customer")} ({t("finance.optional")})</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select
                className="px-3 py-2 rounded-md border bg-background text-sm"
                value={form.hatchingCycleId}
                onChange={e => setForm(f => ({ ...f, hatchingCycleId: e.target.value }))}
              >
                <option value="">{t("sales.cycle")} ({t("finance.optional")})</option>
                {cycles.map(c => <option key={c.id} value={c.id}>{c.batchName}</option>)}
              </select>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <Input placeholder={t("common.notes")} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            {form.quantity && form.unitPrice && (
              <p className="text-sm font-medium text-primary">
                {t("sales.totalPrice")}: {(Number(form.quantity) * Number(form.unitPrice)).toLocaleString()} {t("sales.dinar")}
              </p>
            )}
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={createMutation.isPending} size="sm">{t("common.save")}</Button>
              <Button variant="outline" onClick={() => setShowAdd(false)} size="sm">{t("common.cancel")}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sales list */}
      {sales.length === 0 ? (
        <Card className="py-16 text-center text-muted-foreground">
          <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{t("sales.empty")}</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {sales.map(sale => (
            <Card key={sale.id} className="hover:border-primary/20 transition-colors">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      {itemIcon(sale.itemType)}
                    </div>
                    <div>
                      <p className="font-medium text-sm flex items-center gap-1.5">
                        {t(`sales.itemType.${sale.itemType}`)}
                        <span className="text-muted-foreground">×</span>
                        {sale.quantity}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <Calendar className="w-3 h-3" />
                        {sale.date}
                        {sale.customerName && (
                          <>
                            <Users className="w-3 h-3 ms-1" />
                            {sale.customerName}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-end">
                      <p className="font-bold text-green-400">{Number(sale.totalPrice).toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">{Number(sale.unitPrice).toLocaleString()} / {t(`sales.itemType.${sale.itemType}`)}</p>
                    </div>
                    <Button
                      variant="ghost" size="sm"
                      className="text-red-400 hover:text-red-500 h-8 w-8 p-0"
                      onClick={() => deleteMutation.mutate(sale.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
