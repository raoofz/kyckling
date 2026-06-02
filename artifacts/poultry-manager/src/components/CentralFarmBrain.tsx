import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { Brain } from "lucide-react";

const BASE = import.meta.env.BASE_URL ?? "/";

function fmt(n: number) { return Math.round(n).toLocaleString("ar-IQ"); }
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return dd + " / " + mm + " / " + date.getFullYear();
}

interface MachineData {
  name: string; incId: number; cycles: number; completedCycles: number;
  avgRate: number; bestRate: number; worstRate: number;
  totalHatched: number; totalEggs: number;
  activeCycle: { id: number; startDate: string; dayNum: number; status: string; eggsSet: number; expectedHatchDate: string } | null;
}
interface BrainData {
  gimoka: MachineData; iraq1: MachineData;
  financial: { income: number; expense: number; profit: number; costPerChick: number; totalChicks: number };
  errors: Array<{ id: string; machine: string; severity: string; message: string; solution: string }>;
  recommendations: Array<{ id: string; machine: string; priority: string; title: string; detail: string }>;
  lastUpdated: Date;
}

function buildMachine(inc: any, incId: number, displayName: string): MachineData {
  if (!inc) return { name: displayName, incId, cycles: 0, completedCycles: 0, avgRate: 0, bestRate: 0, worstRate: 0, totalHatched: 0, totalEggs: 0, activeCycle: null };
  const cycles = Array.isArray(inc.cycles) ? inc.cycles : [];
  const completed = cycles.filter((c: any) => c.status === "completed" && c.hatchRate != null);
  const rates = completed.map((c: any) => parseFloat(c.hatchRate) || 0);
  const avgRate = rates.length > 0 ? Math.round(rates.reduce((a: number, b: number) => a + b, 0) / rates.length) : 0;
  const bestRate = rates.length > 0 ? Math.max(...rates) : 0;
  const worstRate = rates.length > 0 ? Math.min(...rates) : 0;
  const totalHatched = cycles.reduce((s: number, c: any) => s + (c.eggsHatched || 0), 0);
  const totalEggs = cycles.reduce((s: number, c: any) => s + (c.eggsSet || 0), 0);
  const raw = cycles.find((c: any) => c.status === "active" || c.status === "incubating" || c.isActive);
  let activeCycle = null;
  if (raw) {
    const startMs = new Date(raw.startDate).getTime();
    const dayNum = Math.min(Math.floor((Date.now() - startMs) / 86400000) + 1, 21);
    const expectedHatchDate = new Date(startMs + 21 * 86400000).toISOString().split("T")[0];
    activeCycle = { id: raw.id, startDate: raw.startDate, dayNum, status: raw.status, eggsSet: raw.eggsSet || 0, expectedHatchDate };
  }
  return { name: displayName, incId, cycles: cycles.length, completedCycles: completed.length, avgRate, bestRate, worstRate, totalHatched, totalEggs, activeCycle };
}

