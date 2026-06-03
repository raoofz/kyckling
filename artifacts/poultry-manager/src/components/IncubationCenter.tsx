/**
 * IncubationCenter — مركز مراقبة التفقيس
 * ═══════════════════════════════════════════════════════════════
 *
 * DESIGN PRINCIPLES (من بحث احترافي):
 *  • أرقام monospace كبيرة للمقاييس الأساسية
 *  • خلفية داكنة جداً (#080b10) + نص عالي التباين
 *  • ألوان دلالية فقط: أزرق=حضانة، عنبري=إغلاق، أخضر=فقس، أحمر=خطر
 *  • تواريخ وأوقات رقمية: DD/MM/YYYY HH:MM
 *  • لا ديكور بلا وظيفة
 *  • كل ماكينة تظهر دائماً (نشطة أو آخر دورة لها)
 *  • زر فتح الفقاسة بارز ومباشر
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Thermometer, Droplets, Egg, Bird, Wifi, WifiOff,
  RefreshCw, Plus, Trash2, ChevronDown, ChevronUp,
  AlertTriangle, AlertCircle, CheckCircle2, RotateCcw,
  Activity, DollarSign, FlaskConical,
} from "lucide-react";

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────

const BG    = "#080b10";
const CARD  = "#0d1219";
const EDGE  = "#1a2535";
const DIM   = "#8b949e";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Cycle {
  id: number;
  batchName: string;
  eggsSet: number;
  eggsHatched: number | null;
  startDate: string;          // YYYY-MM-DD
  setTime: string | null;     // HH:MM
  expectedHatchDate: string;
  actualHatchDate: string | null;
  lockdownDate: string | null;
  lockdownTime: string | null;
  status: string;
  temperature: number | null;
  humidity: number | null;
  lockdownTemperature: number | null;
  lockdownHumidity: number | null;
  incubatorId: number | null;
  notes: string | null;
  createdAt: string;
}

interface Incubator {
  id: number;
  name: string;
  model: string | null;
  capacity: number;
  status: string;
  location: string | null;
  purchaseCost: number | null;
  activeCycle: Cycle | null;
}

interface Opening {
  id: number;
  hatchingCycleId: number;
  openedAt: string;
  chicksCount: number;
  notes: string | null;
  openedByName: string | null;
  createdAt: string;
}

// ─── Phase Engine ─────────────────────────────────────────────────────────────

type Phase = "incubation" | "lockdown" | "hatching" | "overdue" | "completed" | "failed";

interface PhaseResult {
  phase: Phase;
  day: number;
  pct: number;
  secsLeft: number;
  daysLeft: number;
  hoursLeft: number;
  minsLeft: number;
  idealTemp: number;
  idealHum: number;
  turningNeeded: boolean;
  candlingNext: number | null;   // next candling day (7, 14, 18)
  embryoStage: string;
  phaseLabel: string;
  accent: string;
}

const CANDLING_DAYS = [7, 14, 18];

const EMBRYO: Record<number, string> = {
  1:"تكوين المحور العصبي",   2:"ظهور الأوعية الدموية",
  3:"القلب يبدأ النبض",       4:"تمايز الرأس والأطراف",
  5:"الجهاز الهضمي",          6:"ظهور المنقار والجناحين",
  7:"تكامل العينين",           8:"نمو الأطراف",
  9:"بصيلات الريش",           10:"تصلّب العظام",
  11:"الكلى والرئتان",         12:"الغطاء الريشي الكامل",
  13:"تخزين الدهون",           14:"التكلّس الثاني",
  15:"النمو شبه مكتمل",        16:"الجهاز المناعي",
  17:"آخر يوم للتقليب",        18:"الانتقال للفقس",
  19:"ثقب الغرفة الهوائية",   20:"كسر القشرة",
  21:"الخروج",
};

const PHASE_META: Record<Phase, { label:string; accent:string }> = {
  incubation:{ label:"حضانة",    accent:"#2563eb" },
  lockdown:  { label:"إغلاق",    accent:"#d97706" },
  hatching:  { label:"فقس نشط",  accent:"#059669" },
  overdue:   { label:"تأخّرت",   accent:"#dc2626" },
  completed: { label:"مكتملة",   accent:"#475569" },
  failed:    { label:"فاشلة",    accent:"#7f1d1d" },
};

function computePhase(cycle: Cycle, nowMs: number): PhaseResult {
  // Use setTime for precise start (matches hatching.tsx algorithm)
  const startMs = new Date(
    `${cycle.startDate}T${cycle.setTime ?? "12:00"}:00`
  ).getTime();
  const hatchMs = new Date(
    `${cycle.expectedHatchDate}T${cycle.setTime ?? "12:00"}:00`
  ).getTime();

  const elapsedMs = nowMs - startMs;
  const remainMs  = Math.max(0, hatchMs - nowMs);
  const totalMs   = hatchMs - startMs;

  const day     = Math.max(1, Math.floor(elapsedMs / 86_400_000) + 1);
  const pct     = totalMs > 0 ? Math.min(100, Math.round((elapsedMs / totalMs) * 100)) : 100;
  const secsLeft  = Math.floor(remainMs / 1_000);
  const daysLeft  = Math.floor(remainMs / 86_400_000);
  const hoursLeft = Math.floor((remainMs % 86_400_000) / 3_600_000);
  const minsLeft  = Math.floor((remainMs % 3_600_000) / 60_000);

  let phase: Phase;
  if (cycle.status === "completed")            phase = "completed";
  else if (cycle.status === "failed")          phase = "failed";
  else if (secsLeft === 0 && day > 22)         phase = "overdue";
  else if (day >= 19 || cycle.status === "hatching") phase = "hatching";
  else if (day >= 18)                          phase = "lockdown";
  else                                         phase = "incubation";

  const lkd = phase === "lockdown" || phase === "hatching";
  const idealTemp = lkd ? 37.2 : 37.7;
  const idealHum  = lkd ? 70   : 55;
  const turningNeeded = phase === "incubation" && day <= 17;

  const candlingNext = CANDLING_DAYS.find(d => d > day) ?? null;

  return {
    phase, day, pct, secsLeft, daysLeft, hoursLeft, minsLeft,
    idealTemp, idealHum, turningNeeded, candlingNext,
    embryoStage: EMBRYO[Math.min(day, 21)] ?? "اكتمل التطور",
    phaseLabel: PHASE_META[phase].label,
    accent:     PHASE_META[phase].accent,
  };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

/** DD/MM/YYYY */
function fmtDate(d: string): string {
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}

