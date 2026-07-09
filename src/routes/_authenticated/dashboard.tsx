import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Plus, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { seedStarterPack } from "@/lib/starter-pack";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", data.user.id)
        .maybeSingle();
      setDisplayName(
        profile?.display_name ?? data.user.email?.split("@")[0] ?? "",
      );
    });
  }, []);

  const topicsQ = useQuery({
    queryKey: ["topics", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topics")
        .select("id, name, is_active, claims:claims(count)")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const totalTopics = topicsQ.data?.length ?? 0;
  const totalClaims =
    topicsQ.data?.reduce(
      (sum, t) => sum + (t.claims?.[0]?.count ?? 0),
      0,
    ) ?? 0;

  async function handleStarterPack() {
    if (!userId) return;
    setSeeding(true);
    try {
      const res = await seedStarterPack(userId);
      toast.success(
        `Starter-Pack geladen: ${res.topics} Themen · ${res.claims} Claims.`,
      );
      qc.invalidateQueries({ queryKey: ["topics"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Konnte nicht laden.");
    } finally {
      setSeeding(false);
    }
  }

  const empty = !topicsQ.isLoading && totalTopics === 0;
  const hour = new Date().getHours();
  const greeting =
    hour < 5 ? "Gute Nacht" : hour < 11 ? "Guten Morgen" : hour < 18 ? "Hallo" : "Guten Abend";

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-signal">
              Discovery
            </p>
            <h1 className="font-display mt-2 text-4xl font-bold tracking-tight md:text-5xl">
              {greeting}
              {displayName ? `, ${displayName}` : ""} 👋
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              Das ist heute wichtig für dich — priorisiert nach Reichweite und Wirkung.
            </p>
          </div>
          <div className="hidden text-right md:block">
            <p className="text-sm font-medium text-muted-foreground">
              {new Date().toLocaleDateString("de-DE", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
          </div>
        </div>

        {empty ? (
          <EmptyState onLoad={handleStarterPack} seeding={seeding} />
        ) : (
          <>
            {/* Quick stats */}
            <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard emoji="🎯" label="Themen" value={totalTopics} tone="signal" />
              <StatCard emoji="⚠️" label="Claims" value={totalClaims} tone="warning" />
              <StatCard emoji="🔥" label="Neue Videos heute" value={0} muted />
              <StatCard emoji="📈" label="Ø Opportunity Score" value="—" muted />
            </div>

            {/* Overview cards */}
            <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <OverviewCard
                emoji="🔥"
                title="Hochrelevante Videos"
                subtitle="Videos, die deine Claims treffen und hohe Reichweite haben"
                count={0}
              />
              <OverviewCard
                emoji="📈"
                title="Starkes Wachstum"
                subtitle="Videos mit überdurchschnittlichem Views-Anstieg"
                count={0}
              />
              <OverviewCard
                emoji="💬"
                title="Diskussion in Kommentaren"
                subtitle="Wo die Community aktiv über den Claim streitet"
                count={0}
              />
              <OverviewCard
                emoji="⭐"
                title="Top Reaction Opportunity"
                subtitle="Die beste Chance heute für eine Reaktion"
                count={0}
              />
            </div>

            <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
              <p className="text-2xl">🚀</p>
              <h3 className="font-display mt-3 text-xl font-semibold">
                Discovery aktiviert sich in Schritt 2
              </h3>
              <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
                Deine {totalTopics} Themen und {totalClaims} Claims sind gespeichert. Als
                nächstes verbinden wir die YouTube-Discovery, die deinen Feed automatisch
                mit passenden viralen Videos füllt.
              </p>
              <Link
                to="/topics"
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:opacity-90"
              >
                Themen verwalten <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function EmptyState({ onLoad, seeding }: { onLoad: () => void; seeding: boolean }) {
  return (
    <div className="mt-10 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-white via-white to-accent/40 p-10 shadow-sm md:p-14">
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-signal/10 text-2xl">
          ✨
        </div>
        <h2 className="font-display mt-6 text-3xl font-bold tracking-tight">
          Willkommen bei Veritas
        </h2>
        <p className="mt-3 text-base text-muted-foreground">
          Lade den <span className="font-medium text-foreground">Christian-Wolf-Starter-Pack</span>{" "}
          mit typischen Falschaussagen aus Ernährung, Fitness und Supplements — oder
          starte mit einem leeren Workspace.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={onLoad}
            disabled={seeding}
            className="inline-flex items-center gap-2 rounded-xl bg-signal px-5 py-3 text-sm font-semibold text-signal-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
          >
            {seeding ? (
              "Lade …"
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Starter-Pack laden
              </>
            )}
          </button>
          <Link
            to="/topics"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-5 py-3 text-sm font-medium transition hover:bg-accent"
          >
            <Plus className="h-4 w-4" /> Leer starten
          </Link>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-3 text-left md:grid-cols-3">
          {[
            { emoji: "🎯", title: "Themen wählen", text: "Kreatin, Süßstoffe, Darm …" },
            { emoji: "🔍", title: "KI findet Videos", text: "YouTube, später TikTok" },
            { emoji: "✍️", title: "Reaktion vorbereitet", text: "Hook + Quellen inklusive" },
          ].map((s) => (
            <div key={s.title} className="rounded-xl border border-border bg-white p-4">
              <div className="text-xl">{s.emoji}</div>
              <p className="mt-2 text-sm font-semibold">{s.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  emoji,
  label,
  value,
  tone,
  muted,
}: {
  emoji: string;
  label: string;
  value: number | string;
  tone?: "signal" | "warning";
  muted?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-lg">{emoji}</span>
        {tone === "signal" && (
          <span className="rounded-full bg-signal/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-signal">
            aktiv
          </span>
        )}
      </div>
      <p
        className={
          "mt-4 text-3xl font-bold tracking-tight " +
          (muted ? "text-muted-foreground/60" : "text-foreground")
        }
      >
        {value}
      </p>
      <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

function OverviewCard({
  emoji,
  title,
  subtitle,
  count,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  count: number;
}) {
  return (
    <div className="card-hover rounded-2xl border border-border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-lg">
            {emoji}
          </div>
          <div className="min-w-0">
            <p className="font-semibold">{title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
          {count}
        </span>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Wird verfügbar, sobald die Discovery aktiv ist.
      </p>
    </div>
  );
}
