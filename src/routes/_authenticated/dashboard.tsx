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
  MessageSquare,
  Flame,
  Check,
  X,
  Bookmark,
  Play,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { seedStarterPack } from "@/lib/starter-pack";
import {
  runDiscovery,
  getDiscoveryFeed,
  setMatchStatus,
  addTikTokVideo,
  seedDemoMatches,
} from "@/lib/discovery.functions";
import { cn } from "@/lib/utils";
import type { Stance } from "@/lib/discovery/scoring";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

type Feed = Awaited<ReturnType<typeof getDiscoveryFeed>>;
type Match = Feed["matches"][number];
type StatusValue = "new" | "accepted" | "saved" | "rejected";

function Dashboard() {
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [seeding, setSeeding] = useState(false);
  const [demoing, setDemoing] = useState(false);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<"today" | "accepted" | "saved" | "rejected">("today");
  const [tiktokOpen, setTiktokOpen] = useState(false);

  const runDiscoveryFn = useServerFn(runDiscovery);
  const getFeedFn = useServerFn(getDiscoveryFeed);
  const seedDemoFn = useServerFn(seedDemoMatches);

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
  const accepted = feedQ.data?.accepted ?? [];
  const saved = feedQ.data?.saved ?? [];
  const rejected = feedQ.data?.rejected ?? [];
  const lastRun = feedQ.data?.lastRun ?? null;

  const stats = useMemo(() => {
    const highPri = matches.filter((m) => (m.opportunity_score ?? 0) >= 75).length;
    return {
      newCount: matches.length,
      highPri,
      accepted: accepted.length,
      rejected: rejected.length,
    };
  }, [matches, accepted, rejected]);

  const activeList =
    tab === "today" ? matches : tab === "accepted" ? accepted : tab === "saved" ? saved : rejected;
  const topThree = tab === "today" ? matches.slice(0, 3) : [];
  const restList = tab === "today" ? matches.slice(3) : activeList;

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

  async function handleDemo() {
    setDemoing(true);
    const t = toast.loading("Lade Demo-Videos …");
    try {
      const res = await seedDemoFn();
      toast.dismiss(t);
      toast.success(`Demo geladen: ${res.videos} Videos, ${res.claims} Falschaussagen.`);
      qc.invalidateQueries({ queryKey: ["discovery-feed"] });
      qc.invalidateQueries({ queryKey: ["topics"] });
    } catch (e) {
      toast.dismiss(t);
      toast.error(e instanceof Error ? e.message : "Demo fehlgeschlagen.");
    } finally {
      setDemoing(false);
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
        toast.error("Tageslimit erreicht. Lade Demo-Videos, um die App zu testen.", {
          duration: 8000,
        });
      } else {
        toast.success(`${res?.matched ?? 0} neue Chancen gefunden.`);
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
      <div className="mx-auto max-w-7xl px-5 py-10 md:px-10 md:py-12">
        {/* Header */}
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-signal">
              Dein Reaction-Feed
            </p>
            <h1 className="font-display mt-2 text-3xl font-bold tracking-tight md:text-4xl">
              {greeting}
              {displayName ? `, ${displayName}` : ""}
            </h1>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground md:text-base">
              Die relevantesten Videos mit falschen Aussagen — heute für dich priorisiert.
            </p>
          </div>
          {!empty && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setTiktokOpen(true)}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold shadow-sm transition hover:bg-accent"
              >
                <Plus className="h-4 w-4" /> TikTok
              </button>
              <button
                onClick={handleRun}
                disabled={running}
                className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background shadow-sm transition hover:opacity-90 disabled:opacity-50"
              >
                {running ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {running ? "Suche läuft" : "Aktualisieren"}
              </button>
            </div>
          )}
        </div>
        {!empty && lastRun?.finished_at && (
          <p className="mt-2 text-xs text-muted-foreground">
            Zuletzt aktualisiert {formatRelativeTime(lastRun.finished_at)}
          </p>
        )}

        {empty ? (
          <EmptyState onLoad={handleStarterPack} seeding={seeding} onDemo={handleDemo} demoing={demoing} />
        ) : (
          <>
            {/* KPI cards */}
            <div className="mt-8 grid grid-cols-2 gap-3 md:mt-10 md:grid-cols-4 md:gap-4">
              <KpiCard label="Neue Vorschläge" value={stats.newCount} tone="blue" />
              <KpiCard label="Hohe Priorität" value={stats.highPri} tone="red" hint="Score ≥ 75" />
              <KpiCard label="Angenommen" value={stats.accepted} tone="emerald" />
              <KpiCard label="Abgelehnt" value={stats.rejected} tone="slate" />
            </div>

            {/* Tabs */}
            <div className="mt-10 flex flex-wrap gap-1 rounded-2xl border border-border bg-white p-1 md:inline-flex">
              <TabButton active={tab === "today"} onClick={() => setTab("today")}>
                Beste Reaction-Chancen · {matches.length}
              </TabButton>
              <TabButton active={tab === "accepted"} onClick={() => setTab("accepted")}>
                Angenommen · {accepted.length}
              </TabButton>
              <TabButton active={tab === "saved"} onClick={() => setTab("saved")}>
                Gespeichert · {saved.length}
              </TabButton>
              <TabButton active={tab === "rejected"} onClick={() => setTab("rejected")}>
                Abgelehnt · {rejected.length}
              </TabButton>
            </div>

            {feedQ.isLoading ? (
              <div className="mt-10 grid gap-4 md:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-72 animate-pulse rounded-3xl border border-border bg-white"
                  />
                ))}
              </div>
            ) : activeList.length === 0 ? (
              <FeedEmpty tab={tab} onRun={handleRun} onDemo={handleDemo} running={running} demoing={demoing} />
            ) : (
              <>
                {tab === "today" && topThree.length > 0 && (
                  <section className="mt-8">
                    <h2 className="font-display text-xl font-semibold tracking-tight md:text-2xl">
                      Beste Reaction-Chancen heute
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Die {topThree.length} lohnendsten Videos — klar priorisiert.
                    </p>
                    <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                      {topThree.map((m) => (
                        <HeroCard key={m.id} match={m} />
                      ))}
                    </div>
                  </section>
                )}

                {restList.length > 0 && (
                  <section className="mt-10">
                    {tab === "today" && (
                      <h3 className="font-display text-lg font-semibold tracking-tight">
                        Weitere Vorschläge
                      </h3>
                    )}
                    <div className={cn("grid gap-4", tab === "today" ? "mt-4" : "mt-2")}>
                      {restList.map((m) => (
                        <CompactCard key={m.id} match={m} />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </>
        )}

        {tiktokOpen && (
          <TikTokDialog
            onClose={() => setTiktokOpen(false)}
            topics={topicsQ.data ?? []}
            onDone={() => qc.invalidateQueries({ queryKey: ["discovery-feed"] })}
          />
        )}
      </div>
    </AppShell>
  );
}

/* ─────────────────────────────  KPI + Tabs  ───────────────────────────── */

function KpiCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone: "blue" | "red" | "emerald" | "slate";
}) {
  const bar =
    tone === "blue"
      ? "bg-blue-500"
      : tone === "red"
        ? "bg-red-500"
        : tone === "emerald"
          ? "bg-emerald-500"
          : "bg-slate-400";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-white p-5 shadow-sm md:p-6">
      <div className={cn("absolute left-0 top-0 h-full w-1", bar)} />
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-3 text-3xl font-bold tabular-nums md:text-4xl">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

function TabButton({
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
        "rounded-xl px-3 py-2 text-xs font-semibold transition md:text-sm",
        active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────────  Cards  ───────────────────────────── */

function reasonForPriority(match: Match): string | null {
  const stance = ((match as { stance?: Stance | null }).stance ?? null) as Stance | null;
  const score = match.opportunity_score ?? 0;
  const views = match.video?.view_count ?? 0;
  if (stance === "promotes" && score >= 75) return "Verbreitet die Falschaussage bei großer Reichweite";
  if (stance === "promotes" && views >= 100_000) return "Verbreitet die Falschaussage · viral";
  if (stance === "promotes") return "Verbreitet die Falschaussage aktiv";
  if (stance === "mentions") return "Erwähnt die Falschaussage neutral";
  if (stance === "debunks") return "Widerlegt die Aussage — schon gut abgedeckt";
  return null;
}

function PlatformBadge({ platform }: { platform: string | null | undefined }) {
  const map: Record<string, { label: string; cls: string }> = {
    youtube: { label: "YouTube", cls: "bg-red-50 text-red-700 border-red-100" },
    tiktok: { label: "TikTok", cls: "bg-slate-900 text-white border-slate-900" },
    instagram: { label: "Instagram", cls: "bg-pink-50 text-pink-700 border-pink-100" },
  };
  const p = map[platform ?? ""] ?? { label: platform ?? "—", cls: "bg-slate-50 text-slate-600 border-border" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        p.cls,
      )}
    >
      {p.label}
    </span>
  );
}

function DemoBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-purple-700">
      Demo
    </span>
  );
}

function HeroCard({ match }: { match: Match }) {
  const v = match.video;
  const score = match.opportunity_score ?? 0;
  const stance = ((match as { stance?: Stance | null }).stance ?? null) as Stance | null;
  const reason = reasonForPriority(match);
  const isDemo = Boolean(
    (v?.raw_metadata as { demo?: boolean } | null)?.demo,
  );

  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl border border-border bg-white shadow-sm transition hover:shadow-md">
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
          <div className="grid aspect-video w-full place-items-center bg-muted text-muted-foreground">
            <Play className="h-10 w-10" />
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <PlatformBadge platform={v?.platform} />
          {isDemo && <DemoBadge />}
        </div>
        <div className="absolute right-3 top-3">
          <ScorePill score={score} />
        </div>
      </a>

      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs font-medium text-muted-foreground">
          {v?.channel_name ?? "Unbekannter Creator"}
          {v?.published_at && <> · {formatRelativeTime(v.published_at)}</>}
        </p>

        <h3 className="mt-2 line-clamp-2 text-base font-semibold leading-snug tracking-tight">
          {v?.title || "Ohne Titel"}
        </h3>

        {match.detected_claim && (
          <div className="mt-4 rounded-2xl bg-red-50/60 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-red-700">
              Falschaussage
            </p>
            <p className="mt-1 text-sm leading-snug text-red-900">{match.detected_claim}</p>
          </div>
        )}

        {reason && (
          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Flame className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500" />
            {reason}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" /> {formatCount(v?.view_count)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Heart className="h-3.5 w-3.5" /> {formatCount(v?.like_count)}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5" /> {formatCount(v?.comment_count)}
          </span>
          {stance && <StanceBadge stance={stance} />}
        </div>

        <div className="mt-5 flex-1" />
        <ActionRow match={match} />
      </div>
    </article>
  );
}

function CompactCard({ match }: { match: Match }) {
  const v = match.video;
  const score = match.opportunity_score ?? 0;
  const isDemo = Boolean((v?.raw_metadata as { demo?: boolean } | null)?.demo);
  const reason = reasonForPriority(match);

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-4 shadow-sm transition hover:shadow-md md:flex-row">
      <a
        href={v?.url ?? "#"}
        target="_blank"
        rel="noreferrer noopener"
        className="relative block w-full shrink-0 overflow-hidden rounded-xl md:w-56"
      >
        {v?.thumbnail_url ? (
          <img
            src={v.thumbnail_url}
            alt=""
            className="aspect-video h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="grid aspect-video w-full place-items-center bg-muted text-muted-foreground">
            <Play className="h-8 w-8" />
          </div>
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          <PlatformBadge platform={v?.platform} />
          {isDemo && <DemoBadge />}
        </div>
      </a>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              {v?.channel_name ?? "—"}
              {v?.published_at && <> · {formatRelativeTime(v.published_at)}</>}
            </p>
            <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug">
              {v?.title || "Ohne Titel"}
            </h3>
          </div>
          <ScorePill score={score} />
        </div>

        {match.detected_claim && (
          <p className="mt-2 line-clamp-2 text-xs text-red-800">
            <span className="font-semibold">Falschaussage: </span>
            {match.detected_claim}
          </p>
        )}

        {reason && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            <Flame className="mr-1 inline h-3 w-3 text-orange-500" />
            {reason}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Eye className="h-3 w-3" /> {formatCount(v?.view_count)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Heart className="h-3 w-3" /> {formatCount(v?.like_count)}
            </span>
          </div>
          <ActionRow match={match} compact />
        </div>
      </div>
    </article>
  );
}

/* ─────────────────────────────  Actions  ───────────────────────────── */

function ActionRow({ match, compact }: { match: Match; compact?: boolean }) {
  const qc = useQueryClient();
  const setStatus = useServerFn(setMatchStatus);
  const [busy, setBusy] = useState<StatusValue | null>(null);
  const [optimistic, setOptimistic] = useState<StatusValue>(match.status as StatusValue);

  useEffect(() => setOptimistic(match.status as StatusValue), [match.status]);

  async function apply(status: StatusValue) {
    setBusy(status);
    const prev = optimistic;
    setOptimistic(status);
    try {
      await setStatus({ data: { matchId: match.id, status } });
      qc.invalidateQueries({ queryKey: ["discovery-feed"] });
      if (status === "accepted") toast.success("Angenommen.");
      else if (status === "rejected") toast("Abgelehnt.");
      else if (status === "saved") toast("Gespeichert.");
    } catch (e) {
      setOptimistic(prev);
      toast.error(e instanceof Error ? e.message : "Konnte Aktion nicht speichern.");
    } finally {
      setBusy(null);
    }
  }

  const v = match.video;
  const pad = compact ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-xs";
  const iconSize = compact ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        title="Annehmen"
        onClick={() => apply("accepted")}
        disabled={busy !== null}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border font-semibold transition disabled:opacity-60",
          pad,
          optimistic === "accepted"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-border bg-white hover:bg-emerald-50 hover:text-emerald-700",
        )}
      >
        <Check className={iconSize} /> {compact ? "" : "Annehmen"}
      </button>
      <button
        title="Ablehnen"
        onClick={() => apply("rejected")}
        disabled={busy !== null}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border font-semibold transition disabled:opacity-60",
          pad,
          optimistic === "rejected"
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : "border-border bg-white hover:bg-rose-50 hover:text-rose-700",
        )}
      >
        <X className={iconSize} /> {compact ? "" : "Ablehnen"}
      </button>
      <button
        title="Speichern"
        onClick={() => apply(optimistic === "saved" ? "new" : "saved")}
        disabled={busy !== null}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border font-semibold transition disabled:opacity-60",
          pad,
          optimistic === "saved"
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-border bg-white hover:bg-amber-50 hover:text-amber-700",
        )}
      >
        <Bookmark className={iconSize} />
      </button>
      <a
        href={v?.url ?? "#"}
        target="_blank"
        rel="noreferrer noopener"
        title="Video öffnen"
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-foreground font-semibold text-background transition hover:opacity-90",
          pad,
        )}
      >
        <ExternalLink className={iconSize} />
      </a>
    </div>
  );
}

