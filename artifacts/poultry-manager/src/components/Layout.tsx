import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Bird, Egg, CheckSquare, Target, BookOpen,
  Menu, X, LogOut, User, ShieldCheck, Shield, MessageCircle, Settings,
  Languages, BrainCircuit, FileText, FlaskConical, NotebookPen, Wallet, Calculator,
  Activity, Database, Layers, Wheat, Bell, Box, ShoppingCart, BarChart3,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import MobileBottomNav from "@/components/MobileBottomNav";

const WHATSAPP_GROUP_URL =
  import.meta.env.VITE_WHATSAPP_GROUP_URL?.trim() || "https://web.whatsapp.com/";

interface NavItem {
  href: string;
  key: string;
  descKey: string;
  icon: React.ElementType;
  adminOnly: boolean;
}

const NAV_KEYS: NavItem[] = [
  { href: "/",            key: "nav.dashboard",   descKey: "nav.dashboard.desc",   icon: LayoutDashboard, adminOnly: false },
  { href: "/flocks",      key: "nav.flocks",       descKey: "nav.flocks.desc",      icon: Bird,            adminOnly: false },
  { href: "/hatching",    key: "nav.hatching",     descKey: "nav.hatching.desc",    icon: Egg,             adminOnly: false },
  { href: "/operations",  key: "nav.operations",   descKey: "nav.operations.desc",  icon: Layers,          adminOnly: false },
  { href: "/tasks",       key: "nav.tasks",        descKey: "nav.tasks.desc",       icon: CheckSquare,     adminOnly: false },
  { href: "/feed",        key: "nav.feed",         descKey: "nav.feed.desc",        icon: Wheat,           adminOnly: false },
  { href: "/incubators", key: "nav.incubators",   descKey: "nav.incubators.desc",  icon: Box,             adminOnly: false },
  { href: "/sales",      key: "nav.sales",        descKey: "nav.sales.desc",       icon: ShoppingCart,    adminOnly: false },
  // ── Admin only ──
  { href: "/finance",     key: "nav.finance",      descKey: "nav.finance.desc",     icon: Wallet,          adminOnly: true  },
  { href: "/accounting",  key: "nav.accounting",   descKey: "nav.accounting.desc",  icon: Calculator,      adminOnly: true  },
  { href: "/workspace",   key: "nav.workspace",    descKey: "nav.workspace.desc",   icon: NotebookPen,     adminOnly: true  },
  { href: "/daily-plan",  key: "nav.dailyPlan",    descKey: "nav.dailyPlan.desc",   icon: Bell,            adminOnly: true  },
  { href: "/analytics",   key: "nav.analytics",    descKey: "nav.analytics.desc",   icon: Activity,        adminOnly: true  },
  { href: "/farm-analytics", key: "farmAnalytics.title", descKey: "farmAnalytics.subtitle", icon: BarChart3,   adminOnly: true  },
  { href: "/brain",       key: "nav.brain",        descKey: "nav.brain.desc",       icon: Database,        adminOnly: true  },
  { href: "/ai",          key: "nav.ai",           descKey: "nav.ai.desc",          icon: FileText,        adminOnly: true  },
  { href: "/ai/advanced", key: "nav.aiAdvanced",   descKey: "nav.aiAdvanced.desc",  icon: FlaskConical,    adminOnly: true  },
  { href: "/ai/precision",key: "nav.aiPrecision",  descKey: "nav.aiPrecision.desc", icon: BrainCircuit,    adminOnly: true  },
  { href: "/settings",    key: "nav.settings",     descKey: "nav.settings.desc",    icon: Settings,        adminOnly: true  },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout, isAdmin } = useAuth();
  const { t, dir, lang, toggleLang } = useLanguage();
  const { toast } = useToast();

  const isRtl = dir === "rtl";
  const ar = lang === "ar";

  // Workers only see non-admin pages
  const visibleNav = NAV_KEYS.filter(item => !item.adminOnly || isAdmin);

  const handleLogout = async () => {
    await logout();
    toast({ title: t("sidebar.loggedOut") });
  };

  return (
    <div className="min-h-screen bg-background flex" dir={dir}>
      {/* ── Backdrop ──────────────────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ───────────────────────────────────────────────────────────── */}
      <aside className={cn(
        "fixed top-0 h-full z-30 w-[82vw] max-w-[300px] md:w-64 flex flex-col transition-transform duration-300 ease-out",
        "bg-[#1A1208]",
        isRtl ? "right-0 border-l border-white/8" : "left-0 border-r border-white/8",
        "md:translate-x-0 md:static md:z-auto md:max-w-none",
        sidebarOpen
          ? "translate-x-0 shadow-2xl"
          : isRtl ? "translate-x-full md:translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Logo size={38} />
            <div className="min-w-0">
              <h1 className="font-bold text-white text-sm leading-tight truncate">{t("app.name")}</h1>
              <p className="text-xs text-white/50 truncate">{t("app.subtitle")}</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className={cn("md:hidden text-white/50 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/8", isRtl ? "mr-auto" : "ml-auto")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Role badge + Language */}
        <div className="flex px-4 py-3 border-b border-white/8 flex-col space-y-2 shrink-0">
          <div className={cn(
            "flex items-center gap-2 text-xs px-3 py-2 rounded-xl",
            isAdmin ? "bg-amber-500/15 text-amber-400" : "bg-blue-500/15 text-blue-400"
          )}>
            {isAdmin
              ? <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              : <Shield className="w-3.5 h-3.5 shrink-0" />}
            <span className="font-medium">
              {isAdmin ? t("role.admin.account") : t("role.worker.account")}
            </span>
          </div>

          <button
            onClick={toggleLang}
            className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-xl bg-white/5 text-white/70 hover:text-white hover:bg-white/10 transition-all duration-200"
          >
            <Languages className="w-3.5 h-3.5 shrink-0" />
            <span className="font-medium">{t("lang.switch")}</span>
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto scrollbar-hide">
          {/* Section: General */}
          {!isAdmin && (
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest px-3 pb-1.5">
              {ar ? "القائمة الرئيسية" : "Meny"}
            </p>
          )}
          {isAdmin && (
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest px-3 pb-1.5">
              {ar ? "التشغيل" : "Drift"}
            </p>
          )}

          {visibleNav.filter(n => !n.adminOnly).map(({ href, key, descKey, icon: Icon }) => {
            const active = location === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => {
                  setSidebarOpen(false);
                  if (active) window.dispatchEvent(new CustomEvent("nav-reset", { detail: href }));
                }}
                className={cn(
                  "flex items-start gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group",
                  active
                    ? "bg-primary text-white shadow-lg shadow-primary/20"
                    : "text-white/65 hover:bg-white/8 hover:text-white"
                )}
              >
                <Icon className={cn(
                  "w-4 h-4 shrink-0 mt-0.5 transition-transform duration-200",
                  active ? "text-white" : "text-white/50 group-hover:text-white/80",
                )} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold leading-tight">{t(key)}</span>
                  <p className={cn(
                    "text-[10px] leading-tight mt-0.5 truncate",
                    active ? "text-white/70" : "text-white/35"
                  )}>{t(descKey)}</p>
                </div>
              </Link>
            );
          })}

          {/* Admin-only section */}
          {isAdmin && visibleNav.some(n => n.adminOnly) && (
            <>
              <div className="pt-3 pb-1.5">
                <p className="text-[10px] font-semibold text-amber-400/60 uppercase tracking-widest px-3">
                  {ar ? "إدارة متقدمة" : "Administration"}
                </p>
              </div>
              <div className="h-px bg-white/8 mx-3 mb-1.5" />
            </>
          )}

          {isAdmin && visibleNav.filter(n => n.adminOnly).map(({ href, key, descKey, icon: Icon }) => {
            const active = location === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => {
                  setSidebarOpen(false);
                  if (active) window.dispatchEvent(new CustomEvent("nav-reset", { detail: href }));
                }}
                className={cn(
                  "flex items-start gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group",
                  active
                    ? "bg-primary text-white shadow-lg shadow-primary/20"
                    : "text-white/65 hover:bg-white/8 hover:text-white",
                  "border border-amber-500/10"
                )}
              >
                <Icon className={cn(
                  "w-4 h-4 shrink-0 mt-0.5 transition-transform duration-200",
                  active ? "text-white" : "text-white/50 group-hover:text-white/80",
                )} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold leading-tight truncate">{t(key)}</span>
                    <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1 py-0.5 rounded shrink-0">
                      {ar ? "مدير" : "Admin"}
                    </span>
                  </div>
                  <p className={cn(
                    "text-[10px] leading-tight mt-0.5 truncate",
                    active ? "text-white/70" : "text-white/35"
                  )}>{t(descKey)}</p>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-white/8 space-y-2 shrink-0">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5">
            <div className="w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.name}</p>
              <p className="text-xs text-white/40 truncate">{user?.username}</p>
            </div>
          </div>

          <a
            href={WHATSAPP_GROUP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-green-400/90 hover:text-green-400 hover:bg-green-500/10 transition-all duration-200"
          >
            <MessageCircle className="w-4 h-4 shrink-0" />
            <span className="truncate">{t("sidebar.whatsapp")}</span>
          </a>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-red-400/80 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span className="truncate">{t("sidebar.logout")}</span>
          </button>
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header
          className="h-14 bg-card/95 backdrop-blur-md border-b border-border/60 flex items-center px-4 gap-3 md:hidden sticky top-0 z-10 shadow-sm"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)", height: "calc(3.5rem + env(safe-area-inset-top, 0px))" }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-1 rounded-xl hover:bg-accent transition-colors active:scale-95"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <Logo size={26} />
            <span className="font-bold text-sm text-foreground">{t("app.name")}</span>
          </div>

          <div className={cn("flex items-center gap-2", isRtl ? "mr-auto" : "ml-auto")}>
            <button
              onClick={toggleLang}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg bg-muted/60 hover:bg-muted active:scale-95"
            >
              <Languages className="w-3.5 h-3.5" />
              {ar ? "SV" : "ع"}
            </button>

            <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-primary" />
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-3 sm:p-4 md:p-8 overflow-y-auto overflow-x-hidden pb-[84px] md:pb-8 ios-scroll">
          <div className="max-w-6xl mx-auto page-enter min-w-0">
            {children}
          </div>
        </main>
      </div>

      {/* ── Mobile Bottom Nav ────────────────────────────────────────────────── */}
      <MobileBottomNav onMenuOpen={() => setSidebarOpen(true)} />
    </div>
  );
}
