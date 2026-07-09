import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Sparkles,
  Plus,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { seedStarterPack } from "@/lib/starter-pack";
import { runDiscovery, getDiscoveryFeed, submitFeedback } from "@/lib/discovery.functions";
import { cn } from "@/lib/utils";
import type { Stance } from "@/lib/discovery/scoring";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

type Match = Awaited<ReturnType<typeof getDiscoveryFeed>>["matches"][number];

function Dashboard() {
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [seeding, setSeeding] = useState(false);
  const [running, setRunning] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<string | "all">("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const runDiscoveryFn = useServerFn(runDiscovery);
  const getFeedFn = useServerFn(getDiscoveryFeed);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", data.user.id)
        .maybeSingle();
      setDisplayName(profile?.display_name ?? data.user.email?.split("@")[0] ?? "");
    });
  }, []);

  const topicsQ = useQuery({
    queryKey: ["topics", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topics")
        .select("id, name, claims:claims(count)")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const feedQ = useQuery({
    queryKey: ["discovery-feed", userId],
    enabled: !!userId,
    queryFn: () => getFeedFn(),
  });

  const totalTopics = topicsQ.data?.length ?? 0;
  const totalClaims =
    topicsQ.data?.reduce((s, t) => s + (t.claims?.[0]?.count ?? 0), 0) ?? 0;
  const matches = feedQ.data?.matches ?? [];
  const lastRun = feedQ.data?.lastRun ?? null;

  const filtered = useMemo(
    () =>
      selectedTopic === "all"
        ? matches
        : matches.filter((m) => m.topic?.id === selectedTopic),
    [matches, selectedTopic],
  );

  const stats = useMemo(() => {
    const scores = matches
      .map((m) => m.opportunity_score)
      .filter((n): n is number => typeof n === "number");
    const avg =
      scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newToday = matches.filter(
      (m) => m.matched_at && new Date(m.matched_at).getTime() >= today.getTime(),
    ).length;
    const top = matches[0]?.opportunity_score ?? null;
    return { avg, newToday, top, total: matches.length };
  }, [matches]);

  async function handleStarterPack() {
    if (!userId) return;
    setSeeding(true);
    try {
      const res = await seedStarterPack(userId);
      toast.success(`Starter-Pack geladen: ${res.topics} Themen · ${res.claims} Claims.`);
      qc.invalidateQueries({ queryKey: ["topics"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Konnte nicht laden.");
    } finally {
      setSeeding(false);
    }
  }

  async function handleRun() {
    setRunning(true);
    const t = toast.loading(
      "Durchsuche YouTube (bis zu 5.000 Kandidaten) und klassifiziere die besten per KI …",
    );
    try {
      const res = await runDiscoveryFn();
      toast.dismiss(t);
      if (res?.note === "no_claims") {
        toast.warning("Noch keine aktiven Claims. Lege welche im Themen-Editor an.");
      } else {
        const s = res?.stanceStats;
        const stanceLine = s
          ? ` · 🔴 ${s.promotes} verbreitet · 🟡 ${s.mentions} erwähnt · 🟢 ${s.debunks} widerlegt`
          : "";
        const parts = [
          `✅ ${res?.matched ?? 0} priorisiert`,
          `❌ ${res?.rejected ?? 0} verworfen`,
          `aus ${res?.scanned ?? 0} geprüften (Pool: ${res?.poolSize ?? 0})`,
        ];
        toast.success(parts.join(" · ") + stanceLine, { duration: 8000 });
      }
      qc.invalidateQueries({ queryKey: ["discovery-feed"] });
    } catch (e) {
      toast.dismiss(t);
      toast.error(e instanceof Error ? e.message : "Discovery fehlgeschlagen.");
    } finally {
      setRunning(false);
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
          <div className="min-w-0">
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
          {!empty && (
            <div className="flex flex-col items-end gap-1.5">
              <button
                onClick={handleRun}
                disabled={running}
                className="inline-flex items-center gap-2 rounded-xl bg-signal px-5 py-2.5 text-sm font-semibold text-signal-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
              >
                {running ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {running ? "Suche läuft …" : "Jetzt aktualisieren"}
              </button>
              {lastRun?.finished_at && (
                <p className="text-xs text-muted-foreground">
                  Zuletzt {formatRelativeTime(lastRun.finished_at)}
                </p>
              )}
            </div>
          )}
        </div>

        {empty ? (
          <EmptyState onLoad={handleStarterPack} seeding={seeding} />
        ) : (
          <>
            {/* Stats */}
            <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard emoji="🎯" label="Themen" value={totalTopics} tone="signal" />
              <StatCard emoji="⚠️" label="Claims" value={totalClaims} tone="warning" />
              <StatCard emoji="🔥" label="Neue Videos heute" value={stats.newToday} muted={stats.newToday === 0} />
              <StatCard
                emoji="📈"
                label="Ø Opportunity Score"
                value={stats.avg ?? "—"}
                muted={stats.avg === null}
              />
            </div>

            {/* Feed */}
            <section className="mt-10">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="font-display text-2xl font-bold tracking-tight">
                    🔥 Priorisierte Videos
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Sortiert nach Opportunity Score. Klicke eine Karte für die Aufschlüsselung.
                  </p>
                </div>
                {topicsQ.data && topicsQ.data.length > 0 && matches.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <FilterChip
                      active={selectedTopic === "all"}
                      onClick={() => setSelectedTopic("all")}
                    >
                      Alle · {matches.length}
                    </FilterChip>
                    {topicsQ.data.map((t) => {
                      const count = matches.filter((m) => m.topic?.id === t.id).length;
                      if (count === 0) return null;
                      return (
                        <FilterChip
                          key={t.id}
                          active={selectedTopic === t.id}
                          onClick={() => setSelectedTopic(t.id)}
                        >
                          {t.name} · {count}
                        </FilterChip>
                      );
                    })}
                  </div>
                )}
              </div>

              {feedQ.isLoading ? (
                <div className="mt-6 grid gap-3">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-40 animate-pulse rounded-2xl border border-border bg-white"
                    />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <FeedEmpty hasMatches={matches.length > 0} onRun={handleRun} running={running} />
              ) : (
                <div className="mt-6 grid gap-3">
                  {filtered.map((m) => (
                    <VideoMatchCard
                      key={m.id}
                      match={m}
                      expanded={expanded === m.id}
                      onToggle={() => setExpanded(expanded === m.id ? null : m.id)}
                    />
                  ))}
                </div>
              )}
            </section>

            <RejectedSection rejected={feedQ.data?.rejected ?? []} />

            <div className="mt-10 rounded-2xl border border-dashed border-border bg-surface p-6 text-center">
              <p className="text-xs text-muted-foreground">
                Phase 3 kommt als nächstes: pro Video ein KI-Reaktionsentwurf mit Hook und
                wissenschaftlichen Quellen.
              </p>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function VideoMatchCard({
  match,
  expanded,
  onToggle,
}: {
  match: Match;
  expanded: boolean;
  onToggle: () => void;
}) {
  const v = match.video;
  const score = match.opportunity_score ?? 0;
  const bd = (match.score_breakdown ?? null) as {
    stance?: number;
    reach?: number;
    growth?: number;
    recency?: number;
    engagement?: number;
    confidence?: number;
    language?: number;
    channel?: number;
    stanceAffinity?: number;
    stanceLabel?: Stance | null;
    weights?: Record<string, number>;
  } | null;
  const stance = ((match as { stance?: Stance | null }).stance ?? bd?.stanceLabel ?? null) as Stance | null;

  const scoreColor =
    score >= 75
      ? "bg-red-100 text-red-700"
      : score >= 50
      ? "bg-amber-100 text-amber-700"
      : "bg-slate-100 text-slate-600";

  return (
    <div className="card-hover overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      <div className="flex flex-col gap-4 p-4 md:flex-row">
        {/* Thumbnail */}
        {v?.thumbnail_url ? (
          <a
            href={v.url}
            target="_blank"
            rel="noreferrer noopener"
            className="relative block w-full shrink-0 overflow-hidden rounded-xl md:w-56"
          >
            <img
              src={v.thumbnail_url}
              alt=""
              className="aspect-video h-full w-full object-cover"
              loading="lazy"
            />
            {v.duration_seconds ? (
              <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-mono text-white">
                {formatDuration(v.duration_seconds)}
              </span>
            ) : null}
          </a>
        ) : (
          <div className="aspect-video w-full shrink-0 rounded-xl bg-muted md:w-56" />
        )}

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <StanceBadge stance={stance} />
                {match.topic?.name && (
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-foreground">
                    🎯 {match.topic.name}
                  </span>
                )}
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {v?.platform === "youtube" ? "▶ YouTube" : v?.platform}
                </span>
              </div>
              <a
                href={v?.url ?? "#"}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-1.5 line-clamp-2 block font-semibold leading-snug hover:text-signal"
              >
                {v?.title || "Ohne Titel"}
              </a>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {v?.channel_name ?? "Unbekannter Kanal"}
                {v?.published_at && <> · {formatRelativeTime(v.published_at)}</>}
              </p>
            </div>
            <div
              className={cn(
                "shrink-0 rounded-xl px-3 py-2 text-center",
                scoreColor,
              )}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide">Score</p>
              <p className="text-2xl font-bold leading-none">{score}</p>
            </div>
          </div>

          {/* Metrics row */}
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">👁 {formatCount(v?.view_count)}</span>
            <span className="inline-flex items-center gap-1">❤️ {formatCount(v?.like_count)}</span>
            <span className="inline-flex items-center gap-1">💬 {formatCount(v?.comment_count)}</span>
            {v?.published_at && (
              <span className="inline-flex items-center gap-1">
                📈 {formatPerHour(v.view_count, v.published_at)}/h
              </span>
            )}
          </div>

          {/* AI summary */}
          {match.ai_summary && (
            <div className="mt-3 rounded-lg border-l-2 border-signal/60 bg-signal/5 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-signal">
                ⚠️ Erkannter Claim
              </p>
              <p className="mt-0.5 text-sm text-foreground">{match.ai_summary}</p>
            </div>
          )}

          {/* Actions */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={v?.url ?? "#"}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium transition hover:bg-accent"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Auf {v?.platform === "youtube" ? "YouTube" : "der Plattform"} öffnen
            </a>
            <FeedbackButtons
              matchId={match.id}
              current={(match.user_feedback as FeedbackRating | null) ?? null}
            />
            <button
              onClick={onToggle}
              className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
            >
              Warum diese Priorität?
              <ChevronDown className={cn("h-3.5 w-3.5 transition", expanded && "rotate-180")} />
            </button>
          </div>

          {/* Expanded breakdown */}
          {expanded && bd && (
            <div className="mt-3 grid gap-2 rounded-lg bg-surface p-3 text-xs">
              <ScoreBar label="🌍 Reichweite" value={bd.reach ?? 0} weight={35} />
              <ScoreBar label="📈 Wachstum" value={bd.growth ?? 0} weight={25} />
              <ScoreBar label="⏱ Aktualität" value={bd.recency ?? 0} weight={15} />
              <ScoreBar label="💬 Engagement" value={bd.engagement ?? 0} weight={15} />
              <ScoreBar label="🤖 KI-Confidence" value={bd.confidence ?? 0} weight={10} />
              {match.ai_reasoning && (
                <p className="mt-2 rounded bg-white p-2 text-muted-foreground">
                  💡 {match.ai_reasoning}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScoreBar({ label, value, weight }: { label: string; value: number; weight: number }) {
  return (
    <div className="grid grid-cols-[110px_1fr_60px] items-center gap-2">
      <span className="text-muted-foreground">{label}</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-signal transition-all"
          style={{ width: `${Math.max(2, value)}%` }}
        />
      </div>
      <span className="text-right font-mono text-[11px] text-muted-foreground">
        {value} × {weight}%
      </span>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition",
        active
          ? "border-signal bg-signal/10 text-signal"
          : "border-border bg-white text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function FeedEmpty({
  hasMatches,
  onRun,
  running,
}: {
  hasMatches: boolean;
  onRun: () => void;
  running: boolean;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-border bg-white p-10 text-center">
      <p className="text-3xl">{hasMatches ? "🎯" : "🔍"}</p>
      <h3 className="font-display mt-3 text-xl font-semibold">
        {hasMatches ? "Kein Treffer in diesem Filter." : "Noch keine Videos entdeckt."}
      </h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {hasMatches
          ? "Wähle ein anderes Thema oder setze den Filter zurück."
          : "Starte deinen ersten Discovery-Lauf. Die KI durchsucht YouTube nach Videos, die zu deinen Claims passen."}
      </p>
      {!hasMatches && (
        <button
          onClick={onRun}
          disabled={running}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-signal px-5 py-2.5 text-sm font-semibold text-signal-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {running ? "Suche läuft …" : "Ersten Discovery-Lauf starten"}
        </button>
      )}
    </div>
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
          mit typischen Falschaussagen aus Ernährung, Fitness und Supplements — oder starte
          mit einem leeren Workspace.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={onLoad}
            disabled={seeding}
            className="inline-flex items-center gap-2 rounded-xl bg-signal px-5 py-3 text-sm font-semibold text-signal-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
          >
            {seeding ? "Lade …" : (<><Sparkles className="h-4 w-4" /> Starter-Pack laden</>)}
          </button>
          <Link
            to="/topics"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-5 py-3 text-sm font-medium transition hover:bg-accent"
          >
            <Plus className="h-4 w-4" /> Leer starten
          </Link>
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

function formatCount(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function formatPerHour(views: number | null | undefined, publishedAt: string): string {
  if (!views) return "—";
  const hours = Math.max(1, (Date.now() - new Date(publishedAt).getTime()) / 3_600_000);
  return formatCount(Math.round(views / hours));
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "gerade eben";
  if (m < 60) return `vor ${m} Min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} Std`;
  const days = Math.floor(h / 24);
  if (days < 30) return `vor ${days} Tag${days === 1 ? "" : "en"}`;
  return new Date(iso).toLocaleDateString("de-DE");
}

function RejectedSection({ rejected }: { rejected: Match[] }) {
  const [open, setOpen] = useState(false);
  if (rejected.length === 0) return null;

  return (
    <section className="mt-10">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-2xl border border-border bg-white px-5 py-4 text-left shadow-sm transition hover:bg-accent/50"
      >
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">
            🔍 Auch geprüft, aber verworfen
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {rejected.length} Videos hat die KI angeschaut, aber nicht als Match eingestuft.
            Sortiert nach Confidence — die obersten Kandidaten waren am nächsten dran.
          </p>
        </div>
        <ChevronDown className={cn("h-5 w-5 shrink-0 transition", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-3 grid gap-2">
          {rejected.map((r) => (
            <RejectedCard key={r.id} match={r} />
          ))}
        </div>
      )}
    </section>
  );
}

function RejectedCard({ match }: { match: Match }) {
  const v = match.video;
  const conf = Math.round(((match.ai_confidence as number | null) ?? 0) * 100);
  return (
    <div className="flex gap-3 rounded-xl border border-border/60 bg-white p-3">
      {v?.thumbnail_url ? (
        <a
          href={v.url}
          target="_blank"
          rel="noreferrer noopener"
          className="block h-16 w-28 shrink-0 overflow-hidden rounded-lg"
        >
          <img src={v.thumbnail_url} alt="" className="h-full w-full object-cover" loading="lazy" />
        </a>
      ) : (
        <div className="h-16 w-28 shrink-0 rounded-lg bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <a
            href={v?.url ?? "#"}
            target="_blank"
            rel="noreferrer noopener"
            className="line-clamp-1 text-sm font-medium hover:text-signal"
          >
            {v?.title || "Ohne Titel"}
          </a>
          <span
            className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600"
            title="KI-Confidence, dass das Video die Falschaussage vertritt"
          >
            {conf}%
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {v?.channel_name ?? "—"}
          {match.topic?.name && <> · 🎯 {match.topic.name}</>}
          {match.claim?.text && <> · „{match.claim.text}"</>}
        </p>
        {match.ai_reasoning && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            💭 {match.ai_reasoning}
          </p>
        )}
        <div className="mt-2">
          <FeedbackButtons
            matchId={match.id}
            current={(match.user_feedback as FeedbackRating | null) ?? null}
            size="sm"
          />
        </div>
      </div>
    </div>
  );
}

type FeedbackRating = "relevant" | "neutral" | "not_relevant";

function FeedbackButtons({
  matchId,
  current,
  size = "md",
}: {
  matchId: string;
  current: FeedbackRating | null;
  size?: "sm" | "md";
}) {
  const qc = useQueryClient();
  const submit = useServerFn(submitFeedback);
  const [busy, setBusy] = useState<FeedbackRating | null>(null);
  const [optimistic, setOptimistic] = useState<FeedbackRating | null>(current);

  useEffect(() => setOptimistic(current), [current]);

  async function rate(rating: FeedbackRating) {
    setBusy(rating);
    setOptimistic(rating);
    try {
      await submit({ data: { matchId, rating } });
      toast.success(
        rating === "relevant"
          ? "Danke — die KI lernt daraus."
          : rating === "not_relevant"
          ? "Verstanden. Weniger davon."
          : "Notiert.",
        { duration: 2000 },
      );
      qc.invalidateQueries({ queryKey: ["discovery-feed"] });
    } catch (e) {
      setOptimistic(current);
      toast.error(e instanceof Error ? e.message : "Konnte Feedback nicht speichern.");
    } finally {
      setBusy(null);
    }
  }

  const items: Array<{ r: FeedbackRating; emoji: string; label: string; on: string }> = [
    { r: "relevant", emoji: "👍", label: "Relevant", on: "bg-emerald-100 text-emerald-700 border-emerald-300" },
    { r: "neutral", emoji: "😐", label: "Neutral", on: "bg-slate-200 text-slate-700 border-slate-300" },
    { r: "not_relevant", emoji: "👎", label: "Nicht", on: "bg-rose-100 text-rose-700 border-rose-300" },
  ];

  const pad = size === "sm" ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs";

  return (
    <div className="inline-flex gap-1" role="group" aria-label="Feedback">
      {items.map((it) => {
        const active = optimistic === it.r;
        return (
          <button
            key={it.r}
            onClick={() => rate(it.r)}
            disabled={busy !== null}
            title={it.label}
            className={cn(
              "inline-flex items-center gap-1 rounded-lg border font-medium transition disabled:opacity-60",
              pad,
              active ? it.on : "border-border bg-white text-muted-foreground hover:bg-accent",
            )}
          >
            <span>{it.emoji}</span>
            {size === "md" && <span>{it.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