async function collectData(): Promise<BrainData> {
  const [r1, r2, rt] = await Promise.allSettled([
    fetch(BASE + "api/incubators/1", { credentials: "include" }),
    fetch(BASE + "api/incubators/2", { credentials: "include" }),
    fetch(BASE + "api/transactions?limit=500", { credentials: "include" }),
  ]);
  const inc1 = r1.status === "fulfilled" && r1.value.ok ? await r1.value.json() : null;
  const inc2 = r2.status === "fulfilled" && r2.value.ok ? await r2.value.json() : null;
  const txRaw = rt.status === "fulfilled" && rt.value.ok ? await rt.value.json() : [];
  const tx = Array.isArray(txRaw) ? txRaw : [];
  const gimoka = buildMachine(inc1, 1, "جيموكا");
  const iraq1 = buildMachine(inc2, 2, "عراق 1");
  const income = tx.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + parseFloat(t.amount || 0), 0);
  const expense = tx.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + parseFloat(t.amount || 0), 0);
  const totalChicks = gimoka.totalHatched + iraq1.totalHatched;
  const errors: BrainData["errors"] = [];
  const recommendations: BrainData["recommendations"] = [];
  if (gimoka.worstRate > 0 && gimoka.worstRate < 50) errors.push({ id: "g1", machine: "جيموكا", severity: "warning", message: "أدنى معدل تفقيس: " + Math.round(gimoka.worstRate) + "% في إحدى الدورات", solution: "راجع سجلات الحرارة والرطوبة لتلك الدورة" });
  if (iraq1.cycles > 0 && iraq1.avgRate < gimoka.avgRate - 20 && gimoka.completedCycles > 0) errors.push({ id: "g2", machine: "عراق 1", severity: "info", message: "أداء ماكينة عراق 1 أقل من جيموكا بفارق " + (gimoka.avgRate - iraq1.avgRate) + "%", solution: "قارن إعدادات الحرارة والرطوبة بين الماكينتين" });
  if (gimoka.activeCycle && gimoka.activeCycle.dayNum >= 18) recommendations.push({ id: "r1", machine: "جيموكا", priority: "high", title: "تفعيل وضع الإقفال (Lockdown)", detail: "اليوم " + gimoka.activeCycle.dayNum + " — أوقف التقليب وارفع الرطوبة إلى 70-75%" });
  if (gimoka.completedCycles >= 3) recommendations.push({ id: "r2", machine: "جيموكا", priority: "medium", title: "حافظ على إعدادات جيموكا (معدل " + gimoka.avgRate + "%)", detail: "الأداء جيد — لا تغير الإعدادات دون سبب واضح" });
  return { gimoka, iraq1, financial: { income, expense, profit: income - expense, costPerChick: totalChicks > 0 ? Math.round(expense / totalChicks) : 0, totalChicks }, errors, recommendations, lastUpdated: new Date() };
}

function AddChicksModal({ machineName, incId, onClose, onSaved }: { machineName: string; incId: number; onClose: () => void; onSaved: () => void }) {
  const today = new Date();
  const [chicks, setChicks] = useState("");
  const [losses, setLosses] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  async function handleSave() {
    setSaving(true);
    try {
      await fetch(BASE + "api/hatching-records", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ incubatorId: incId, date: today.toISOString().split("T")[0], eggsHatched: parseInt(chicks) || 0, losses: parseInt(losses) || 0, notes }) });
    } catch {}
    setSaved(true); setSaving(false);
    setTimeout(() => { onSaved(); onClose(); }, 1500);
  }
  const todayStr = String(today.getDate()).padStart(2,"0") + " / " + String(today.getMonth()+1).padStart(2,"0") + " / " + today.getFullYear();
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={onClose}>
      <div style={{ background:"#fff", borderRadius:16, padding:28, maxWidth:440, width:"90%", direction:"rtl", boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <h3 style={{ margin:0, fontSize:18, fontWeight:700, color:"#1e293b" }}>🐣 إضافة صيصان خرجت اليوم</h3>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20 }}>✕</button>
        </div>
        <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:10, padding:"10px 14px", marginBottom:16, fontSize:13 }}>
          <strong>الماكينة:</strong> {machineName} | <strong>التاريخ:</strong> {todayStr}
        </div>
        <div style={{ display:"grid", gap:12 }}>
          {[["عدد الصيصان *", chicks, setChicks, "120"], ["الفاقد", losses, setLosses, "5"]].map(([label, val, setter, ph], i) => (
            <label key={i} style={{ fontSize:13, fontWeight:600, color:"#475569" }}>
              {label as string}
              <input type="number" value={val as string} onChange={e => (setter as any)(e.target.value)} placeholder={ph as string} min="0"
                style={{ display:"block", width:"100%", marginTop:4, padding:"8px 12px", border:"1px solid #e2e8f0", borderRadius:8, fontSize:15, textAlign:"center", boxSizing:"border-box" }} />
            </label>
          ))}
          <label style={{ fontSize:13, fontWeight:600, color:"#475569" }}>ملاحظات
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات..."
              style={{ display:"block", width:"100%", marginTop:4, padding:"8px 12px", border:"1px solid #e2e8f0", borderRadius:8, fontSize:13, resize:"vertical", minHeight:60, boxSizing:"border-box" }} />
          </label>
        </div>
        <div style={{ display:"flex", gap:10, marginTop:20 }}>
          <button onClick={handleSave} disabled={saving || saved || !chicks}
            style={{ flex:1, padding:"12px 0", background: saved ? "#10b981" : "#6366f1", color:"#fff", border:"none", borderRadius:10, fontSize:15, fontWeight:700, cursor: !chicks ? "not-allowed" : "pointer", opacity: !chicks ? 0.6 : 1 }}>
            {saved ? "✓ تم الحفظ!" : saving ? "جاري الحفظ..." : "💾 حفظ"}
          </button>
          <button onClick={onClose} style={{ padding:"12px 20px", background:"#f1f5f9", color:"#64748b", border:"1px solid #e2e8f0", borderRadius:10, fontSize:14, cursor:"pointer" }}>إلغاء</button>
        </div>
      </div>
    </div>
  );
}