/* ─────────────────────────────  Score / Stance  ───────────────────────────── */

function ScorePill({ score }: { score: number }) {
  const tone =
    score >= 75 ? "bg-red-500 text-white" : score >= 50 ? "bg-amber-500 text-white" : "bg-white text-foreground";
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold shadow-sm",
        tone,
      )}
      title={`Opportunity Score: ${score}`}
    >
      <Flame className="h-3 w-3" />
      {score}
    </div>
  );
}

function StanceBadge({ stance }: { stance: Stance }) {
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
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        s.cls,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

/* ─────────────────────────────  Empty states  ───────────────────────────── */

function FeedEmpty({
  tab,
  onRun,
  onDemo,
  running,
  demoing,
}: {
  tab: "today" | "accepted" | "saved" | "rejected";
  onRun: () => void;
  onDemo: () => void;
  running: boolean;
  demoing: boolean;
}) {
  if (tab === "accepted")
    return (
      <div className="mt-8 rounded-3xl border border-dashed border-border bg-white p-12 text-center text-sm text-muted-foreground">
        Noch keine Vorschläge angenommen. Nimm Videos aus <b>Beste Reaction-Chancen</b> an, um sie hier zu sehen.
      </div>
    );
  if (tab === "saved")
    return (
      <div className="mt-8 rounded-3xl border border-dashed border-border bg-white p-12 text-center text-sm text-muted-foreground">
        Keine gespeicherten Videos.
      </div>
    );
  if (tab === "rejected")
    return (
      <div className="mt-8 rounded-3xl border border-dashed border-border bg-white p-12 text-center text-sm text-muted-foreground">
        Keine abgelehnten Videos.
      </div>
    );

  return (
    <div className="mt-8 rounded-3xl border border-dashed border-border bg-white p-12 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-signal/10 text-signal">
        <Sparkles className="h-6 w-6" />
      </div>
      <h3 className="font-display mt-5 text-2xl font-semibold tracking-tight">
        Noch keine Chancen entdeckt
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Starte einen Discovery-Lauf — oder lade Demo-Videos, um die App sofort zu erleben.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={onRun}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-50"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Discovery starten
        </button>
        <button
          onClick={onDemo}
          disabled={demoing}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-5 py-2.5 text-sm font-semibold transition hover:bg-accent disabled:opacity-50"
        >
          {demoing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          Demo-Videos laden
        </button>
      </div>
    </div>
  );
}

function EmptyState({
  onLoad,
  seeding,
  onDemo,
  demoing,
}: {
  onLoad: () => void;
  seeding: boolean;
  onDemo: () => void;
  demoing: boolean;
}) {
  return (
    <div className="mt-10 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-white via-white to-accent/40 p-10 shadow-sm md:p-16">
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-signal/10 text-signal">
          <Sparkles className="h-6 w-6" />
        </div>
        <h2 className="font-display mt-6 text-3xl font-bold tracking-tight">
          Willkommen bei Veritas
        </h2>
        <p className="mt-3 text-base text-muted-foreground">
          Lade den Starter-Pack mit typischen Falschaussagen — oder starte direkt mit
          Demo-Videos und sieh das Produkt live.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={onDemo}
            disabled={demoing}
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background shadow-sm transition hover:opacity-90 disabled:opacity-50"
          >
            {demoing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Demo-Videos laden
          </button>
          <button
            onClick={onLoad}
            disabled={seeding}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-5 py-3 text-sm font-semibold transition hover:bg-accent disabled:opacity-50"
          >
            {seeding ? "Lade …" : (<><Sparkles className="h-4 w-4" /> Starter-Pack</>)}
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

/* ─────────────────────────────  TikTok Dialog  ───────────────────────────── */

function TikTokDialog({
  onClose,
  topics,
  onDone,
}: {
  onClose: () => void;
  topics: Array<{ id: string; name: string }>;
  onDone: () => void;
}) {
  const addTt = useServerFn(addTikTokVideo);
  const [url, setUrl] = useState("");
  const [creator, setCreator] = useState("");
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [views, setViews] = useState("");
  const [likes, setLikes] = useState("");
  const [comments, setComments] = useState("");
  const [claimId, setClaimId] = useState("");
  const [claims, setClaims] = useState<Array<{ id: string; text: string }>>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("claims")
      .select("id, text, is_active")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const list = (data ?? []).map((c) => ({ id: c.id as string, text: c.text as string }));
        setClaims(list);
        if (list.length > 0) setClaimId(list[0].id);
      });
  }, []);

  async function submit() {
    if (!url.trim() || !claimId) {
      toast.error("URL und Falschaussage sind Pflicht.");
      return;
    }
    setSaving(true);
    try {
      const res = await addTt({
        data: {
          url: url.trim(),
          claimId,
          creator: creator.trim() || null,
          title: title.trim() || null,
          caption: caption.trim() || null,
          views: views ? Number(views) : null,
          likes: likes ? Number(likes) : null,
          comments: comments ? Number(comments) : null,
        },
      });
      toast.success(`TikTok analysiert · Stance: ${res.stance} · Score ${res.score}`);
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Konnte nicht hinzufügen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 md:items-center md:p-6">
      <div className="w-full max-w-lg overflow-hidden rounded-t-3xl bg-white shadow-2xl md:rounded-3xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h3 className="font-display text-lg font-semibold tracking-tight">
              TikTok-Video hinzufügen
            </h3>
            <p className="text-xs text-muted-foreground">
              Wir analysieren automatisch die Haltung zum gewählten Claim.
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full border border-border hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-5">
          <Field label="TikTok-URL *">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.tiktok.com/@user/video/…"
              className="input"
            />
          </Field>
          <Field label="Falschaussage *">
            {topics.length === 0 || claims.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
                Lege erst eine Falschaussage im{" "}
                <Link to="/topics" className="text-signal underline">
                  Themen-Editor
                </Link>{" "}
                an.
              </p>
            ) : (
              <select
                value={claimId}
                onChange={(e) => setClaimId(e.target.value)}
                className="input"
              >
                {claims.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.text.length > 90 ? c.text.slice(0, 90) + "…" : c.text}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Creator">
              <input
                value={creator}
                onChange={(e) => setCreator(e.target.value)}
                placeholder="@handle"
                className="input"
              />
            </Field>
            <Field label="Titel">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="input"
              />
            </Field>
          </div>
          <Field label="Caption / Beschreibung">
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              className="input"
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Views">
              <input
                inputMode="numeric"
                value={views}
                onChange={(e) => setViews(e.target.value.replace(/\D/g, ""))}
                className="input"
              />
            </Field>
            <Field label="Likes">
              <input
                inputMode="numeric"
                value={likes}
                onChange={(e) => setLikes(e.target.value.replace(/\D/g, ""))}
                className="input"
              />
            </Field>
            <Field label="Kommentare">
              <input
                inputMode="numeric"
                value={comments}
                onChange={(e) => setComments(e.target.value.replace(/\D/g, ""))}
                className="input"
              />
            </Field>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-surface px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold hover:bg-accent"
          >
            Abbrechen
          </button>
          <button
            onClick={submit}
            disabled={saving || claims.length === 0}
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Analysieren
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

/* ─────────────────────────────  Formatters  ───────────────────────────── */

function formatCount(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
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
