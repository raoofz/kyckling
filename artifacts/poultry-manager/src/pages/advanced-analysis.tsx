import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldAlert, Loader2, TrendingUp,
  Brain, Layers, ChevronRight,
  RefreshCw, AlertTriangle, CheckCircle2,
  Clock, Zap, Activity,
  Lightbulb, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

type Module = "predict" | "decision" | null;

interface ActionStep {
  priority: number; action: string; timeframe: string;
  expectedOutcome: string; urgency: "immediate" | "today" | "this_week" | "monitor";
}
interface Scenario { label: string; probability: number; outcome: string; hatchRate?: number; }
interface AdvancedOutput {
  analysisType: string;
  observations: string[];
  rootCause: { primary: string; mechanism: string; contributingFactors: { factor: string; weight: number; evidence: string }[] };
  riskLevel: { level: "critical" | "high" | "medium" | "low"; score: number; rationale: string };
  impact: { immediate: string; shortTerm: string; longTerm: string; quantifiedLoss: string };
  actionPlan: ActionStep[];
  prediction: { outcome: string; probability: number; timeHorizon: string; confidence: number; scenarios: Scenario[] };
  confidenceScore: number;
  dataQuality: { score: number; sampleSize: number; completeness: number };
}
interface DecisionResult {
  overallScore: number; overallRisk: "critical" | "high" | "medium" | "low";
  summaryStatement: string; predictive: AdvancedOutput;
  topThreeActions: ActionStep[];
  confidenceScore: number; analysisType: string; timestamp: string;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const RISK_COLOR = {
  critical: { bg: "bg-red-50",    border: "border-red-200",    text: "text-red-700",    dot: "bg-red-500",    badge: "bg-red-500 text-white"    },
  high:     { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", dot: "bg-orange-500", badge: "bg-orange-500 text-white" },
  medium:   { bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-700",  dot: "bg-amber-500",  badge: "bg-amber-500 text-white"  },
  low:      { bg: "bg-emerald-50",border: "border-emerald-200",text: "text-emerald-700",dot: "bg-emerald-500",badge: "bg-emerald-500 text-white" },
};

const URGENCY_COLOR = {
  immediate: "text-red-600 bg-red-50 border-red-200",
  today: "text-orange-600 bg-orange-50 border-orange-200",
  this_week: "text-amber-600 bg-amber-50 border-amber-200",
  monitor: "text-blue-600 bg-blue-50 border-blue-200",
};

// ─────────────────────────────────────────────
// SUBCOMPONENTS
// ─────────────────────────────────────────────

function SectionHeader({ icon, label, color = "violet" }: { icon: React.ReactNode; label: string; color?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className={cn("w-1.5 h-4 rounded-full", `bg-${color}-500`)} />
      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        {icon}{label}
      </span>
    </div>
  );
}

function ConfidenceBadge({ score }: { score: number }) {
  const { t } = useLanguage();
  const color = score >= 70 ? "emerald" : score >= 50 ? "amber" : "red";
  return (
    <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", `bg-${color}-100 text-${color}-700`)}>
      {t("adv.confidence.prefix")} {score}%
    </span>
  );
}

function ActionPlanList({ steps }: { steps: ActionStep[] }) {
  const { t } = useLanguage();
  const urgencyLabel = (u: string) => {
    const key = `adv.urgency.${u}`;
    return t(key) !== key ? t(key) : "—";
  };
  return (
    <div className="space-y-2">
      {steps.map((s, i) => (
        <div key={i} className={cn("rounded-xl border p-3.5 text-right", URGENCY_COLOR[s.urgency])}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-white/60">{urgencyLabel(s.urgency)}</span>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-black/10 text-[11px] font-black flex items-center justify-center shrink-0">{s.priority}</span>
              <span className="font-bold text-sm text-foreground">{s.action}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{s.timeframe}</span>
            <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="w-3 h-3" />{s.expectedOutcome}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ScenarioBar({ scenarios }: { scenarios: Scenario[] }) {
  const colors = ["bg-emerald-500", "bg-blue-500", "bg-amber-500", "bg-red-500"];
  return (
    <div className="space-y-2.5">
      {scenarios.map((s, i) => (
        <div key={i} className="text-right">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-black text-foreground">{s.probability}%</span>
            <span className="text-sm font-semibold">{s.label}</span>
          </div>
          <div className="h-3 rounded-full bg-muted/30 overflow-hidden mb-0.5">
            <div className={cn("h-full rounded-full transition-all duration-1000", colors[i % 4])}
              style={{ width: `${s.probability}%` }} />
          </div>
          <span className="text-xs text-muted-foreground">{s.outcome}</span>
        </div>
      ))}
    </div>
  );
}

function RiskGauge({ score, level }: { score: number; level: string }) {
  const { t } = useLanguage();
  const r = RISK_COLOR[level as keyof typeof RISK_COLOR] ?? RISK_COLOR.low;
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (score / 100) * circumference;
  const riskLabel = (l: string) => {
    const key = `adv.risk.${l}`;
    return t(key) !== key ? t(key) : "—";
  };
  return (
    <div className={cn("rounded-2xl border p-4 flex items-center gap-4", r.bg, r.border)}>
      <svg width="90" height="90" className="-rotate-90 shrink-0">
        <circle cx="45" cy="45" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/20" />
        <circle cx="45" cy="45" r="40" fill="none" strokeWidth="8" strokeLinecap="round"
          className={cn("transition-all duration-1000", r.dot.replace("bg-", "stroke-"))}
          strokeDasharray={circumference} strokeDashoffset={offset} />
      </svg>
      <div className="flex-1 text-right">
        <div className={cn("text-3xl font-black tabular-nums", r.text)}>{score}</div>
        <div className="text-xs text-muted-foreground">{t("adv.score.of100")}</div>
        <div className={cn("text-xs font-bold mt-1 px-2 py-0.5 rounded-full inline-block", r.badge)}>
          {riskLabel(level)}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PREDICTIVE OUTPUT VIEWER — farmer-friendly
// ─────────────────────────────────────────────

function PredictiveView({ result }: { result: AdvancedOutput }) {
  const { t } = useLanguage();
  return (
    <div className="space-y-5">
      {/* Confidence */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-muted-foreground">{result.analysisType}</p>
        <ConfidenceBadge score={result.confidenceScore} />
      </div>

      {/* 1. What we see now */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 space-y-2 text-right">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="w-4 h-4 text-blue-600" />
          <span className="font-bold text-sm text-blue-800">{t("adv.section.observations")}</span>
        </div>
        {result.observations.map((o, i) => (
          <div key={i} className="flex items-start gap-2 text-sm text-blue-900">
            <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 shrink-0" />
            <span>{o}</span>
          </div>
        ))}
      </div>

      {/* 2. Risk level */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <span className="font-bold text-sm">{t("adv.section.riskLevel")}</span>
        </div>
        <RiskGauge score={result.riskLevel.score} level={result.riskLevel.level} />
        <p className="text-sm text-muted-foreground mt-2 text-right leading-6">{result.riskLevel.rationale}</p>
      </div>

      {/* 3. What will happen */}
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 space-y-3 text-right">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="w-4 h-4 text-indigo-600" />
          <span className="font-bold text-sm text-indigo-800">{t("adv.section.prediction")}</span>
        </div>
        <p className="font-bold text-base text-indigo-900 leading-6">{result.prediction.outcome}</p>
        <div className="flex items-center gap-3 text-sm">
          <span className="bg-indigo-200 text-indigo-800 px-2 py-0.5 rounded-lg font-bold">
            {t("adv.prediction.prob")} {result.prediction.probability}%
          </span>
          <span className="text-muted-foreground">{result.prediction.timeHorizon}</span>
        </div>
        {result.prediction.scenarios?.length > 0 && (
          <div className="pt-2 border-t border-indigo-200">
            <div className="text-xs font-bold text-indigo-600 mb-2">{t("adv.prediction.scenarios")}</div>
            <ScenarioBar scenarios={result.prediction.scenarios} />
          </div>
        )}
      </div>

      {/* 4. What to do */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb className="w-4 h-4 text-emerald-600" />
          <span className="font-bold text-sm">{t("adv.section.whatNow")}</span>
        </div>
        <ActionPlanList steps={result.actionPlan} />
      </div>

      {/* 5. Impact */}
      <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 space-y-2 text-right">
        <div className="flex items-center gap-2 mb-1">
          <AlertCircle className="w-4 h-4 text-orange-600" />
          <span className="font-bold text-sm text-orange-800">{t("adv.section.noAction")}</span>
        </div>
        {[
          [t("adv.impact.now"),      result.impact.immediate],
          [t("adv.impact.week"),     result.impact.shortTerm],
          [t("adv.impact.longterm"), result.impact.longTerm],
        ].map(([k, v], i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            <span className="font-bold text-orange-700 shrink-0 w-24 text-[12px]">{k}:</span>
            <span className="text-orange-900">{v}</span>
          </div>
        ))}
        {result.impact.quantifiedLoss && (
          <div className="mt-2 pt-2 border-t border-orange-200 text-sm font-bold text-orange-800">
            {t("adv.impact.loss")} {result.impact.quantifiedLoss}
          </div>
        )}
      </div>

      {/* 6. Root cause */}
      <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-right space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <Brain className="w-4 h-4 text-violet-600" />
          <span className="font-bold text-sm text-violet-800">{t("adv.section.rootCause")}</span>
        </div>
        <p className="font-bold text-sm text-violet-900">{result.rootCause.primary}</p>
        <p className="text-sm text-muted-foreground leading-6">{result.rootCause.mechanism}</p>
        {result.rootCause.contributingFactors?.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {result.rootCause.contributingFactors.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-violet-200 overflow-hidden">
                  <div className="h-full rounded-full bg-violet-500 transition-all duration-700" style={{ width: `${f.weight}%` }} />
                </div>
                <span className="text-xs font-bold text-violet-600 w-10 text-left">{f.weight}%</span>
                <span className="text-xs text-foreground min-w-[100px] text-right">{f.factor}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 7. Data quality note */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-right text-xs text-muted-foreground">
        <span className="font-bold">{t("adv.section.dataQuality")} {result.confidenceScore}%</span>
        {" "} — {t("adv.section.builtOn")} {result.dataQuality.sampleSize} {t("adv.section.cycles")} {result.dataQuality.completeness}%
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// DECISION ENGINE VIEW — simple summary
// ─────────────────────────────────────────────

function DecisionView({ result }: { result: DecisionResult }) {
  const { t } = useLanguage();
  const rc = RISK_COLOR[result.overallRisk];
  const riskLabel = (l: string) => {
    const key = `adv.risk.${l}`;
    return t(key) !== key ? t(key) : "—";
  };
  return (
    <div className="space-y-5">
      {/* Overall */}
      <div className={cn("rounded-2xl border p-5 text-right", rc.bg, rc.border)}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex flex-col items-end gap-1">
            <div className={cn("text-4xl font-black", rc.text)}>{result.overallScore}</div>
            <div className="text-xs text-muted-foreground">{t("adv.score.of100")}</div>
            <span className={cn("text-xs font-bold px-2.5 py-0.5 rounded-full", rc.badge)}>{riskLabel(result.overallRisk)}</span>
          </div>
          <div className="flex-1">
            <p className="text-base font-bold leading-7 text-right">{result.summaryStatement}</p>
            <div className="flex items-center justify-end gap-2 mt-2">
              <ConfidenceBadge score={result.confidenceScore} />
              <span className="text-[10px] text-muted-foreground">{new Date(result.timestamp).toLocaleString("ar-SA")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top 3 Actions */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-emerald-600" />
          <span className="font-bold text-sm">{t("adv.section.top3")}</span>
        </div>
        <ActionPlanList steps={result.topThreeActions} />
      </div>

      {/* Predictive summary */}
      {result.predictive && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-right space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-indigo-600" />
            <span className="font-bold text-sm text-indigo-800">{t("adv.section.soonHappen")}</span>
          </div>
          <p className="font-bold text-sm text-indigo-900">{result.predictive.prediction.outcome}</p>
          <div className="text-xs text-muted-foreground">{result.predictive.prediction.timeHorizon}</div>
          {result.predictive.prediction.scenarios?.slice(0, 2).map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
              <span className="font-semibold text-indigo-800">{s.probability}%</span>
              <span className="text-indigo-700">{s.label} — {s.outcome}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────

export default function AdvancedAnalysis() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const { t, lang } = useLanguage();

  const [module, setModule] = useState<Module>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AdvancedOutput | DecisionResult | null>(null);

  const MODULES = [
    {
      id: "predict" as Module,
      icon: <TrendingUp className="w-6 h-6 text-white" />,
      gradient: "from-indigo-500 to-violet-600",
      border: "border-indigo-200",
      bg: "from-indigo-50 to-violet-50",
      hover: "hover:border-indigo-400 hover:shadow-indigo-500/10",
      label: t("adv.mod.predict.label"),
      desc: t("adv.mod.predict.desc"),
      tags: [t("adv.mod.predict.tag1"), t("adv.mod.predict.tag2"), t("adv.mod.predict.tag3"), t("adv.mod.predict.tag4")],
      tagColor: "bg-indigo-100 text-indigo-700",
    },
    {
      id: "decision" as Module,
      icon: <Layers className="w-6 h-6 text-white" />,
      gradient: "from-amber-500 to-orange-600",
      border: "border-amber-200",
      bg: "from-amber-50 to-orange-50",
      hover: "hover:border-amber-400 hover:shadow-amber-500/10",
      label: t("adv.mod.decision.label"),
      desc: t("adv.mod.decision.desc"),
      tags: [t("adv.mod.decision.tag1"), t("adv.mod.decision.tag2"), t("adv.mod.decision.tag3"), t("adv.mod.decision.tag4")],
      tagColor: "bg-amber-100 text-amber-700",
    },
  ];

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <ShieldAlert className="w-16 h-16 text-muted-foreground/40" />
        <h2 className="text-xl font-bold">{t("adv.adminOnly")}</h2>
      </div>
    );
  }

  const runModule = async (mod: NonNullable<Module>) => {
    setModule(mod);
    setResult(null);
    setLoading(true);
    const endpointMap: Record<NonNullable<Module>, string> = {
      predict: "/api/ai/predict",
      decision: "/api/ai/decision",
    };
    try {
      const res = await fetch(endpointMap[mod], {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? t("adv.error.analysis"));
      const data = await res.json();
      setResult(data.result);
    } catch (e: any) {
      toast({ title: t("adv.error"), description: e.message, variant: "destructive" });
      setModule(null);
    } finally { setLoading(false); }
  };

  const reset = () => { setModule(null); setResult(null); };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] md:h-[calc(100vh-5rem)]">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">{t("adv.title")}</h1>
            <p className="text-xs text-muted-foreground">{t("adv.subtitle")}</p>
          </div>
        </div>
        {(module || result) && !loading && (
          <Button onClick={reset} variant="ghost" size="sm" className="gap-1.5 text-xs h-8 text-muted-foreground">
            <ChevronRight className="w-3.5 h-3.5" />{t("adv.back")}
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pb-4">

        {/* MODULE SELECTOR */}
        {!module && !loading && (
          <div className="space-y-6">
            <div className="text-center space-y-2 py-4">
              <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-indigo-500/15 via-violet-500/15 to-purple-500/15 border border-violet-200 flex items-center justify-center">
                <Brain className="w-10 h-10 text-violet-500" />
              </div>
              <h2 className="text-lg font-bold">{t("adv.pick.title")}</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                {t("adv.pick.desc")}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {MODULES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => runModule(m.id!)}
                  className={cn(
                    "group text-right rounded-2xl border-2 p-5 transition-all duration-200 hover:shadow-lg",
                    `bg-gradient-to-br ${m.bg}`, m.border, m.hover
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("w-12 h-12 rounded-2xl bg-gradient-to-br flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-105 transition-transform", m.gradient)}>
                      {m.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-base mb-1">{m.label}</p>
                      <p className="text-sm text-muted-foreground leading-6">{m.desc}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {m.tags.map(tag => (
                      <span key={tag} className={cn("text-xs px-2.5 py-1 rounded-full font-semibold", m.tagColor)}>{tag}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* LOADING */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 space-y-5">
            <div className="w-24 h-24 rounded-3xl bg-violet-500/15 flex items-center justify-center animate-pulse">
              <Loader2 className="w-10 h-10 text-violet-500 animate-spin" />
            </div>
            <p className="font-bold text-lg">{t("adv.loading.title")}</p>
            <p className="text-sm text-violet-500 animate-pulse">{t("adv.loading.sub")}</p>
          </div>
        )}

        {/* PREDICTIVE RESULT */}
        {result && module === "predict" && !loading && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Button onClick={() => runModule("predict")} variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                <RefreshCw className="w-3.5 h-3.5" />{t("adv.refresh")}
              </Button>
              <h2 className="font-bold text-right">{t("adv.predict.result.title")}</h2>
            </div>
            <PredictiveView result={result as AdvancedOutput} />
          </div>
        )}

        {/* DECISION ENGINE RESULT */}
        {result && module === "decision" && !loading && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Button onClick={() => runModule("decision")} variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                <RefreshCw className="w-3.5 h-3.5" />{t("adv.refresh")}
              </Button>
              <h2 className="font-bold text-right">{t("adv.decision.result.title")}</h2>
            </div>
            <DecisionView result={result as DecisionResult} />
          </div>
        )}

      </div>
    </div>
  );
}
