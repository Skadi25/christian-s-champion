import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Plus, ArrowRight, Radar } from "lucide-react";
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
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const topicsQ = useQuery({
    queryKey: ["topics", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topics")
        .select("id, name, color, is_active, claims:claims(count)")
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

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-8 py-10">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-signal">
              Discovery · Guten Morgen
            </p>
            <h1 className="font-display mt-3 text-5xl leading-none">
              Was heute wichtig ist.
            </h1>
          </div>
          <div className="hidden text-right md:block">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {new Date().toLocaleDateString("de-DE", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
          </div>
        </div>

        {/* Stat row */}
        <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border md:grid-cols-4">
          <StatCell kicker="Themen" value={totalTopics} />
          <StatCell kicker="Claims" value={totalClaims} />
          <StatCell kicker="Neue Videos" value={0} muted />
          <StatCell kicker="Ø Score" value="—" muted />
        </div>

        {/* Empty state OR feed placeholder */}
        {empty ? (
          <div className="mt-10 rounded-xl border border-dashed border-border bg-surface p-10 text-center">
            <Sparkles className="mx-auto h-6 w-6 text-signal" strokeWidth={1.5} />
            <h2 className="font-display mt-5 text-3xl">Dein Feed ist noch leer.</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
              Lade den <em>Christian-Wolf-Starter-Pack</em> mit typischen Falschaussagen
              aus Ernährung, Fitness und Supplements — oder lege eigene Themen an.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={handleStarterPack}
                disabled={seeding}
                className="inline-flex items-center gap-2 rounded-md bg-signal px-5 py-3 text-sm font-medium text-signal-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                {seeding ? "Lade …" : "Starter-Pack laden"}
                <ArrowRight className="h-4 w-4" />
              </button>
              <Link
                to="/topics"
                className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-3 text-sm transition hover:bg-accent"
              >
                <Plus className="h-4 w-4" /> Leer starten
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-10 rounded-xl border border-border bg-surface p-10 text-center">
            <Radar className="mx-auto h-6 w-6 text-signal" strokeWidth={1.5} />
            <h2 className="font-display mt-5 text-3xl">
              Discovery startet in Schritt 2.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
              Deine Themen und Claims sind angelegt. Als nächstes verbinden wir die
              YouTube-Discovery, die deine Watchlist gegen virale Videos matcht und
              den Reaction-Score berechnet.
            </p>
            <Link
              to="/topics"
              className="mt-6 inline-flex items-center gap-2 rounded-md border border-border px-5 py-3 text-sm transition hover:bg-accent"
            >
              Themen & Claims verwalten <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function StatCell({
  kicker,
  value,
  muted,
}: {
  kicker: string;
  value: number | string;
  muted?: boolean;
}) {
  return (
    <div className="bg-surface p-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
        {kicker}
      </p>
      <p
        className={
          "font-display mt-3 text-4xl leading-none " +
          (muted ? "text-muted-foreground/50" : "")
        }
      >
        {value}
      </p>
    </div>
  );
}
