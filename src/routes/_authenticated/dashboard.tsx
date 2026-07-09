import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Sparkles,
  Plus,
  RefreshCw,
  ExternalLink,
  Loader2,
  Eye,
  Heart,
  Flame,
  TrendingUp,
  Clock,
  Inbox,
  ChevronDown,
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
type FeedbackRating = "relevant" | "neutral" | "not_relevant";

function Dashboard() {
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [seeding, setSeeding] = useState(false);
  const [running, setRunning] = useState(false);

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
        .select("id, name")
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
  const matches = feedQ.data?.matches ?? [];
  const lastRun = feedQ.data?.lastRun ?? null;

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newToday = matches.filter(
      (m) => m.matched_at && new Date(m.matched_at).getTime() >= today.getTime(),
    ).length;
    const highOpp = matches.filter((m) => (m.opportunity_score ?? 0) >= 75).length;
    const scores = matches
      .map((m) => m.opportunity_score)
      .filter((n): n is number => typeof n === "number");
    const avg =
      scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    return { newToday, highOpp, avg, total: matches.length };
  }, [matches]);

  const topFive = matches.slice(0, 5);
  const rest = matches.slice(5);

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
    const t = toast.loading("Suche neue Chancen …");
    try {
      const res = await runDiscoveryFn();
      toast.dismiss(t);
      if (res?.note === "no_claims") {
        toast.warning("Noch keine aktiven Claims. Lege welche im Themen-Editor an.");
      } else if (res?.note === "quota_exceeded") {
        toast.error("Tageslimit erreicht. Bitte später erneut versuchen.", { duration: 8000 });
      } else {
        toast.success(`${res?.matched ?? 0} neue Chancen gefunden.`, { duration: 5000 });
      }
      qc.invalidateQueries({ queryKey: ["discovery-feed"] });
    } catch (e) {
      toast.dismiss(t);
      toast.error(e instanceof Error ? e.message : "Konnte nicht aktualisieren.");
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
      <div className="mx-auto max-w-7xl px-6 py-12 md:px-12">
        {/* Header */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 sm:flex sm:flex-wrap sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-signal">
              ✨ Dein Discovery-Feed
            </p>
            <h1 className="font-display mt-2 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
              {greeting}
              {displayName ? `, ${displayName}` : ""} 👋
            </h1>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              🚀 Deine besten Chancen — heute frisch für dich priorisiert.
            </p>
          </div>
          {!empty && (
            <div className="flex flex-col items-end gap-1.5">
              <button
                onClick={handleRun}
                disabled={running}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-signal to-purple-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-50"
              >
                {running ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {running ? "Suche läuft …" : "⚡ Aktualisieren"}
              </button>
              {lastRun?.finished_at && (
                <p className="text-xs text-muted-foreground">
                  🕒 Zuletzt {formatRelativeTime(lastRun.finished_at)}
                </p>
              )}
            </div>
          )}
        </div>

        {empty ? (
          <EmptyState onLoad={handleStarterPack} seeding={seeding} />
        ) : (
          <>
            {/* KPI cards */}
            <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
              <KpiCard
                emoji="🆕"
                label="Neue Videos heute"
                value={stats.newToday}
                gradient="from-blue-50 to-cyan-50"
              />
              <KpiCard
                emoji="🔥"
                label="Hohe Chancen"
                value={stats.highOpp}
                hint="Score ≥ 75"
                gradient="from-orange-50 to-red-50"
              />
              <KpiCard
                emoji="📈"
                label="Trend Score"
                value={stats.avg ?? "—"}
                hint="Ø aller Videos"
                gradient="from-emerald-50 to-green-50"
              />
              <KpiCard
                emoji="🎯"
                label="Zu prüfen"
                value={stats.total}
                gradient="from-purple-50 to-pink-50"
              />
            </div>

            {feedQ.isLoading ? (
              <div className="mt-14 grid gap-4 md:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-72 animate-pulse rounded-3xl border border-border bg-white"
                  />
                ))}
              </div>
            ) : matches.length === 0 ? (
              <FeedEmpty onRun={handleRun} running={running} />
            ) : (
              <>
                {/* Beste Chancen */}
                <section className="mt-14">
                  <SectionHeader
                    emoji="🔥"
                    title="Beste Chancen heute"
                    subtitle={`Die ${topFive.length} wichtigsten Videos für dich.`}
                  />
                  <div className="mt-6 grid gap-5 md:grid-cols-2">
                    {topFive.map((m, i) => (
                      <TopOpportunityCard key={m.id} match={m} rank={i + 1} />
                    ))}
                  </div>
                </section>

                {/* Neue Chancen */}
                {rest.length > 0 && (
                  <section className="mt-16">
                    <SectionHeader
                      title="Neue Chancen"
                      subtitle={`${rest.length} weitere Videos für dich sortiert.`}
                    />
                    <div className="mt-6 grid gap-3">
                      {rest.map((m) => (
                        <CompactMatchCard key={m.id} match={m} />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

/* ─────────────────────────────  Sections & Cards  ───────────────────────────── */

function SectionHeader({
  emoji,
  title,
  subtitle,
}: {
  emoji?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      <h2 className="font-display flex items-center gap-2 text-2xl font-bold tracking-tight">
        {emoji && <span>{emoji}</span>}
        {title}
      </h2>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  hint?: string;
  accent?: "signal";
}) {
  return (
    <div className="rounded-3xl border border-border bg-white p-6 shadow-sm">
      <div
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-full",
          accent === "signal"
            ? "bg-signal/10 text-signal"
            : "bg-muted text-muted-foreground",
        )}
      >
        {icon}
      </div>
      <p className="mt-6 text-4xl font-bold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1.5 text-sm font-medium text-muted-foreground">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

function TopOpportunityCard({ match, rank }: { match: Match; rank: number }) {
  const v = match.video;
  const score = match.opportunity_score ?? 0;
  const stance = ((match as { stance?: Stance | null }).stance ?? null) as Stance | null;
  const platformLabel =
    v?.platform === "youtube" ? "YouTube" : v?.platform === "tiktok" ? "TikTok" : v?.platform ?? "—";

  return (
    <article className="group card-hover overflow-hidden rounded-3xl border border-border bg-white shadow-sm">
      <a
        href={v?.url ?? "#"}
        target="_blank"
        rel="noreferrer noopener"
        className="relative block overflow-hidden"
      >
        {v?.thumbnail_url ? (
          <img
            src={v.thumbnail_url}
            alt=""
            className="aspect-video w-full object-cover transition group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="aspect-video w-full bg-muted" />
        )}
        <div className="absolute left-4 top-4 flex items-center gap-2">
          <span className="rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
            #{rank}
          </span>
          <span className="rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-foreground shadow-sm backdrop-blur">
            {platformLabel}
          </span>
        </div>
        <div className="absolute right-4 top-4">
          <ScorePill score={score} />
        </div>
        {v?.duration_seconds ? (
          <span className="absolute bottom-3 right-3 rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-white">
            {formatDuration(v.duration_seconds)}
          </span>
        ) : null}
      </a>

      <div className="p-6">
        <div className="flex flex-wrap items-center gap-1.5">
          {stance && <StanceBadge stance={stance} />}
          {match.topic?.name && (
            <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-foreground">
              {match.topic.name}
            </span>
          )}
        </div>

        <a
          href={v?.url ?? "#"}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-3 line-clamp-2 block text-lg font-semibold leading-snug tracking-tight hover:text-signal"
        >
          {v?.title || "Ohne Titel"}
        </a>

        <p className="mt-1 text-sm text-muted-foreground">
          {v?.channel_name ?? "Unbekannter Creator"}
          {v?.published_at && <> · {formatRelativeTime(v.published_at)}</>}
        </p>

        {match.ai_summary && (
          <p className="mt-4 line-clamp-2 rounded-2xl bg-muted/60 px-4 py-3 text-sm leading-relaxed text-foreground/80">
            {match.ai_summary}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5" /> {formatCount(v?.view_count)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Heart className="h-3.5 w-3.5" /> {formatCount(v?.like_count)}
          </span>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <a
            href={v?.url ?? "#"}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background transition hover:opacity-90"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Video öffnen
          </a>
          <FeedbackButtons
            matchId={match.id}
            current={(match.user_feedback as FeedbackRating | null) ?? null}
            size="sm"
          />
        </div>
      </div>
    </article>
  );
}

function CompactMatchCard({ match }: { match: Match }) {
  const v = match.video;
  const score = match.opportunity_score ?? 0;
  const stance = ((match as { stance?: Stance | null }).stance ?? null) as Stance | null;
  const platformLabel =
    v?.platform === "youtube" ? "YouTube" : v?.platform === "tiktok" ? "TikTok" : v?.platform ?? "—";

  return (
    <article className="card-hover flex flex-col gap-4 rounded-2xl border border-border bg-white p-4 shadow-sm sm:flex-row">
      <a
        href={v?.url ?? "#"}
        target="_blank"
        rel="noreferrer noopener"
        className="relative block w-full shrink-0 overflow-hidden rounded-xl sm:w-52"
      >
        {v?.thumbnail_url ? (
          <img
            src={v.thumbnail_url}
            alt=""
            className="aspect-video h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="aspect-video w-full bg-muted" />
        )}
      </a>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {platformLabel}
              </span>
              {stance && <StanceBadge stance={stance} compact />}
            </div>
            <a
              href={v?.url ?? "#"}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 line-clamp-2 block font-semibold leading-snug hover:text-signal"
            >
              {v?.title || "Ohne Titel"}
            </a>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {v?.channel_name ?? "—"}
              {v?.published_at && <> · {formatRelativeTime(v.published_at)}</>}
            </p>
          </div>
          <ScorePill score={score} />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Eye className="h-3 w-3" /> {formatCount(v?.view_count)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Heart className="h-3 w-3" /> {formatCount(v?.like_count)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <FeedbackButtons
              matchId={match.id}
              current={(match.user_feedback as FeedbackRating | null) ?? null}
              size="sm"
            />
            <a
              href={v?.url ?? "#"}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium transition hover:bg-accent"
            >
              <ExternalLink className="h-3 w-3" /> Öffnen
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}

function ScorePill({ score }: { score: number }) {
  const tone =
    score >= 75
      ? "bg-red-500 text-white"
      : score >= 50
      ? "bg-amber-500 text-white"
      : "bg-white text-foreground";
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold shadow-sm backdrop-blur",
        tone,
      )}
      title="Opportunity Score"
    >
      <Flame className="h-3 w-3" />
      {score}
    </div>
  );
}

function StanceBadge({ stance, compact }: { stance: Stance; compact?: boolean }) {
  const map: Record<Stance, { dot: string; label: string; cls: string }> = {
    promotes: { dot: "bg-red-500", label: "Verbreitet", cls: "bg-red-50 text-red-700" },
    mentions: { dot: "bg-amber-500", label: "Erwähnt", cls: "bg-amber-50 text-amber-700" },
    debunks: { dot: "bg-emerald-500", label: "Widerlegt", cls: "bg-emerald-50 text-emerald-700" },
    unrelated: { dot: "bg-slate-400", label: "Unabhängig", cls: "bg-slate-50 text-slate-600" },
  };
  const s = map[stance];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide",
        compact ? "text-[10px]" : "text-[10px]",
        s.cls,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

/* ─────────────────────────────  Empty states  ───────────────────────────── */

function FeedEmpty({ onRun, running }: { onRun: () => void; running: boolean }) {
  return (
    <div className="mt-14 rounded-3xl border border-dashed border-border bg-white p-14 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-signal/10 text-signal">
        <Sparkles className="h-6 w-6" />
      </div>
      <h3 className="font-display mt-5 text-2xl font-semibold tracking-tight">
        Noch keine Chancen entdeckt
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Starte einen Discovery-Lauf und wir zeigen dir die relevantesten Videos zuerst.
      </p>
      <button
        onClick={onRun}
        disabled={running}
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-50"
      >
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {running ? "Suche läuft …" : "Discovery starten"}
      </button>
    </div>
  );
}

function EmptyState({ onLoad, seeding }: { onLoad: () => void; seeding: boolean }) {
  return (
    <div className="mt-14 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-white via-white to-accent/40 p-12 shadow-sm md:p-16">
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-signal/10 text-signal">
          <Sparkles className="h-6 w-6" />
        </div>
        <h2 className="font-display mt-6 text-3xl font-bold tracking-tight">
          Willkommen bei Veritas
        </h2>
        <p className="mt-3 text-base text-muted-foreground">
          Lade den Starter-Pack mit typischen Aussagen aus Ernährung, Fitness und Supplements —
          oder starte mit einem leeren Workspace.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={onLoad}
            disabled={seeding}
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background shadow-sm transition hover:opacity-90 disabled:opacity-50"
          >
            {seeding ? "Lade …" : (<><Sparkles className="h-4 w-4" /> Starter-Pack laden</>)}
          </button>
          <Link
            to="/topics"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-5 py-3 text-sm font-medium transition hover:bg-accent"
          >
            <Plus className="h-4 w-4" /> Leer starten
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────  Feedback  ───────────────────────────── */

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
      qc.invalidateQueries({ queryKey: ["discovery-feed"] });
    } catch (e) {
      setOptimistic(current);
      toast.error(e instanceof Error ? e.message : "Konnte Feedback nicht speichern.");
    } finally {
      setBusy(null);
    }
  }

  const items: Array<{ r: FeedbackRating; emoji: string; label: string; on: string }> = [
    { r: "relevant", emoji: "👍", label: "Relevant", on: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    { r: "not_relevant", emoji: "👎", label: "Nicht relevant", on: "bg-rose-50 text-rose-700 border-rose-200" },
  ];

  const pad = size === "sm" ? "h-7 w-7 text-xs" : "h-8 w-8 text-sm";

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
              "inline-flex items-center justify-center rounded-full border transition disabled:opacity-60",
              pad,
              active ? it.on : "border-border bg-white text-muted-foreground hover:bg-accent",
            )}
          >
            {it.emoji}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────  Formatters  ───────────────────────────── */

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

// Kept for build; not currently referenced in the user-facing dashboard.
void ChevronDown;
