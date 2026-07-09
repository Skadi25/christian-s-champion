import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LayoutDashboard, Tags, LogOut, User as UserIcon, Sparkles, Clock, TrendingUp, Heart } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/dashboard", label: "Discovery", icon: LayoutDashboard, emoji: "🔥" },
  { to: "/latest", label: "Neueste Videos", icon: Clock, emoji: "🆕" },
  { to: "/trends", label: "Trends", icon: TrendingUp, emoji: "📈" },
  { to: "/watchlist", label: "Watchlist", icon: Heart, emoji: "❤️" },
  { to: "/topics", label: "Themen & Claims", icon: Tags, emoji: "🎯" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");

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

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-border px-6">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-signal text-signal-foreground">
            <Sparkles className="h-4 w-4" strokeWidth={2.25} />
          </div>
          <span className="font-display text-lg font-bold leading-none">Veritas</span>
        </div>

        <nav className="flex-1 px-3 py-5">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Workspace
          </p>
          <ul className="space-y-1">
            {nav.map((item) => {
              const active = location.startsWith(item.to);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                      active
                        ? "bg-white text-signal shadow-sm ring-1 ring-border"
                        : "text-foreground/70 hover:bg-white/60 hover:text-foreground",
                    )}
                  >
                    <span className="text-base leading-none">{item.emoji}</span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-accent text-accent-foreground">
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
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
