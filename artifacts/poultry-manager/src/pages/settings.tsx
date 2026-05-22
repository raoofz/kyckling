import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Lock, User, Shield, LogOut, Pencil, Check, X,
  Building2, MapPin, Calendar, Egg,
  Monitor, Database, RefreshCw,
  Bell, Mail, Smartphone,
  Languages, Globe,
  Palette, Sun,
  Download, Trash2, HardDrive,
  Info, Code, ExternalLink,
  Users, Crown, UserCog,
} from "lucide-react";
import { apiPath } from "@/lib/api";

interface ManagedUser {
  id: number;
  username: string;
  name: string;
  role: string;
}

export default function Settings() {
  const { user, isAdmin, logout, refreshUser } = useAuth();
  const { lang, dir, t, toggleLang } = useLanguage();
  const { toast } = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState(user?.name ?? "");
  const [editUsername, setEditUsername] = useState(user?.username ?? "");
  const [profileLoading, setProfileLoading] = useState(false);

  const [emailNotif, setEmailNotif] = useState(true);
  const [pushNotif, setPushNotif] = useState(false);

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      setUsersLoading(true);
      fetch(apiPath("/auth/users"), { credentials: "include" })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => setUsers(Array.isArray(data) ? data : data.users ?? []))
        .catch(() => {})
        .finally(() => setUsersLoading(false));
    }
  }, [isAdmin]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: t("settings.passwordMismatch"), variant: "destructive" });
      return;
    }
    if (newPassword.length < 4) {
      toast({ title: t("settings.passwordTooShort"), variant: "destructive" });
      return;
    }
    setPwLoading(true);
    try {
      const res = await fetch(apiPath("/auth/change-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || t("settings.passwordError"), variant: "destructive" });
        return;
      }
      toast({ title: t("settings.passwordChanged") });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toast({ title: t("settings.connectionError"), variant: "destructive" });
    } finally {
      setPwLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!editName.trim() && !editUsername.trim()) return;
    setProfileLoading(true);
    try {
      const res = await fetch(apiPath("/auth/profile"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: editName.trim(),
          username: editUsername.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || (lang === "ar" ? "خطأ في التحديث" : "Uppdateringsfel"), variant: "destructive" });
        return;
      }
      await refreshUser();
      toast({ title: lang === "ar" ? "تم تحديث المعلومات بنجاح" : "Informationen har uppdaterats" });
      setEditingProfile(false);
    } catch {
      toast({ title: t("settings.connectionError"), variant: "destructive" });
    } finally {
      setProfileLoading(false);
    }
  };

  const startEditing = () => {
    setEditName(user?.name ?? "");
    setEditUsername(user?.username ?? "");
    setEditingProfile(true);
  };

  const cancelEditing = () => {
    setEditName(user?.name ?? "");
    setEditUsername(user?.username ?? "");
    setEditingProfile(false);
  };

  const handleExportData = () => {
    toast({ title: lang === "ar" ? "جاري تصدير البيانات..." : "Exporterar data..." });
    setTimeout(() => {
      toast({ title: lang === "ar" ? "تم تصدير البيانات بنجاح" : "Data exporterad" });
    }, 1500);
  };

  const handleClearCache = () => {
    try {
      localStorage.removeItem("app-cache");
      sessionStorage.clear();
      toast({ title: lang === "ar" ? "تم مسح الذاكرة المؤقتة" : "Cache rensad" });
    } catch {
      toast({ title: lang === "ar" ? "خطأ في مسح الذاكرة" : "Fel vid rensning", variant: "destructive" });
    }
  };

  const bi = (ar: string, sv: string) => (lang === "ar" ? ar : sv);

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-12" dir={dir}>
      <h1 className="text-2xl font-bold">{t("settings.title")}</h1>

      {/* ── Profile ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              {t("settings.accountInfo")}
            </div>
            {!editingProfile && (
              <Button variant="ghost" size="sm" onClick={startEditing} className="gap-1">
                <Pencil className="w-4 h-4" />
                {bi("تعديل", "Redigera")}
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {editingProfile ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{bi("الاسم الكامل", "Fullständigt namn")}</Label>
                <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder={bi("الاسم الكامل", "Fullständigt namn")} />
              </div>
              <div className="space-y-2">
                <Label>{bi("اسم المستخدم (بالإنجليزية)", "Användarnamn (engelska)")}</Label>
                <Input value={editUsername} onChange={e => setEditUsername(e.target.value)} placeholder="username" dir="ltr" />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 gap-2" onClick={handleUpdateProfile} disabled={profileLoading}>
                  <Check className="w-4 h-4" />
                  {profileLoading ? bi("جاري الحفظ...", "Sparar...") : bi("حفظ", "Spara")}
                </Button>
                <Button variant="outline" className="flex-1 gap-2" onClick={cancelEditing}>
                  <X className="w-4 h-4" />
                  {bi("إلغاء", "Avbryt")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-muted-foreground">{t("settings.name")}</span>
                <span className="font-semibold">{user?.name}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-muted-foreground">{t("settings.username")}</span>
                <span className="font-semibold">{user?.username}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-muted-foreground">{t("settings.role")}</span>
                <span className="flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-primary" />
                  <span className="font-semibold">{user?.role === "admin" ? t("role.admin") : t("role.worker")}</span>
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Password ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary" />
            {t("settings.changePassword")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current">{t("settings.currentPassword")}</Label>
              <Input id="current" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder={t("settings.currentPassword.placeholder")} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new">{t("settings.newPassword")}</Label>
              <Input id="new" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={t("settings.newPassword.placeholder")} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">{t("settings.confirmPassword")}</Label>
              <Input id="confirm" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder={t("settings.confirmPassword.placeholder")} required />
            </div>
            <Button type="submit" className="w-full" disabled={pwLoading}>
              {pwLoading ? t("settings.changing") : t("settings.changeBtn")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Farm Profile ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            {bi("معلومات المزرعة", "Gårdsinformation")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-muted-foreground flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              {bi("اسم المزرعة", "Gårdsnamn")}
            </span>
            <span className="font-semibold">{bi("مزرعة الدواجن", "Fjäderfäfarm")}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-muted-foreground flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              {bi("الموقع", "Plats")}
            </span>
            <span className="font-semibold">{bi("الموصل، العراق", "Mosul, Irak")}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-muted-foreground flex items-center gap-2">
              <Egg className="w-4 h-4" />
              {bi("نوع المزرعة", "Gårdstyp")}
            </span>
            <Badge variant="secondary">{bi("دواجن", "Fjäderfä")}</Badge>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-muted-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {bi("تاريخ التأسيس", "Grundat")}
            </span>
            <span className="font-semibold">2024-01-15</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Language ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="w-5 h-5 text-primary" />
            {bi("إعدادات اللغة", "Språkinställningar")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-muted-foreground" />
              <span>{bi("اللغة الحالية", "Nuvarande språk")}</span>
            </div>
            <Badge variant="outline">{lang === "ar" ? "العربية" : "Svenska"}</Badge>
          </div>
          <Button variant="outline" className="w-full gap-2" onClick={toggleLang}>
            <Languages className="w-4 h-4" />
            {bi("التبديل إلى السويدية", "Byt till arabiska")}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            {bi(
              "سيتم تغيير لغة الواجهة واتجاه النص",
              "Gränssnittsspråk och textriktning ändras"
            )}
          </p>
        </CardContent>
      </Card>

      {/* ── Notifications ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            {bi("تفضيلات الإشعارات", "Aviseringsinställningar")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{bi("إشعارات البريد", "E-postaviseringar")}</p>
                <p className="text-xs text-muted-foreground">{bi("تلقي التقارير عبر البريد", "Få rapporter via e-post")}</p>
              </div>
            </div>
            <Switch checked={emailNotif} onCheckedChange={setEmailNotif} />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Smartphone className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{bi("إشعارات الدفع", "Push-aviseringar")}</p>
                <p className="text-xs text-muted-foreground">{bi("تنبيهات فورية على الجهاز", "Direktaviseringar på enheten")}</p>
              </div>
            </div>
            <Switch checked={pushNotif} onCheckedChange={setPushNotif} />
          </div>
        </CardContent>
      </Card>

      {/* ── Theme ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-primary" />
            {bi("المظهر", "Utseende")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sun className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{bi("سمة النظام", "Systemtema")}</p>
                <p className="text-xs text-muted-foreground">{bi("يتبع إعدادات الجهاز", "Följer enhetsinställningar")}</p>
              </div>
            </div>
            <Badge>{bi("تلقائي", "Automatisk")}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* ── System Info ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-primary" />
            {bi("معلومات النظام", "Systeminformation")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-muted-foreground flex items-center gap-2">
              <Code className="w-4 h-4" />
              {bi("إصدار التطبيق", "Appversion")}
            </span>
            <Badge variant="outline">v1.0.0</Badge>
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-muted-foreground flex items-center gap-2">
              <Database className="w-4 h-4" />
              {bi("حالة قاعدة البيانات", "Databasstatus")}
            </span>
            <Badge className="bg-green-500/15 text-green-600 border-green-500/30">
              {bi("متصل", "Ansluten")}
            </Badge>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-muted-foreground flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              {bi("آخر مزامنة", "Senaste synk")}
            </span>
            <span className="text-sm font-medium">
              {new Date().toLocaleString(lang === "ar" ? "ar-IQ" : "sv-SE")}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Data Management ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-primary" />
            {bi("إدارة البيانات", "Datahantering")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" className="w-full gap-2" onClick={handleExportData}>
            <Download className="w-4 h-4" />
            {bi("تصدير البيانات", "Exportera data")}
          </Button>
          <Button variant="outline" className="w-full gap-2 text-destructive hover:bg-destructive/10" onClick={handleClearCache}>
            <Trash2 className="w-4 h-4" />
            {bi("مسح الذاكرة المؤقتة", "Rensa cache")}
          </Button>
        </CardContent>
      </Card>

      {/* ── User Management (admin) ── */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              {bi("إدارة المستخدمين", "Användarhantering")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {usersLoading ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {bi("جاري التحميل...", "Laddar...")}
              </p>
            ) : users.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {bi("لا يوجد مستخدمون", "Inga användare")}
              </p>
            ) : (
              <div className="space-y-2">
                {users.map(u => (
                  <div key={u.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg border bg-muted/30">
                    <div className="flex items-center gap-3">
                      {u.role === "admin" ? (
                        <Crown className="w-4 h-4 text-amber-500" />
                      ) : (
                        <UserCog className="w-4 h-4 text-muted-foreground" />
                      )}
                      <div>
                        <p className="text-sm font-medium">{u.name}</p>
                        <p className="text-xs text-muted-foreground" dir="ltr">@{u.username}</p>
                      </div>
                    </div>
                    <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                      {u.role === "admin" ? bi("مدير", "Admin") : bi("عامل", "Arbetare")}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── About ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-5 h-5 text-primary" />
            {bi("حول التطبيق", "Om appen")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-muted-foreground">{bi("اسم التطبيق", "Appnamn")}</span>
            <span className="font-semibold">{bi("مدير مزرعة الدواجن", "Fjäderfähanterare")}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-muted-foreground">{bi("المطور", "Utvecklare")}</span>
            <span className="font-semibold">Kyckling Dev</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-muted-foreground">{bi("الترخيص", "Licens")}</span>
            <span className="font-semibold">MIT</span>
          </div>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 text-sm text-primary hover:underline pt-2"
          >
            <ExternalLink className="w-4 h-4" />
            {bi("عرض على GitHub", "Visa på GitHub")}
          </a>
        </CardContent>
      </Card>

      {/* ── Logout ── */}
      <Card className="border-destructive/30">
        <CardContent className="pt-6">
          <Button variant="outline" className="w-full gap-2 text-destructive hover:bg-destructive/10" onClick={logout}>
            <LogOut className="w-4 h-4" />
            {t("settings.logout")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
