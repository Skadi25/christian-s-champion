import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getLatestVideos } from "@/lib/discovery.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/latest")({
  component: LatestPage,
});

const WINDOWS = [
  { key: "24h", label: "Letzte 24 Stunden", hours: 24 },
  { key: "7d", label: "Letzte 7 Tage", hours: 24 * 7 },
  { key: "30d", label: "Letzte 30 Tage", hours: 24 * 30 },
] as const;

function LatestPage() {
  const [win, setWin] = useState<(typeof WINDOWS)[number]["key"]>("24h");
  const getLatest = useServerFn(getLatestVideos);
  const hours = WINDOWS.find((w) => w.key === win)!.hours;

  const q = useQuery({
    queryKey: ["latest", win],
    queryFn: () => getLatest({ data: { windowHours: hours } }),
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-signal">🆕 Neueste Videos</p>
        <h1 className="font-display mt-2 text-4xl font-bold tracking-tight">Frisch hochgeladen</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Rein nach Veröffentlichungsdatum sortiert — kein Score, damit du früh reagieren kannst.
        </p>

        <div className="mt-6 inline-flex rounded-xl border border-border bg-white p-1">
          {WINDOWS.map((w) => (
            <button
              key={w.key}
              onClick={() => setWin(w.key)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium transition",
                win === w.key
                  ? "bg-signal text-signal-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {w.label}
            </button>
          ))}
        </div>

        <section className="mt-8">
          {q.isLoading ? (
            <div className="grid gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-32 animate-pulse rounded-2xl border border-border bg-white" />
              ))}
            </div>
          ) : q.data?.items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center">
              <Clock className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                Keine Videos in diesem Zeitfenster. Starte einen Discovery-Lauf oder erweitere den Zeitraum.
              </p>
              <Link
                to="/dashboard"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-signal-foreground"
              >
                Zur Discovery
              </Link>
            </div>
          ) : (
            <ul className="grid gap-3">
              {q.data?.items.map((m) => (
                <li key={m.id}>
                  <SimpleCard match={m} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function SimpleCard({ match }: { match: Awaited<ReturnType<typeof getLatestVideos>>["items"][number] }) {
  const v = match.video;
  const stance = (match.stance ?? null) as "promotes" | "mentions" | "debunks" | "unrelated" | null;
  const badge =
    stance === "promotes" ? "🔴 Verbreitet"
      : stance === "mentions" ? "🟡 Erwähnt"
      : stance === "debunks" ? "🟢 Widerlegt"
      : "⚪ Neutral";
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-3 md:flex-row">
      {v?.thumbnail_url && (
        <a href={v.url} target="_blank" rel="noreferrer noopener" className="block w-full shrink-0 md:w-48">
          <img src={v.thumbnail_url} alt="" loading="lazy" className="aspect-video w-full rounded-lg object-cover" />
        </a>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
          <span className="rounded-full bg-accent px-2 py-0.5 text-accent-foreground">{badge}</span>
          {match.topic?.name && (
            <span className="rounded-full bg-signal/10 px-2 py-0.5 text-signal">🎯 {match.topic.name}</span>
          )}
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
          {v?.channel_name ?? "Kanal"} · {v?.published_at ? new Date(v.published_at).toLocaleString("de-DE") : ""}
        </p>
        {match.ai_summary && (
          <p className="mt-2 line-clamp-2 rounded-lg border-l-2 border-signal/60 bg-signal/5 px-3 py-1.5 text-sm">
            {match.ai_summary}
          </p>
        )}
        <a
          href={v?.url ?? "#"}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-signal hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Auf YouTube öffnen
        </a>
      </div>
    </div>
  );
}