function MachineCard({ data, onAddChicks }: { data: MachineData; onAddChicks: () => void }) {
  const rc = data.avgRate >= 70 ? "#10b981" : data.avgRate >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ border:"1px solid #e2e8f0", borderRadius:14, padding:20, background:"#fff", flex:1, minWidth:280 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
        <div>
          <h3 style={{ margin:0, fontSize:17, fontWeight:800, color:"#1e293b" }}>⚙️ ماكينة {data.name}</h3>
          <p style={{ margin:"4px 0 0", fontSize:12, color:"#94a3b8" }}>{data.cycles} دورة / {data.completedCycles} مكتملة</p>
        </div>
        <div style={{ textAlign:"center", background: rc + "15", border:"1px solid " + rc + "40", borderRadius:10, padding:"6px 14px" }}>
          <div style={{ fontSize:24, fontWeight:900, color: rc }}>{data.avgRate}%</div>
          <div style={{ fontSize:10, color:"#94a3b8" }}>متوسط الفقس</div>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
        {[["أفضل دورة", data.bestRate > 0 ? data.bestRate + "%" : "—", "#10b981"],["أدنى دورة", data.worstRate > 0 ? Math.round(data.worstRate) + "%" : "—", "#ef4444"],["إجمالي صيصان", data.totalHatched.toLocaleString(), "#6366f1"],["إجمالي بيض", data.totalEggs.toLocaleString(), "#f59e0b"]].map(([lbl, val, clr], i) => (
          <div key={i} style={{ background:"#f8fafc", borderRadius:8, padding:"8px 10px", textAlign:"center" }}>
            <div style={{ fontSize:16, fontWeight:800, color: clr as string }}>{val as string}</div>
            <div style={{ fontSize:11, color:"#94a3b8" }}>{lbl as string}</div>
          </div>
        ))}
      </div>
      {data.activeCycle && (
        <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:10, padding:"10px 12px", marginBottom:12 }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#92400e", marginBottom:6 }}>🔥 الدورة النشطة — اليوم {data.activeCycle.dayNum}/21</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:4, fontSize:11, color:"#78716c" }}>
            <span>📅 البداية: {fmtDate(data.activeCycle.startDate)}</span>
            <span>🐣 الفقس المتوقع: {fmtDate(data.activeCycle.expectedHatchDate)}</span>
            <span>🥚 البيض: {data.activeCycle.eggsSet.toLocaleString()}</span>
            <span>📊 الحالة: {data.activeCycle.status}</span>
          </div>
        </div>
      )}
      <button onClick={onAddChicks} style={{ width:"100%", padding:"11px 0", background:"#6366f1", color:"#fff", border:"none", borderRadius:10, fontSize:14, fontWeight:700, cursor:"pointer" }}>
        🐣 إضافة صيصان خرجت اليوم
      </button>
    </div>
  );
}

