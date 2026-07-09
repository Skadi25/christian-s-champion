import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getDiscoveryFeed, getLastRunTrace } from "@/lib/discovery.functions";
import { cn } from "@/lib/utils";
import type { Stance } from "@/lib/discovery/scoring";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

type Match = Awaited<ReturnType<typeof getDiscoveryFeed>>["matches"][number];

function AdminPage() {
  const getTrace = useServerFn(getLastRunTrace);
  const getFeed = useServerFn(getDiscoveryFeed);

  const traceQ = useQuery({ queryKey: ["admin-trace"], queryFn: () => getTrace() });
  const feedQ = useQuery({ queryKey: ["admin-feed"], queryFn: () => getFeed() });

  const rejected = feedQ.data?.rejected ?? [];

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Developer / Admin
          </p>
          <h1 className="font-display mt-2 text-3xl font-bold tracking-tight">
            Pipeline-Diagnose
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Technische Details zum letzten Discovery-Lauf. Für normale Nutzer nicht sichtbar.
          </p>
        </div>

        <section className="mt-8 rounded-2xl border border-border bg-white">
          <div className="border-b border-border px-5 py-3 text-sm font-semibold">
            Letzter Run
          </div>
          <div className="p-5 text-sm">
            {traceQ.isLoading ? (
              <p className="text-muted-foreground">Lade Trace …</p>
            ) : !traceQ.data?.run ? (
              <p className="text-muted-foreground">Noch kein Discovery-Lauf vorhanden.</p>
            ) : (
              <div className="space-y-4">
                <div className="text-xs text-muted-foreground">
                  Run vom{" "}
                  {traceQ.data.run.started_at &&
                    new Date(traceQ.data.run.started_at).toLocaleString("de-DE")}{" "}
                  · Status: <b>{traceQ.data.run.status}</b>
                  {traceQ.data.run.error && <> · Fehler: {traceQ.data.run.error}</>}
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-1.5">#</th>
                      <th>Stage</th>
                      <th className="text-right">Input</th>
                      <th className="text-right">Output</th>
                      <th className="text-right">Verlust</th>
                    </tr>
                  </thead>
                  <tbody>
                    {traceQ.data.stages.map((s) => (
                      <tr key={s.stage_index} className="border-b border-border/60">
                        <td className="py-1.5 text-muted-foreground">{s.stage_index}</td>
                        <td className="font-medium">{s.stage_name}</td>
                        <td className="text-right tabular-nums">{s.input_count}</td>
                        <td className="text-right tabular-nums">{s.output_count}</td>
                        <td className="text-right tabular-nums text-muted-foreground">
                          {s.input_count > 0 ? s.input_count - s.output_count : 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {traceQ.data.stages
                  .filter((s) => s.stage_name === "fetchCandidates")
                  .map((s) => {
                    const meta = (s.meta ?? {}) as {
                      query_hits?: Array<{
                        query: string;
                        hits: number;
                        error?: string;
                        requests?: Array<{
                          url: string;
                          status: number;
                          order?: string;
                          page?: number;
                          items_returned?: number;
                          ids_collected_so_far?: number;
                          next_page_token?: boolean;
                          details_fetched?: number;
                          error?: string;
                        }>;
                      }>;
                      published_after?: string;
                    };
                    const hits = meta.query_hits ?? [];
                    return (
                      <details key={s.stage_index} className="rounded-lg bg-surface p-3">
                        <summary className="cursor-pointer text-xs font-semibold">
                          Suchanfragen ({hits.length}) — publishedAfter:{" "}
                          {meta.published_after ?? "—"}
                        </summary>
                        <ul className="mt-2 space-y-3 text-xs">
                          {hits.map((h, i) => (
                            <li key={i} className="rounded border border-border/50 p-2">
                              <div className="flex justify-between gap-4">
                                <span className="truncate font-medium">{h.query}</span>
                                <span className="shrink-0 tabular-nums">
                                  Treffer: <b>{h.hits}</b>
                                </span>
                              </div>
                              {h.error && (
                                <div className="mt-1 text-destructive">Fehler: {h.error}</div>
                              )}
                              {h.requests && h.requests.length > 0 && (
                                <details className="mt-1">
                                  <summary className="cursor-pointer text-muted-foreground">
                                    {h.requests.length} HTTP-Request(s)
                                  </summary>
                                  <ul className="mt-1 space-y-1">
                                    {h.requests.map((r, j) => (
                                      <li key={j} className="break-all font-mono text-[10px]">
                                        <div>
                                          [{r.status}] order={r.order ?? "-"} page={r.page ?? "-"}{" "}
                                          items={r.items_returned ?? r.details_fetched ?? "-"}{" "}
                                          collected={r.ids_collected_so_far ?? "-"}{" "}
                                          next={r.next_page_token ? "yes" : "no"}
                                        </div>
                                        <div className="text-muted-foreground">{r.url}</div>
                                        {r.error && (
                                          <div className="text-destructive">{r.error}</div>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                </details>
                              )}
                            </li>
                          ))}
                        </ul>
                      </details>
                    );
                  })}
              </div>
            )}
          </div>
        </section>

        <RejectedSection rejected={rejected} />
      </div>
    </AppShell>
  );
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
            Verworfene Kandidaten
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {rejected.length} Videos wurden geprüft aber verworfen.
          </p>
        </div>
        <ChevronDown className={cn("h-5 w-5 shrink-0 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-3 grid gap-2">
          {rejected.map((m) => {
            const v = m.video;
            const conf = Math.round(((m.ai_confidence as number | null) ?? 0) * 100);
            const stance = ((m as { stance?: Stance | null }).stance ?? null) as Stance | null;
            return (
              <div
                key={m.id}
                className="flex gap-3 rounded-xl border border-border/60 bg-white p-3"
              >
                {v?.thumbnail_url ? (
                  <img
                    src={v.thumbnail_url}
                    alt=""
                    className="h-16 w-28 shrink-0 rounded-lg object-cover"
                    loading="lazy"
                  />
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
                    <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                      {conf}%
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {v?.channel_name ?? "—"}
                    {stance && <> · {stance}</>}
                    {m.topic?.name && <> · {m.topic.name}</>}
                  </p>
                  {m.ai_reasoning && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {m.ai_reasoning}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
