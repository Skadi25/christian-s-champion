import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { TrendingUp, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getTrendingVideos } from "@/lib/discovery.functions";

export const Route = createFileRoute("/_authenticated/trends")({
  component: TrendsPage,
});

function TrendsPage() {
  const getTrending = useServerFn(getTrendingVideos);
  const q = useQuery({ queryKey: ["trends"], queryFn: () => getTrending() });

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-signal">📈 Trends</p>
        <h1 className="font-display mt-2 text-4xl font-bold tracking-tight">Was gerade Fahrt aufnimmt</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Priorisiert nach Wachstum, nicht nach Größe. Auch kleine Kanäle mit schnellem Anstieg landen oben.
        </p>

        <section className="mt-8">
          {q.isLoading ? (
            <div className="grid gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-32 animate-pulse rounded-2xl border border-border bg-white" />
              ))}
            </div>
          ) : (q.data?.items.length ?? 0) === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center">
              <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                Noch keine Trend-Daten. Starte mehrere Discovery-Läufe — Trends bilden sich aus dem Wachstum
                zwischen den Snapshots.
              </p>
              <Link
                to="/dashboard"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-signal-foreground"
              >
                Zur Discovery
              </Link>
            </div>
          ) : (
            <ol className="grid gap-3">
              {q.data?.items.map((row, i) => (
                <li key={row.match.id}>
                  <TrendCard rank={i + 1} row={row} />
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </AppShell>
  );
}

type TrendRow = Awaited<ReturnType<typeof getTrendingVideos>>["items"][number];

function TrendCard({ rank, row }: { rank: number; row: TrendRow }) {
  const { match, growth, delta, deltaHours } = row;
  const v = match.video;
  const stance = (match.stance ?? null) as "promotes" | "mentions" | "debunks" | "unrelated" | null;
  const badge =
    stance === "promotes" ? "🔴" : stance === "mentions" ? "🟡" : stance === "debunks" ? "🟢" : "⚪";

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-3 md:flex-row">
      <div className="flex shrink-0 items-center justify-center rounded-lg bg-signal/10 px-3 text-signal md:w-14">
        <span className="text-xl font-bold">#{rank}</span>
      </div>
      {v?.thumbnail_url && (
        <a href={v.url} target="_blank" rel="noreferrer noopener" className="block w-full shrink-0 md:w-48">
          <img src={v.thumbnail_url} alt="" loading="lazy" className="aspect-video w-full rounded-lg object-cover" />
        </a>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {badge} · Growth-Score <span className="text-signal">{growth}</span>
          {delta != null && deltaHours != null && deltaHours > 0 && (
            <> · +{Math.round(delta).toLocaleString("de-DE")} Views in {Math.round(deltaHours)}h</>
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
          {v?.channel_name ?? "Kanal"} · 👁 {(v?.view_count ?? 0).toLocaleString("de-DE")} · ❤️{" "}
          {(v?.like_count ?? 0).toLocaleString("de-DE")}
        </p>
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
