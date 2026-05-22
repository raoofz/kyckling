/**
 * Farm Photo Monitoring Hub
 * Shows all farm photos, AI-extracted alerts, trends, and insights
 */
import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Camera, AlertTriangle, CheckCircle, Brain,
  Loader2, RefreshCw, X, ZoomIn, Tag, Clock, Filter, ChevronDown, ChevronUp
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { apiPath } from "@/lib/api";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

// ─── Types ────────────────────────────────────────────────────────────────────
interface NoteImage {
  id: number;
  date: string;
  imageUrl: string;
  originalName: string;
  category: string;
  caption: string | null;
  authorName: string | null;
  aiAnalysis: string | null;
  aiTags: string[] | null;
  aiAlerts: { level: string; message: string }[] | null;
  aiConfidence: number | null;
  analysisStatus: string;
  createdAt: string;
}

const IMAGE_CAT_KEYS = ["all","general","health","production","feeding","incubator","flock","maintenance"] as const;

// ─── API helpers ──────────────────────────────────────────────────────────────
async function fetchImages(): Promise<NoteImage[]> {
  const r = await fetch(apiPath("/notes/images"), { credentials: "include" });
  if (!r.ok) throw new Error("fetch_error");
  return r.json();
}
async function deleteImage(id: number) {
  const r = await fetch(`/api/notes/images/${id}`, { method: "DELETE", credentials: "include" });
  if (!r.ok) throw new Error("delete_error");
}
async function reanalyzeImage(id: number) {
  const r = await fetch(`/api/notes/images/${id}/analyze`, { method: "POST", credentials: "include" });
  if (!r.ok) throw new Error("analyze_error");
  return r.json();
}
async function uploadFarmPhoto(file: File, date: string, category: string, errUrlMsg: string, errFileMsg: string, errSaveMsg: string): Promise<{ id: number }> {
  const urlRes = await fetch(apiPath("/notes/images/upload-url"), {
    method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
    body: JSON.stringify({ contentType: file.type, name: file.name }),
  });
  if (!urlRes.ok) { const e = await urlRes.json().catch(() => ({})); throw new Error(e.error ?? errUrlMsg); }
  const { uploadURL, objectPath } = await urlRes.json();
  const uploadRes = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  if (!uploadRes.ok) throw new Error(errFileMsg);
  const saveRes = await fetch(apiPath("/notes/images/save"), {
    method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
    body: JSON.stringify({ objectPath, originalName: file.name, mimeType: file.type, date, category, caption: "" }),
  });
  if (!saveRes.ok) { const e = await saveRes.json().catch(() => ({})); throw new Error(e.error ?? errSaveMsg); }
  return saveRes.json();
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const { t } = useLanguage();
  if (status === "done")      return <Badge className="bg-green-100 text-green-700 text-xs gap-1"><CheckCircle className="w-3 h-3"/>{t("ai.status.done")}</Badge>;
  if (status === "analyzing") return <Badge className="bg-blue-100 text-blue-700 text-xs gap-1 animate-pulse"><Loader2 className="w-3 h-3 animate-spin"/>{t("ai.status.analyzing")}</Badge>;
  if (status === "failed")    return <Badge className="bg-red-100 text-red-700 text-xs gap-1"><AlertTriangle className="w-3 h-3"/>{t("ai.status.failed")}</Badge>;
  return <Badge className="bg-slate-100 text-slate-600 text-xs gap-1"><Clock className="w-3 h-3"/>{t("ai.status.waiting")}</Badge>;
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <Card className="p-4">
      <div className={cn("text-3xl font-bold", color ?? "text-slate-800")}>{value}</div>
      <div className="text-sm font-medium text-slate-600 mt-1">{label}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </Card>
  );
}