/** DD/MM/YYYY HH:MM from ISO */
function fmtIso(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mn = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yy} ${hh}:${mn}`;
}

function pad2(n: number): string { return String(n).padStart(2, "0"); }

function fmtNum(n: number): string { return n.toLocaleString("en-US"); }

// ─── Live Countdown ───────────────────────────────────────────────────────────

function LiveCountdown({ secsLeft, phase, accent }: {
  secsLeft: number; phase: Phase; accent: string;
}) {
  const [s, setS] = useState(secsLeft);
  useEffect(() => { setS(secsLeft); }, [secsLeft]);
  useEffect(() => {
    if (phase === "completed" || phase === "failed" || phase === "overdue") return;
    const id = setInterval(() => setS(v => Math.max(0, v - 1)), 1_000);
    return () => clearInterval(id);
  }, [phase]);

  if (phase === "completed") {
    return <span className="font-mono text-4xl font-black text-white/20">—</span>;
  }
  if (phase === "failed") {
    return <span className="font-mono text-4xl font-black text-red-800">✕</span>;
  }
  if (s <= 0 && phase === "hatching") {
    return (
      <span className="font-mono text-3xl font-black animate-pulse" style={{ color: accent }}>
        يفقس!
      </span>
    );
  }

  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  const sec = s % 60;

  return (
    <div className="flex items-end gap-1 font-mono font-black leading-none" style={{ color: accent }}>
      {d > 0 && (
        <><span className="text-4xl">{d}</span>
        <span className="text-xs mb-1" style={{ color: accent + "80" }}>d</span></>
      )}
      <span className="text-4xl">{pad2(h)}</span>
      <span className="text-base mb-0.5 mx-px" style={{ color: accent + "60" }}>:</span>
      <span className="text-4xl">{pad2(m)}</span>
      <span className="text-base mb-0.5 mx-px" style={{ color: accent + "60" }}>:</span>
      <span className="text-3xl" style={{ color: accent + "50" }}>{pad2(sec)}</span>
    </div>
  );
}

// ─── Day Bar ──────────────────────────────────────────────────────────────────

function DayBar({ day, accent }: { day: number; accent: string }) {
  const d = Math.max(0, Math.min(21, day));
  return (
    <div>
      {/* Segment ticks */}
      <div className="flex gap-[2px] h-3 items-end">
        {Array.from({ length: 21 }, (_, i) => {
          const n = i + 1;
          const filled = d >= n;
          const isNow  = n === d;
          const segColor = n <= 17 ? "#2563eb" : n === 18 ? "#d97706" : "#059669";
          return (
            <div
              key={n}
              className="flex-1 rounded-[1px] transition-all duration-500"
              style={{
                backgroundColor: filled ? segColor : "#1a2535",
                height: isNow ? "100%" : "55%",
                boxShadow: isNow ? `0 0 6px ${segColor}` : "none",
              }}
            />
          );
        })}
      </div>
      {/* Labels */}
      <div className="flex justify-between mt-1.5 text-[9px] font-mono" style={{ color: DIM + "80" }}>
        <span>01</span>
        <span>حضانة→</span>
        <span style={{ color: "#d97706" + "80" }}>18</span>
        <span>←فقس</span>
        <span>21</span>
      </div>
    </div>
  );
}

// ─── Sensor Block ─────────────────────────────────────────────────────────────

function SensorBlock({
  icon: Icon, label, value, ideal, unit, accentGood,
}: {
  icon: React.ElementType; label: string;
  value: number | null; ideal: number; unit: string; accentGood?: string;
}) {
  const diff = value != null ? value - ideal : null;
  const absDiff = diff != null ? Math.abs(diff) : null;
  const threshold1 = unit === "°C" ? 0.3 : 3;
  const threshold2 = unit === "°C" ? 1.0 : 8;

  const valColor =
    absDiff == null        ? "#4b5563"
    : absDiff <= threshold1 ? "#e5e7eb"
    : absDiff <= threshold2 ? "#fbbf24"
    :                          "#f87171";

  const iconColor =
    absDiff == null        ? "#374151"
    : absDiff <= threshold1 ? accentGood ?? "#10b981"
    : absDiff <= threshold2 ? "#f59e0b"
    :                          "#ef4444";

  const diffStr = diff != null
    ? (diff >= 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1))
    : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" style={{ color: iconColor }} />
        <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: DIM }}>
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-5xl font-black font-mono leading-none" style={{ color: valColor }}>
          {value != null ? value : "—"}
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-mono" style={{ color: valColor + "aa" }}>{unit}</span>
          {diffStr && absDiff! > 0.05 && (
            <span className="text-[10px] font-mono" style={{ color: valColor + "80" }}>
              {diffStr}
            </span>
          )}
        </div>
      </div>
      <div className="text-[10px] font-mono" style={{ color: "#374151" }}>
        ideal {ideal}{unit}
        {absDiff != null && absDiff <= threshold1 && (
          <span style={{ color: "#059669" }}> ✓</span>
        )}
      </div>
    </div>
  );
}

// ─── Open Incubator Form ──────────────────────────────────────────────────────

const HEALTH_OPTIONS = [
  { val:"ممتازة",  color:"#059669" },
  { val:"جيدة",    color:"#2563eb" },
  { val:"مقبولة",  color:"#d97706" },
  { val:"ضعيفة",   color:"#dc2626" },
];

function OpenIncubatorForm({ cycleId, eggsSet, onClose, openings }: {
  cycleId: number; eggsSet: number;
  onClose: () => void; openings: Opening[];
}) {
  const qc = useQueryClient();
  const [count,   setCount]  = useState("");
  const [health,  setHealth] = useState("ممتازة");
  const [ts,      setTs]     = useState(() => new Date().toISOString().slice(0, 16));
  const [note,    setNote]   = useState("");
  const [step,    setStep]   = useState<1|2>(1); // 1=form, 2=confirm

  const totalSoFar = openings.reduce((s, o) => s + o.chicksCount, 0);
  const rateSoFar  = eggsSet > 0 ? Math.round((totalSoFar / eggsSet) * 100) : 0;

  const add = useMutation({
    mutationFn: (d: object) => apiFetch(`/hatching-cycles/${cycleId}/openings`, {
      method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(d),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey:["openings", cycleId] });
      onClose();
    },
  });

  const countNum = parseInt(count) || 0;

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ background: "#0a1020", borderColor: "#059669" + "40" }}
    >
      {/* Header */}
      <div className="px-4 py-2.5 flex items-center justify-between border-b" style={{ borderColor: "#059669" + "25", background: "#059669" + "10" }}>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-sm font-bold text-emerald-400">فتح الفقاسة — تسجيل الصيصان</span>
        </div>
        <button onClick={onClose} className="text-white/30 hover:text-white/60 text-lg leading-none">×</button>
      </div>

      {/* Previous total */}
      {openings.length > 0 && (
        <div className="px-4 py-2 flex items-center gap-3 border-b" style={{ borderColor: EDGE, background:"#ffffff05" }}>
          <span className="text-[10px]" style={{ color: DIM }}>مُسجَّل سابقاً:</span>
          <span className="text-base font-black font-mono text-emerald-400">{fmtNum(totalSoFar)}</span>
          <span className="text-[10px]" style={{ color: DIM }}>صوص ({rateSoFar}%)</span>
          <span className="text-[10px]" style={{ color: DIM }}>من {openings.length} فتحة</span>
        </div>
      )}

      <div className="p-4 space-y-3">
        {/* Count + Health */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider font-medium block mb-1.5" style={{ color: DIM }}>
              عدد الصيصان *
            </label>
            <Input
              type="number" min="0" value={count}
              onChange={e => setCount(e.target.value)}
              placeholder="0"
              className="h-12 text-2xl font-black font-mono text-center"
              style={{ background:"#111827", borderColor: count ? "#059669" : EDGE, color:"#fff" }}
              autoFocus
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider font-medium block mb-1.5" style={{ color: DIM }}>
              الحالة الصحية
            </label>
            <div className="grid grid-cols-2 gap-1">
              {HEALTH_OPTIONS.map(h => (
                <button
                  key={h.val}
                  onClick={() => setHealth(h.val)}
                  className="h-[1.6rem] rounded text-[10px] font-bold transition-all"
                  style={{
                    background: health === h.val ? h.color + "25" : "#111827",
                    border: `1px solid ${health === h.val ? h.color : EDGE}`,
                    color: health === h.val ? h.color : DIM,
                  }}
                >
                  {h.val}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Date + time */}
        <div>
          <label className="text-[10px] uppercase tracking-wider font-medium block mb-1.5" style={{ color: DIM }}>
            التاريخ والوقت
          </label>
          <Input
            type="datetime-local" value={ts}
            onChange={e => setTs(e.target.value)}
            className="h-10 text-sm font-mono"
            style={{ background:"#111827", borderColor: EDGE, color:"#fff" }}
          />
        </div>

        {/* Notes */}
        <div>
          <label className="text-[10px] uppercase tracking-wider font-medium block mb-1.5" style={{ color: DIM }}>
            ملاحظات إضافية
          </label>
          <Input
            value={note} onChange={e => setNote(e.target.value)}
            placeholder="مثال: صيصان نشيطة وجافة، بعضها لم يخرج بعد"
            className="h-10 text-sm"
            style={{ background:"#111827", borderColor: EDGE, color:"#e5e7eb" }}
          />
        </div>

        {/* Summary + submit */}
        {countNum > 0 && (
          <div className="rounded-lg p-3" style={{ background:"#059669" + "10", border:`1px solid ${"#059669" + "30"}` }}>
            <div className="grid grid-cols-3 gap-2 text-center mb-3">
              {[
                { l:"يخرج الآن",       v: fmtNum(countNum),                         c:"#34d399" },
                { l:"الإجمالي",         v: fmtNum(totalSoFar + countNum),            c:"#6ee7b7" },
                { l:"النسبة الكلية",    v: `${Math.round(((totalSoFar+countNum)/eggsSet)*100)}%`, c:"#a7f3d0" },
              ].map(s => (
                <div key={s.l}>
                  <div className="text-xl font-black font-mono" style={{ color: s.c }}>{s.v}</div>
                  <div className="text-[9px] mt-0.5" style={{ color: "#6b7280" }}>{s.l}</div>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-center" style={{ color: "#4b5563" }}>
              {fmtIso(ts)} · حالة: {health}
            </div>
          </div>
        )}

        <Button
          className="w-full h-11 text-sm font-bold"
          style={{ background: countNum > 0 ? "#059669" : "#1a2535", color: countNum > 0 ? "#fff" : "#374151" }}
          onClick={() => {
            if (!countNum) return;
            const combined = [health, note].filter(Boolean).join(" — ");
            add.mutate({
              chicksCount: countNum,
              openedAt: new Date(ts).toISOString(),
              notes: combined || null,
            });
          }}
          disabled={add.isPending || countNum < 1}
        >
          {add.isPending ? "جاري الحفظ…" : `✓  حفظ — ${fmtNum(countNum)} صوص · ${health}`}
        </Button>
      </div>
    </div>
  );
}

// ─── Hatch Log Section ────────────────────────────────────────────────────────

function HatchLogSection({ cycleId, eggsSet, phase }: {
  cycleId: number; eggsSet: number; phase: Phase;
}) {
  const qc  = useQueryClient();
  const [formOpen,  setFormOpen]  = useState(false);
  const [listOpen,  setListOpen]  = useState(false);

  const { data: openings = [] } = useQuery<Opening[]>({
    queryKey: ["openings", cycleId],
    queryFn: () => apiFetch(`/hatching-cycles/${cycleId}/openings`),
    refetchInterval: 30_000,
  });

  const del = useMutation({
    mutationFn: (id: number) => apiFetch(`/hatch-openings/${id}`, { method:"DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey:["openings", cycleId] }),
  });

  const total = openings.reduce((s, o) => s + o.chicksCount, 0);
  const rate  = eggsSet > 0 ? Math.round((total / eggsSet) * 100) : 0;

  const isActive = phase !== "completed" && phase !== "failed";

  return (
    <div className="space-y-2 pt-3 border-t" style={{ borderColor: EDGE }}>
      {/* Form */}
      {formOpen && (
        <OpenIncubatorForm
          cycleId={cycleId}
          eggsSet={eggsSet}
          onClose={() => setFormOpen(false)}
          openings={openings}
        />
      )}

      {/* Open incubator button */}
      {!formOpen && (
        <button
          onClick={() => setFormOpen(true)}
          className="w-full h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
          style={{
            background: isActive ? "#059669" + "15" : "#1a2535",
            border: `1px solid ${isActive ? "#059669" + "50" : EDGE}`,
            color: isActive ? "#34d399" : DIM,
          }}
        >
          <Bird className="w-4 h-4" />
          {isActive ? "فتح الفقاسة — تسجيل الصيصان" : "إضافة / تعديل فتحات"}
        </button>
      )}

      {/* Summary + list toggle */}
      {openings.length > 0 && (
        <>
          <div className="flex items-center gap-3">
            {/* Mini totals */}
            <div className="flex-1 grid grid-cols-3 gap-1.5">
              {[
                { l:"صيصان",    v: fmtNum(total), c:"#34d399" },
                { l:"نسبة",     v: `${rate}%`,   c: rate>=70?"#34d399":rate>=50?"#fbbf24":"#f87171" },
                { l:"فتحات",    v: String(openings.length), c:"#93c5fd" },
              ].map(s => (
                <div key={s.l} className="rounded-lg text-center py-1.5" style={{ background:"#0d1219", border:`1px solid ${EDGE}` }}>
                  <div className="text-base font-black font-mono" style={{ color: s.c }}>{s.v}</div>
                  <div className="text-[9px]" style={{ color: "#4b5563" }}>{s.l}</div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setListOpen(v => !v)}
              className="text-[10px] flex items-center gap-1 transition-colors"
              style={{ color: DIM }}
            >
              {listOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              السجل
            </button>
          </div>

          {/* Openings list */}
          {listOpen && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {openings.map((o, i) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-xs"
                  style={{ background:"#0d1219", border:`1px solid ${EDGE}` }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-[10px]" style={{ color:"#374151" }}>
                      #{i+1}
                    </span>
                    <span className="font-black font-mono text-base" style={{ color:"#34d399" }}>
                      {fmtNum(o.chicksCount)}
                    </span>
                    <span className="font-mono text-[11px]" style={{ color: DIM }}>
                      {fmtIso(o.openedAt)}
                    </span>
                    {o.notes && (
                      <span className="truncate text-[10px]" style={{ color:"#4b5563" }}>
                        {o.notes}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => del.mutate(o.id)}
                    className="p-0.5 transition-colors"
                    style={{ color:"#1f2937" }}
                    onMouseEnter={e => (e.currentTarget.style.color="#ef4444")}
                    onMouseLeave={e => (e.currentTarget.style.color="#1f2937")}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Active Machine Card ──────────────────────────────────────────────────────

function ActiveCard({ inc, cycle, nowMs }: {
  inc: Incubator; cycle: Cycle; nowMs: number;
}) {
  const cs  = useMemo(() => computePhase(cycle, nowMs), [cycle, nowMs]);
  const acc = cs.accent;

  const lkd      = cs.phase === "lockdown" || cs.phase === "hatching";
  const tempShow = lkd ? (cycle.lockdownTemperature ?? cycle.temperature) : cycle.temperature;
  const humShow  = lkd ? (cycle.lockdownHumidity    ?? cycle.humidity)    : cycle.humidity;

  const occupancy = inc.capacity > 0
    ? Math.min(100, Math.round((cycle.eggsSet / inc.capacity) * 100))
    : 0;

  // Financial quick calc
  const eggCost       = cycle.eggsSet * 500;
  const expectedChicks = Math.round(cycle.eggsSet * 0.65);
  const expectedRev    = expectedChicks * 1500;
  const expectedProfit = expectedRev - eggCost;

  // Lockdown date calc
  const lockdownDateStr = cycle.lockdownDate
    ? fmtDate(cycle.lockdownDate)
    : (() => {
        const s = new Date(`${cycle.startDate}T${cycle.setTime ?? "12:00"}:00`);
        s.setDate(s.getDate() + 17);
        return `${pad2(s.getDate())}/${pad2(s.getMonth()+1)}/${s.getFullYear()}`;
      })();

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: CARD,
        border: `1px solid ${acc}35`,
        boxShadow: `0 0 0 1px ${acc}15, 0 8px 32px ${acc}0d`,
      }}
    >
      {/* Accent top bar */}
      <div className="h-[2px]" style={{ background: `linear-gradient(90deg, ${acc}00, ${acc}, ${acc}00)` }} />

      {/* ── ROW 1: Machine name + Phase + Batch ── */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: acc }}>
                {inc.name}
              </span>
              {inc.model && (
                <span className="text-[10px] font-mono" style={{ color:"#374151" }}>{inc.model}</span>
              )}
              <span className="text-[10px] font-mono" style={{ color:"#1f2937" }}>
                {inc.capacity.toLocaleString("en-US")} eggs
              </span>
            </div>
            <h2 className="text-xl font-black text-white mt-1 leading-tight">{cycle.batchName}</h2>
          </div>
          {/* Phase pill */}
          <div
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold"
            style={{ background: acc + "18", border:`1px solid ${acc}45`, color: acc }}
          >
            {cs.phase === "hatching" && (
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: acc }} />
            )}
            {cs.phaseLabel}
          </div>
        </div>

        {/* Day bar */}
        <div className="mt-3.5">
          <DayBar day={cs.day} accent={acc} />
        </div>
      </div>

      {/* ── ROW 2: Dates (numeric) ── */}
      <div
        className="grid grid-cols-3 divide-x text-center py-0"
        style={{ borderTop:`1px solid ${EDGE}`, borderBottom:`1px solid ${EDGE}` }}
      >
        {[
          {
            label:"وضع البيض",
            date: fmtDate(cycle.startDate),
            sub: cycle.setTime ?? "——",
          },
          {
            label:"الإغلاق",
            date: lockdownDateStr,
            sub: cycle.lockdownTime ?? "——",
          },
          {
            label:"موعد الفقس",
            date: fmtDate(cycle.expectedHatchDate),
            sub: cs.daysLeft > 0
              ? `بعد ${cs.daysLeft}ي ${cs.hoursLeft}س`
              : cs.phase === "hatching" ? "الآن" : "حان الوقت",
          },
        ].map((d, i) => (
          <div key={i} className="px-3 py-3" style={{ borderRight: i<2 ? `1px solid ${EDGE}` : "none" }}>
            <div className="text-[9px] uppercase tracking-widest mb-1.5" style={{ color:"#374151" }}>
              {d.label}
            </div>
            <div className="font-mono text-sm font-bold text-white">{d.date}</div>
            <div
              className="font-mono text-xs mt-0.5"
              style={{ color: i===2 && cs.daysLeft<=1 ? "#fbbf24" : DIM }}
            >
              {d.sub}
            </div>
          </div>
        ))}
      </div>

      {/* ── ROW 3: Big 3 numbers ── */}
      <div className="grid grid-cols-3" style={{ borderBottom:`1px solid ${EDGE}` }}>
        {/* Day */}
        <div className="px-4 py-5 text-center" style={{ borderRight:`1px solid ${EDGE}` }}>
          <div className="text-[9px] uppercase tracking-widest mb-2" style={{ color:"#374151" }}>اليوم</div>
          <div className="text-6xl font-black font-mono leading-none" style={{ color: acc }}>
            {cs.day}
          </div>
          <div className="text-[9px] font-mono mt-2" style={{ color:"#1f2937" }}>/ 21</div>
        </div>

        {/* Countdown */}
        <div className="px-3 py-5 text-center" style={{ borderRight:`1px solid ${EDGE}` }}>
          <div className="text-[9px] uppercase tracking-widest mb-2" style={{ color:"#374151" }}>
            {cs.phase === "hatching" ? "الفقس جارٍ" : "للفقس"}
          </div>
          <div className="flex justify-center">
            <LiveCountdown secsLeft={cs.secsLeft} phase={cs.phase} accent={acc} />
          </div>
        </div>

        {/* Eggs */}
        <div className="px-4 py-5 text-center">
          <div className="text-[9px] uppercase tracking-widest mb-2" style={{ color:"#374151" }}>بيض</div>
          <div className="text-5xl font-black font-mono leading-none text-white">
            {cycle.eggsSet >= 1000
              ? <>{(cycle.eggsSet/1000).toFixed(1)}<span className="text-2xl" style={{ color:"#374151" }}>K</span></>
              : cycle.eggsSet}
          </div>
          <div className="text-[9px] font-mono mt-2" style={{ color:"#374151" }}>
            {occupancy}% طاقة
          </div>
        </div>
      </div>

      {/* ── ROW 4: Sensors ── */}
      <div className="grid grid-cols-2" style={{ borderBottom:`1px solid ${EDGE}` }}>
        <div className="px-5 py-4" style={{ borderRight:`1px solid ${EDGE}` }}>
          <SensorBlock
            icon={Thermometer} label="حرارة"
            value={tempShow} ideal={cs.idealTemp} unit="°C"
            accentGood="#10b981"
          />
        </div>
        <div className="px-5 py-4">
          <SensorBlock
            icon={Droplets} label="رطوبة"
            value={humShow} ideal={cs.idealHum} unit="%"
            accentGood="#0ea5e9"
          />
        </div>
      </div>

      {/* ── ROW 5: Biology + Turning ── */}
      <div
        className="px-5 py-3 flex items-center justify-between"
        style={{ borderBottom:`1px solid ${EDGE}` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <FlaskConical className="w-3.5 h-3.5 shrink-0" style={{ color:"#374151" }} />
          <div className="min-w-0">
            <span className="text-[9px] uppercase tracking-widest me-1.5" style={{ color:"#374151" }}>
              يوم {Math.min(cs.day,21)}:
            </span>
            <span className="text-xs" style={{ color: DIM }}>{cs.embryoStage}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {cs.candlingNext && (
            <div className="text-[10px] font-mono" style={{ color:"#374151" }}>
              تكلّس يوم <span style={{ color:"#2563eb" }}>{cs.candlingNext}</span>
            </div>
          )}
          <div
            className="flex items-center gap-1.5 text-[10px] font-semibold"
            style={{ color: cs.turningNeeded ? "#fbbf24" : "#1f2937" }}
          >
            <RotateCcw
              className="w-3.5 h-3.5"
              style={{
                animation: cs.turningNeeded ? "spin 3s linear infinite" : "none",
              }}
            />
            {cs.turningNeeded ? "تقليب" : "لا تقليب"}
          </div>
        </div>
      </div>

      {/* ── ROW 6: Alerts ── */}
      {(() => {
        const alerts: { lvl:"crit"|"warn"; msg:string }[] = [];
        if (!tempShow) alerts.push({ lvl:"warn", msg:"لم تُسجَّل درجة الحرارة" });
        else if (Math.abs(tempShow - cs.idealTemp) > 1.2)
          alerts.push({ lvl:"crit", msg:`حرارة ${tempShow}°C — المثالي ${cs.idealTemp}°C` });
        if (cs.phase === "lockdown")
          alerts.push({ lvl:"crit", msg:"يوم الإغلاق — أوقف التقليب وارفع الرطوبة إلى 70%" });
        if (cs.phase === "hatching")
          alerts.push({ lvl:"warn", msg:"فقس نشط — سجّل الصيصان عند كل فتحة" });
        if (cs.phase === "overdue")
          alerts.push({ lvl:"crit", msg:"تجاوزت الموعد — راجع الوضع فوراً" });
        if (!alerts.length && cs.phase === "incubation")
          alerts.push({ lvl:"warn", msg:"" }); // silent OK
        const real = alerts.filter(a => a.msg);
        if (!real.length) return (
          <div className="px-5 py-2.5 flex items-center gap-2 text-xs"
            style={{ borderBottom:`1px solid ${EDGE}`, color:"#059669" + "80" }}>
            <CheckCircle2 className="w-3.5 h-3.5" />
            جميع المؤشرات طبيعية
          </div>
        );
        return (
          <div className="px-5 py-3 space-y-1.5" style={{ borderBottom:`1px solid ${EDGE}` }}>
            {real.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-xs rounded-lg px-3 py-2"
                style={{
                  background: a.lvl==="crit" ? "#ef4444" + "0d" : "#f59e0b" + "0d",
                  border: `1px solid ${a.lvl==="crit" ? "#ef4444" : "#f59e0b"}25`,
                  color: a.lvl==="crit" ? "#fca5a5" : "#fcd34d",
                }}>
                {a.lvl==="crit"
                  ? <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  : <AlertCircle   className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                {a.msg}
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── ROW 7: Financial ── */}
      <div className="px-5 py-3" style={{ borderBottom:`1px solid ${EDGE}` }}>
        <div className="flex items-center gap-1.5 mb-2">
          <DollarSign className="w-3.5 h-3.5" style={{ color:"#374151" }} />
          <span className="text-[9px] uppercase tracking-widest" style={{ color:"#374151" }}>
            التوقعات المالية
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { l:"تكلفة البيض",    v:`${(eggCost/1000).toFixed(0)}K`,    c:"#f87171" },
            { l:"إيراد متوقع",   v:`${(expectedRev/1000).toFixed(0)}K`, c:"#34d399" },
            { l:"ربح متوقع",     v:`${(expectedProfit/1000).toFixed(0)}K`, c: expectedProfit>0?"#34d399":"#f87171" },
          ].map(s => (
            <div key={s.l} className="rounded-lg py-2" style={{ background:"#0d1219", border:`1px solid ${EDGE}` }}>
              <div className="text-base font-black font-mono" style={{ color: s.c }}>{s.v}</div>
              <div className="text-[9px] mt-0.5" style={{ color:"#374151" }}>{s.l}</div>
            </div>
          ))}
        </div>
        {cycle.notes && (
          <p className="text-[10px] mt-2 italic line-clamp-1" style={{ color:"#374151" }}>
            "{cycle.notes}"
          </p>
        )}
      </div>

      {/* ── ROW 8: Hatch Log ── */}
      <div className="px-5 pb-4 pt-3">
        <HatchLogSection cycleId={cycle.id} eggsSet={cycle.eggsSet} phase={cs.phase} />
      </div>
    </div>
  );
}

// ─── Completed / Last Cycle Card ──────────────────────────────────────────────

function LastCycleCard({ inc, cycle }: { inc: Incubator; cycle: Cycle }) {
  const hatched  = cycle.eggsHatched ?? 0;
  const rate     = cycle.eggsSet > 0 ? Math.round((hatched / cycle.eggsSet) * 100) : 0;
  const rateCol  = rate >= 70 ? "#34d399" : rate >= 50 ? "#fbbf24" : "#f87171";
  const eggCost  = cycle.eggsSet * 500;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: CARD, border:`1px solid ${EDGE}` }}
    >
      <div className="h-[2px]" style={{ background:"#475569" }} />

      {/* Header */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color:"#64748b" }}>
                {inc.name}
              </span>
              {inc.model && (
                <span className="text-[10px] font-mono" style={{ color:"#1f2937" }}>{inc.model}</span>
              )}
            </div>
            <h2 className="text-xl font-black mt-1 leading-tight" style={{ color:"#94a3b8" }}>
              {cycle.batchName}
            </h2>
            <p className="text-[10px] mt-0.5" style={{ color:"#374151" }}>آخر دورة مكتملة</p>
          </div>
          <div
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold"
            style={{ background:"#47556920", border:"1px solid #47556940", color:"#64748b" }}
          >
            <CheckCircle2 className="w-3 h-3" />
            مكتملة
          </div>
        </div>
      </div>

      {/* Dates */}
      <div
        className="grid grid-cols-2 divide-x text-center"
        style={{ borderTop:`1px solid ${EDGE}`, borderBottom:`1px solid ${EDGE}` }}
      >
        {[
          { label:"بدأت",   date: fmtDate(cycle.startDate),   sub: cycle.setTime ?? "——" },
          { label:"انتهت",  date: fmtDate(cycle.actualHatchDate ?? cycle.expectedHatchDate), sub: "تاريخ الإنتهاء" },
        ].map((d, i) => (
          <div key={i} className="px-4 py-3" style={{ borderRight: i===0 ? `1px solid ${EDGE}` : "none" }}>
            <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color:"#374151" }}>{d.label}</div>
            <div className="font-mono text-sm font-bold" style={{ color:"#64748b" }}>{d.date}</div>
            <div className="font-mono text-xs mt-0.5" style={{ color:"#374151" }}>{d.sub}</div>
          </div>
        ))}
      </div>

      {/* Results grid */}
      <div className="grid grid-cols-3" style={{ borderBottom:`1px solid ${EDGE}` }}>
        {[
          { l:"بيض وُضع",    v: fmtNum(cycle.eggsSet), c:"#94a3b8" },
          { l:"صيصان فقست", v: fmtNum(hatched),         c:"#cbd5e1" },
          { l:"نسبة الفقس", v: `${rate}%`,               c: rateCol },
        ].map((s, i) => (
          <div key={i} className="py-4 text-center"
            style={{ borderRight: i<2 ? `1px solid ${EDGE}` : "none" }}>
            <div className="text-[9px] uppercase tracking-widest mb-1.5" style={{ color:"#374151" }}>
              {s.l}
            </div>
            <div className="text-4xl font-black font-mono leading-none" style={{ color: s.c }}>
              {s.v}
            </div>
          </div>
        ))}
      </div>

      {/* Rate bar */}
      <div className="px-5 py-3" style={{ borderBottom:`1px solid ${EDGE}` }}>
        <div className="w-full rounded-full h-1.5 overflow-hidden" style={{ background:"#1a2535" }}>
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{ width:`${rate}%`, background: rateCol }}
          />
        </div>
        <div className="flex justify-between mt-1.5 text-[9px] font-mono" style={{ color:"#374151" }}>
          <span>0%</span>
          <span>تكلفة البيض: {(eggCost/1000).toFixed(0)}K د.ع</span>
          <span>100%</span>
        </div>
      </div>

      {/* Hatch log */}
      <div className="px-5 pb-4 pt-3">
        <HatchLogSection cycleId={cycle.id} eggsSet={cycle.eggsSet} phase="completed" />
      </div>
    </div>
  );
}

// ─── History Bar ──────────────────────────────────────────────────────────────

function HistoryBar({ cycles }: { cycles: Cycle[] }) {
  const done = cycles
    .filter(c => c.status === "completed" && c.eggsHatched != null)
    .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 7);

  if (done.length < 2) return null;

  const avg = Math.round(done.reduce((s,c) => s + (c.eggsHatched!/c.eggsSet), 0) / done.length * 100);

  return (
    <div className="px-5 py-4" style={{ borderTop:`1px solid ${EDGE}` }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[9px] uppercase tracking-widest" style={{ color:"#374151" }}>
          سجل الدورات
        </span>
        <span className="text-xs font-bold font-mono" style={{ color: avg>=65?"#34d399":"#fbbf24" }}>
          متوسط {avg}%
        </span>
      </div>
      <div className="space-y-1.5">
        {done.map(c => {
          const r = Math.round((c.eggsHatched!/c.eggsSet)*100);
          const col = r>=70?"#34d399":r>=50?"#fbbf24":"#f87171";
          return (
            <div key={c.id} className="flex items-center gap-3">
              <span className="w-7 text-right font-black font-mono text-xs shrink-0" style={{ color: col }}>
                {r}%
              </span>
              <div className="flex-1 rounded-full h-1" style={{ background:"#1a2535" }}>
                <div className="h-full rounded-full" style={{ width:`${r}%`, background: col }} />
              </div>
              <span className="text-[10px] truncate max-w-[100px] font-mono" style={{ color:"#374151" }}>
                {c.batchName}
              </span>
              <span className="text-[9px] font-mono shrink-0" style={{ color:"#1f2937" }}>
                {fmtDate(c.startDate)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Export ══════════════════════════════════════════════════════════════

export default function IncubationCenter() {
  const base = import.meta.env.BASE_URL ?? "/";

  // 1-second clock
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  // SSE live updates
  const sseRef  = useRef(0);
  const [liveMap, setLiveMap] = useState<Map<number, Cycle>>(new Map());
  const [conn,    setConn]    = useState<"connecting"|"sse"|"poll">("connecting");

  useEffect(() => {
    let cancelled=false, es:EventSource|null=null, pt:ReturnType<typeof setInterval>|null=null;
    const apply = (_:number, cycles:Cycle[]) => {
      if (!cancelled) setLiveMap(new Map(cycles.map(c=>[c.id,c])));
    };
    const poll = async () => {
      try { const d:Cycle[] = await apiFetch("/dashboard/active-cycles"); if(!cancelled) apply(0,d); } catch {}
    };
    const startPoll = () => { if(cancelled) return; setConn("poll"); poll(); pt=setInterval(poll,30_000); };
    const connect   = () => {
      if(cancelled) return;
      try {
        es = new EventSource(`${base}api/hatching/live-stream`,{withCredentials:true});
        es.onopen = () => { if(!cancelled){sseRef.current=0;setConn("sse");} };
        es.onmessage = ev => {
          try { const p=JSON.parse(ev.data) as {serverTime:number;cycles:Cycle[]}; apply(p.serverTime,p.cycles); if(!cancelled) setConn("sse"); } catch {}
        };
        es.onerror = () => { es?.close(); es=null; sseRef.current++; if(sseRef.current>=3) startPoll(); else if(!cancelled) setTimeout(connect,5_000); };
      } catch { startPoll(); }
    };
    connect();
    return () => { cancelled=true; es?.close(); if(pt) clearInterval(pt); };
  }, [base]);

  const { data: incubators=[], isLoading } = useQuery<Incubator[]>({
    queryKey:["incubators"],
    queryFn: ()=>apiFetch("/incubators"),
    refetchInterval:60_000,
  });

  const { data: allCycles=[] } = useQuery<Cycle[]>({
    queryKey:["all-cycles"],
    queryFn: ()=>apiFetch("/hatching-cycles"),
    refetchInterval:120_000,
  });

  // Build machine → cycle mapping
  const machines = useMemo(() => {
    return incubators.map(inc => {
      // SSE live → activeCycle → last completed cycle
      let active: Cycle|null = null;
      for (const [,c] of liveMap) {
        if (c.incubatorId === inc.id) { active=c; break; }
      }
      if (!active && inc.activeCycle) active = inc.activeCycle;

      const isRunning = active && (active.status==="incubating"||active.status==="hatching");

      if (isRunning) return { inc, cycle:active!, mode:"active" as const };

      const last = allCycles
        .filter(c=>c.incubatorId===inc.id)
        .sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())[0] ?? null;

      return { inc, cycle:last, mode:"last" as const };
    });
  }, [incubators, liveMap, allCycles]);

  const activeCount = machines.filter(m=>m.mode==="active").length;
  const totalEggs   = machines.filter(m=>m.mode==="active"&&m.cycle).reduce((s,m)=>s+m.cycle!.eggsSet,0);
  const completed   = allCycles.filter(c=>c.status==="completed"&&c.eggsHatched!=null);
  const histRate    = completed.length > 0
    ? Math.round(completed.reduce((s,c)=>s+(c.eggsHatched!/c.eggsSet),0)/completed.length*100)
    : 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="rounded-2xl animate-pulse" style={{ background:CARD, border:`1px solid ${EDGE}` }}>
        <div className="h-12" style={{ background:"#0a0d12", borderBottom:`1px solid ${EDGE}` }} />
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-96 rounded-xl" style={{ background: BG }} />
          <div className="h-96 rounded-xl" style={{ background: BG }} />
        </div>
      </div>
    );
  }

  if (incubators.length === 0) {
    return (
      <div className="rounded-2xl py-16 text-center" style={{ background:CARD, border:`1px solid ${EDGE}` }}>
        <Egg className="w-10 h-10 mx-auto mb-3" style={{ color:"#1f2937" }} />
        <p className="text-sm" style={{ color:"#374151" }}>لا توجد فقاسات مسجلة</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background:BG, border:`1px solid ${EDGE}` }}>

      {/* ── Top bar ── */}
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ background:CARD, borderBottom:`1px solid ${EDGE}` }}
      >
        <div className="flex items-center gap-3">
          <div className="relative w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background:"#1e40af15", border:"1px solid #1e40af30" }}>
            <Egg className="w-4 h-4" style={{ color:"#3b82f6" }} />
            {conn==="sse" && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border-2 bg-emerald-400 animate-pulse"
                style={{ borderColor:CARD }} />
            )}
          </div>
          <div>
            <div className="text-sm font-bold text-white">مركز التفقيس</div>
            <div className="flex items-center gap-1.5 text-[10px] mt-0.5">
              {conn==="sse"         && <><Wifi      className="w-3 h-3" style={{color:"#34d399"}}/><span style={{color:"#34d399"}}>LIVE</span></>}
              {conn==="poll"        && <><RefreshCw className="w-3 h-3" style={{color:"#fbbf24"}}/><span style={{color:"#fbbf24"}}>POLL</span></>}
              {conn==="connecting"  && <><WifiOff   className="w-3 h-3 animate-pulse" style={{color:"#374151"}}/><span style={{color:"#374151"}}>…</span></>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {activeCount > 0 && (
            <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold px-2.5 py-1 rounded"
              style={{ background:"#1e40af15", border:"1px solid #1e40af30", color:"#93c5fd" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              {activeCount} نشطة
            </span>
          )}
          {totalEggs > 0 && (
            <span className="text-[10px] font-mono px-2.5 py-1 rounded"
              style={{ background:"#ffffff08", border:`1px solid ${EDGE}`, color: DIM }}>
              {fmtNum(totalEggs)} بيضة
            </span>
          )}
          {histRate > 0 && (
            <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded"
              style={{
                background: histRate>=65 ? "#05966915" : "#d9770615",
                border: `1px solid ${histRate>=65?"#05966940":"#d9770640"}`,
                color:   histRate>=65 ? "#34d399"  : "#fbbf24",
              }}>
              {histRate}% avg
            </span>
          )}
        </div>
      </div>

      {/* ── Machine grid ── */}
      <div className="p-4">
        <div className={`grid gap-5 ${machines.length === 1 ? "max-w-xl mx-auto" : "grid-cols-1 lg:grid-cols-2"}`}>
          {machines.map(({ inc, cycle, mode }) => {
            if (mode==="active" && cycle)
              return <ActiveCard key={inc.id} inc={inc} cycle={cycle} nowMs={nowMs} />;
            if (cycle)
              return <LastCycleCard key={inc.id} inc={inc} cycle={cycle} />;
            return (
              <div key={inc.id} className="rounded-2xl flex flex-col items-center justify-center py-14"
                style={{ background:CARD, border:`1px solid ${EDGE}` }}>
                <Egg className="w-8 h-8 mb-3" style={{ color:"#1f2937" }} />
                <div className="text-sm font-bold" style={{ color:"#374151" }}>{inc.name}</div>
                <div className="text-xs mt-1" style={{ color:"#1f2937" }}>لا توجد دورات</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── History ── */}
      <HistoryBar cycles={allCycles} />
    </div>
  );
}
