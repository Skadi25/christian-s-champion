import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogOut, User as UserIcon, Menu, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/dashboard", label: "Discovery", emoji: "🔥" },
  { to: "/latest", label: "Neueste Videos", emoji: "🆕" },
  { to: "/trends", label: "Trends", emoji: "📈" },
  { to: "/watchlist", label: "Watchlist", emoji: "❤️" },
  { to: "/topics", label: "Themen & Claims", emoji: "🎯" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setEmail(data.user.email ?? "");
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", data.user.id)
        .maybeSingle();
      setName(profile?.display_name ?? data.user.email?.split("@")[0] ?? "");
    });
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const SidebarInner = (
    <>
      <div className="flex h-16 items-center justify-between gap-2.5 border-b border-border px-6">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-signal to-purple-500 text-lg shadow-sm">
            ✨
          </div>
          <span className="font-display text-lg font-bold leading-none">Veritas</span>
        </div>
        <button
          onClick={() => setMobileOpen(false)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent md:hidden"
          aria-label="Menü schließen"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-5">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          ✨ Workspace
        </p>
        <ul className="space-y-1">
          {nav.map((item) => {
            const active = location.startsWith(item.to);
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                    active
                      ? "bg-white text-signal shadow-sm ring-1 ring-border"
                      : "text-foreground/70 hover:bg-white/60 hover:text-foreground",
                  )}
                >
                  <span className="text-lg leading-none">{item.emoji}</span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
            <UserIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{name || "…"}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>
          <button
            onClick={signOut}
            className="rounded-md p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            title="Abmelden"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">
        {SidebarInner}
      </aside>

      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur md:hidden">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-signal to-purple-500 text-base shadow-sm">
            ✨
          </div>
          <span className="font-display text-base font-bold">Veritas</span>
        </Link>
        <button
          onClick={() => setMobileOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium shadow-sm"
          aria-label="Menü öffnen"
        >
          <Menu className="h-4 w-4" />
          Menü
        </button>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85%] flex-col border-r border-border bg-surface md:hidden">
            {SidebarInner}
          </aside>
        </>
      )}

      <main className="min-w-0 flex-1 pt-14 md:pt-0">{children}</main>
    </div>
  );
}