function ImageCard({ img, isAdmin, onDelete, onReanalyze }: {
  img: NoteImage; isAdmin: boolean;
  onDelete: (id: number) => void; onReanalyze: (id: number) => void;
}) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const imageFileUrl = `/api/notes/images/file/${img.imageUrl.replace(/^\/objects\//, "")}`;
  const criticalAlerts = (img.aiAlerts ?? []).filter(a => a.level === "critical");
  const warningAlerts = (img.aiAlerts ?? []).filter(a => a.level === "warning");

  const catLabel = (cat: string) => {
    const key = `imgcat.${cat}`;
    return t(key) !== key ? t(key) : cat;
  };

  return (
    <>
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={() => setLightbox(false)}>
          <button className="absolute top-4 right-4 text-white"><X className="w-8 h-8" /></button>
          <img src={imageFileUrl} alt={img.originalName} className="max-h-[90vh] max-w-[90vw] object-contain rounded-xl" />
        </div>
      )}
      <Card className={cn("overflow-hidden transition-shadow hover:shadow-md", criticalAlerts.length > 0 ? "border-red-300 ring-1 ring-red-200" : "")}>
        <div className="relative aspect-video bg-slate-100 cursor-pointer group" onClick={() => setLightbox(true)}>
          <img src={imageFileUrl} alt={img.originalName} className="w-full h-full object-cover"
            onError={e => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }} />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-colors">
            <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="absolute top-2 right-2"><StatusBadge status={img.analysisStatus} /></div>
          {criticalAlerts.length > 0 && (
            <div className="absolute bottom-2 left-2 bg-red-600 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
              <AlertTriangle className="w-3 h-3" />{t("ai.critical.badge")}
            </div>
          )}
        </div>
        <CardContent className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{img.originalName ?? t("ai.photo.unnamed")}</p>
              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                <span className="text-xs text-slate-400">{img.date}</span>
                {img.category && <Badge variant="secondary" className="text-xs">{catLabel(img.category)}</Badge>}
                {img.authorName && <span className="text-xs text-slate-400">{img.authorName}</span>}
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              {img.analysisStatus === "failed" && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onReanalyze(img.id)} title={t("ai.reanalyze.title")}>
                  <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                </Button>
              )}
              {isAdmin && (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => onDelete(img.id)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>

          {img.caption && <p className="text-xs text-slate-600 bg-slate-50 rounded px-2 py-1">{img.caption}</p>}

          {criticalAlerts.length > 0 && (
            <div className="space-y-1">
              {criticalAlerts.map((a, i) => (
                <div key={i} className="text-xs flex items-start gap-1.5 bg-red-50 text-red-700 px-2 py-1.5 rounded-lg">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{a.message}
                </div>
              ))}
            </div>
          )}
          {warningAlerts.length > 0 && !criticalAlerts.length && (
            <div className="space-y-1">
              {warningAlerts.map((a, i) => (
                <div key={i} className="text-xs flex items-start gap-1.5 bg-amber-50 text-amber-700 px-2 py-1.5 rounded-lg">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{a.message}
                </div>
              ))}
            </div>
          )}

          {(img.aiTags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {(img.aiTags ?? []).map((tag, i) => (
                <span key={i} className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full">{tag}</span>
              ))}
            </div>
          )}

          {img.aiConfidence != null && img.analysisStatus === "done" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{t("ai.confidence.label")}</span>
              <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                <div className={cn("h-full rounded-full", img.aiConfidence >= 80 ? "bg-green-500" : img.aiConfidence >= 60 ? "bg-amber-500" : "bg-red-500")}
                  style={{ width: `${img.aiConfidence}%` }} />
              </div>
              <span className="text-xs text-slate-500">{img.aiConfidence}%</span>
            </div>
          )}

          {img.aiAnalysis && img.analysisStatus === "done" && (
            <div>
              <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800">
                <Brain className="w-3.5 h-3.5" />
                {expanded ? t("ai.analysis.hide") : t("ai.analysis.show")}
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {expanded && (
                <div className="mt-2 text-xs text-slate-700 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl px-3 py-2.5 leading-relaxed whitespace-pre-wrap">
                  {img.aiAnalysis}
                </div>
              )}
            </div>
          )}

          {img.analysisStatus === "analyzing" && (
            <div className="flex items-center gap-2 text-xs text-blue-600">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />{t("ai.analysis.loading")}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function QuickUpload({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState("general");
  const inputRef = useRef<HTMLInputElement>(null);
  const today = new Date().toISOString().split("T")[0];

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    const file = files[0];
    if (!["image/jpeg","image/png","image/webp","image/heic","image/gif"].includes(file.type)) {
      toast({ title: t("ai.upload.unsupported.title"), description: t("ai.upload.unsupported.desc"), variant: "destructive" }); return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: t("ai.upload.tooBig.title"), description: t("ai.upload.tooBig.desc"), variant: "destructive" }); return;
    }
    setUploading(true);
    try {
      await uploadFarmPhoto(file, today, category, t("ai.upload.err.url"), t("ai.upload.err.file"), t("ai.upload.err.save"));
      toast({ title: t("ai.upload.success.title"), description: t("ai.upload.success.desc") });
      onDone();
    } catch (err: any) {
      toast({ title: t("ai.upload.fail.title"), description: err.message, variant: "destructive" });
    } finally { setUploading(false); }
  }, [today, category, toast, onDone, t]);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input ref={inputRef} type="file" className="hidden" accept="image/*" onChange={e => handleFiles(e.target.files)} />
      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger className="h-9 w-36 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {IMAGE_CAT_KEYS.filter(k => k !== "all").map(k => (
            <SelectItem key={k} value={k}>{t(`imgcat.${k}`)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={() => inputRef.current?.click()} disabled={uploading} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
        {uploading ? t("ai.upload.uploading") : t("ai.upload.btn")}
      </Button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AiAnalysis() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const { t, dir } = useLanguage();
  const qc = useQueryClient();
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [deleteImageId, setDeleteImageId] = useState<number | null>(null);

  const { data: images = [], isLoading } = useQuery({
    queryKey: ["noteImages"],
    queryFn: fetchImages,
    refetchInterval: 10_000,
  });

  const delImage = useMutation({
    mutationFn: deleteImage,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["noteImages"] }); toast({ title: t("ai.delete.success") }); setDeleteImageId(null); },
    onError: () => toast({ title: t("ai.delete.fail"), variant: "destructive" }),
  });
  const reanalyze = useMutation({
    mutationFn: reanalyzeImage,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["noteImages"] }); toast({ title: t("ai.reanalyze.success") }); },
    onError: () => toast({ title: t("ai.reanalyze.fail"), variant: "destructive" }),
  });

  const totalImages = images.length;
  const analyzedImages = images.filter((img: NoteImage) => img.analysisStatus === "done").length;
  const pendingImages = images.filter((img: NoteImage) => ["pending","analyzing"].includes(img.analysisStatus)).length;
  const allAlerts = images.flatMap((img: NoteImage) => img.aiAlerts ?? []);
  const criticalCount = allAlerts.filter((a: any) => a.level === "critical").length;
  const warningCount = allAlerts.filter((a: any) => a.level === "warning").length;
  const avgConfidence = analyzedImages > 0
    ? Math.round(images.filter((i: NoteImage) => i.aiConfidence != null).reduce((s: number, i: NoteImage) => s + (i.aiConfidence ?? 0), 0) / Math.max(1, analyzedImages))
    : 0;

  const tagFreq: Record<string, number> = {};
  images.forEach((img: NoteImage) => { (img.aiTags ?? []).forEach((tg: string) => { tagFreq[tg] = (tagFreq[tg] ?? 0) + 1; }); });
  const topTags = Object.entries(tagFreq).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const recentCritical = images
    .filter((img: NoteImage) => (img.aiAlerts ?? []).some((a: any) => a.level === "critical"))
    .sort((a: NoteImage, b: NoteImage) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);

  const filtered = images.filter((img: NoteImage) => {
    if (filterCategory !== "all" && img.category !== filterCategory) return false;
    if (filterStatus === "alerts" && (img.aiAlerts ?? []).length === 0) return false;
    if (filterStatus === "done" && img.analysisStatus !== "done") return false;
    if (filterStatus === "pending" && !["pending","analyzing"].includes(img.analysisStatus)) return false;
    return true;
  });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto" dir={dir}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Camera className="w-7 h-7 text-indigo-600" />{t("ai.monitoring.title")}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">{t("ai.monitoring.desc")}</p>
        </div>
        <QuickUpload onDone={() => qc.invalidateQueries({ queryKey: ["noteImages"] })} />
      </div>

      {/* Critical banner */}
      {criticalCount > 0 && (
        <Card className="border-red-300 bg-gradient-to-r from-red-50 to-orange-50">
          <CardContent className="py-4 px-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-red-800">{criticalCount} {t("ai.critical.banner")}</p>
                <div className="mt-2 space-y-1">
                  {recentCritical.map((img: NoteImage) =>
                    (img.aiAlerts ?? []).filter((a: any) => a.level === "critical").map((a: any, i: number) => (
                      <div key={`${img.id}-${i}`} className="text-sm text-red-700 flex items-start gap-1.5">
                        <span className="text-red-400">•</span>
                        <span>{a.message} <span className="text-red-400 text-xs">({img.date})</span></span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label={t("ai.stat.total.photos")} value={totalImages} color="text-indigo-600" />
        <StatCard label={t("ai.stat.analyzed")} value={analyzedImages} sub={avgConfidence > 0 ? `${t("ai.stat.avgConf")} ${avgConfidence}%` : undefined} color="text-green-600" />
        <StatCard label={t("ai.stat.critical.alerts")} value={criticalCount} sub={warningCount > 0 ? `+ ${warningCount} ${t("ai.stat.warning.label")}` : undefined} color={criticalCount > 0 ? "text-red-600" : "text-slate-400"} />
        <StatCard label={t("ai.stat.pending")} value={pendingImages} color={pendingImages > 0 ? "text-amber-600" : "text-slate-400"} />
      </div>

      {/* Hot topics */}
      {topTags.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-slate-600"><Tag className="w-4 h-4" />{t("ai.hot.title")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {topTags.map(([tag, count]) => (
              <span key={tag} className="text-sm bg-indigo-50 text-indigo-700 border border-indigo-100 px-3 py-1 rounded-full">
                {tag} <span className="text-xs text-indigo-400">({count})</span>
              </span>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-slate-400" />
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {IMAGE_CAT_KEYS.map(k => <SelectItem key={k} value={k}>{t(`imgcat.${k}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder={t("ai.filter.status")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("ai.filter.all")}</SelectItem>
            <SelectItem value="alerts">{t("ai.filter.alerts")}</SelectItem>
            <SelectItem value="done">{t("ai.filter.done")}</SelectItem>
            <SelectItem value="pending">{t("ai.filter.pending")}</SelectItem>
          </SelectContent>
        </Select>
        {(filterCategory !== "all" || filterStatus !== "all") && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFilterCategory("all"); setFilterStatus("all"); }}>
            <X className="w-3 h-3 mr-1" />{t("ai.filter.clear")}
          </Button>
        )}
        <span className="text-xs text-slate-400 mr-auto">{filtered.length} {t("ai.filter.unit")}</span>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <div key={i} className="rounded-xl bg-slate-100 animate-pulse h-64" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="py-20 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
              <Camera className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-slate-500 font-medium">{images.length === 0 ? t("ai.empty.noPhotos") : t("ai.empty.noMatch")}</p>
            {images.length === 0 && (
              <>
                <p className="text-slate-400 text-sm">{t("ai.empty.hint1")}</p>
                <p className="text-slate-400 text-xs">{t("ai.empty.hint2")}</p>
              </>
            )}
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((img: NoteImage) => (
            <ImageCard
              key={img.id} img={img} isAdmin={isAdmin}
              onDelete={setDeleteImageId}
              onReanalyze={id => reanalyze.mutate(id)}
            />
          ))}
        </div>
      )}

      <AlertDialog open={deleteImageId !== null} onOpenChange={open => !open && setDeleteImageId(null)}>
        <AlertDialogContent dir={dir}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("ai.delete.dialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("ai.delete.dialog.desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteImageId && delImage.mutate(deleteImageId)}>{t("delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