export default function CentralFarmBrain() {
  const { lang } = useLanguage();
  const [data, setData] = useState<BrainData | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ machine: string; incId: number } | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try { const d = await collectData(); setData(d); setLastRefresh(new Date()); }
    catch (e) { console.error("CentralFarmBrain:", e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, 45_000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [load]);

  if (loading) return (
    <Card className="border-border/50 shadow-sm">
      <CardContent className="pt-6 pb-6 text-center">
        <Brain className="w-8 h-8 text-primary animate-pulse mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">جاري تحميل المخ المركزي للمزرعة...</p>
      </CardContent>
    </Card>
  );
  if (!data) return null;
  const { gimoka, iraq1, financial, errors, recommendations } = data;

  return (
    <div style={{ direction:"rtl", fontFamily:"'Tajawal','Cairo',sans-serif" }}>
      <div style={{ background:"linear-gradient(135deg,#1e293b 0%,#312e81 100%)", borderRadius:16, padding:"18px 22px", marginBottom:20, color:"#fff" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
          <div>
            <h2 style={{ margin:0, fontSize:20, fontWeight:900 }}>🧠 CENTRAL FARM INTELLIGENCE BRAIN</h2>
            <p style={{ margin:"4px 0 0", fontSize:12, color:"#a5b4fc" }}>المخ المركزي — تحليل ذكي لكامل بيانات المزرعة</p>
          </div>
          <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
            {[["صافي الربح", fmt(financial.profit) + " د.ع", "#34d399"],["إجمالي الفقسات", String(gimoka.cycles + iraq1.cycles), "#818cf8"],["إجمالي الصيصان", financial.totalChicks.toLocaleString(), "#fbbf24"],["متوسط الفقس", gimoka.avgRate > 0 ? gimoka.avgRate + "%" : "—", "#f472b6"]].map(([lbl, val, clr], i) => (
              <div key={i} style={{ textAlign:"center" }}>
                <div style={{ fontSize:20, fontWeight:900, color: clr as string }}>{val as string}</div>
                <div style={{ fontSize:11, color:"#94a3b8" }}>{lbl as string}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginTop:10, fontSize:11, color:"#64748b" }}>آخر تحديث: {lastRefresh.toLocaleTimeString("ar-IQ")} · يتحدث تلقائياً كل 45 ثانية</div>
      </div>

      <div style={{ display:"flex", gap:16, marginBottom:20, flexWrap:"wrap" }}>
        <MachineCard data={iraq1} onAddChicks={() => setModal({ machine: iraq1.name, incId: iraq1.incId })} />
        <MachineCard data={gimoka} onAddChicks={() => setModal({ machine: gimoka.name, incId: gimoka.incId })} />
      </div>

      <div style={{ border:"1px solid #e2e8f0", borderRadius:14, padding:20, background:"#fff", marginBottom:20 }}>
        <h3 style={{ margin:"0 0 16px", fontSize:16, fontWeight:800, color:"#1e293b" }}>📊 مقارنة ذكية بين الماكينتين</h3>
        <div style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:16, alignItems:"center", textAlign:"center" }}>
          <div><div style={{ fontSize:28, fontWeight:900, color:"#ef4444" }}>{iraq1.avgRate}%</div><div style={{ fontSize:13, fontWeight:700 }}>ماكينة {iraq1.name}</div><div style={{ fontSize:11, color:"#94a3b8" }}>{iraq1.cycles} دورة</div></div>
          <div style={{ background:"#f1f5f9", borderRadius:12, padding:"10px 18px", fontWeight:800, color:"#475569" }}>VS</div>
          <div><div style={{ fontSize:28, fontWeight:900, color:"#10b981" }}>{gimoka.avgRate}%</div><div style={{ fontSize:13, fontWeight:700 }}>ماكينة {gimoka.name}</div><div style={{ fontSize:11, color:"#94a3b8" }}>{gimoka.cycles} دورة</div></div>
        </div>
        {gimoka.avgRate > iraq1.avgRate && <div style={{ marginTop:12, background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:10, padding:"10px 14px", fontSize:13, color:"#166534", textAlign:"center" }}>✅ ماكينة {gimoka.name} الأفضل أداءً بفارق {gimoka.avgRate - iraq1.avgRate}%</div>}
      </div>

      <div style={{ border:"1px solid #e2e8f0", borderRadius:14, padding:20, background:"#fff", marginBottom:20 }}>
        <h3 style={{ margin:"0 0 16px", fontSize:16, fontWeight:800, color:"#1e293b" }}>💰 التحليل المالي الكامل</h3>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:12 }}>
          {[["إجمالي الإيرادات", fmt(financial.income) + " د.ع", "#10b981", "#f0fdf4"],["إجمالي المصاريف", fmt(financial.expense) + " د.ع", "#ef4444", "#fef2f2"],["صافي الربح", fmt(financial.profit) + " د.ع", financial.profit >= 0 ? "#6366f1" : "#ef4444", "#f0f0ff"],["تكلفة الصوص الواحد", fmt(financial.costPerChick) + " د.ع", "#f59e0b", "#fffbeb"]].map(([lbl, val, clr, bg], i) => (
            <div key={i} style={{ background: bg as string, borderRadius:10, padding:"12px 14px", textAlign:"center" }}>
              <div style={{ fontSize:18, fontWeight:900, color: clr as string }}>{val as string}</div>
              <div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>{lbl as string}</div>
            </div>
          ))}
        </div>
      </div>

      {errors.length > 0 && (
        <div style={{ border:"1px solid #fecaca", borderRadius:14, padding:20, background:"#fff7f7", marginBottom:20 }}>
          <h3 style={{ margin:"0 0 14px", fontSize:16, fontWeight:800, color:"#dc2626" }}>🚨 نظام اكتشاف الأخطاء — {errors.length} مشكلة</h3>
          {errors.map((err, i) => (
            <div key={i} style={{ background:"#fff", border:"1px solid #fde68a", borderRadius:10, padding:"12px 14px", marginBottom:8 }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#1e293b" }}>{err.severity === "critical" ? "🔴" : err.severity === "warning" ? "🟡" : "🔵"} {err.message}</div>
              <div style={{ fontSize:12, color:"#64748b", marginTop:4 }}>⚙️ {err.machine}</div>
              <div style={{ fontSize:12, color:"#059669", marginTop:4, background:"#f0fdf4", padding:"4px 8px", borderRadius:6, display:"inline-block" }}>💡 {err.solution}</div>
            </div>
          ))}
        </div>
      )}

      {recommendations.length > 0 && (
        <div style={{ border:"1px solid #e0e7ff", borderRadius:14, padding:20, background:"#fafafe", marginBottom:20 }}>
          <h3 style={{ margin:"0 0 14px", fontSize:16, fontWeight:800, color:"#4f46e5" }}>💡 التوصيات الذكية — {recommendations.length} توصية</h3>
          {recommendations.map((rec, i) => (
            <div key={i} style={{ background:"#fff", border:"1px solid #c7d2fe", borderRadius:10, padding:"12px 14px", marginBottom:8 }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#1e293b" }}>{rec.title}</div>
              <div style={{ fontSize:12, color:"#6366f1", marginTop:4 }}>⚙️ {rec.machine} — {rec.priority === "high" ? "🔴 عالية" : rec.priority === "medium" ? "🟡 متوسطة" : "🟢 منخفضة"}</div>
              <div style={{ fontSize:12, color:"#64748b", marginTop:4 }}>{rec.detail}</div>
            </div>
          ))}
        </div>
      )}

      {modal && <AddChicksModal machineName={modal.machine} incId={modal.incId} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
    </div>
  );
}
