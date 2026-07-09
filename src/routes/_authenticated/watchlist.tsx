import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Heart, Trash2, Plus, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { addToWatchlist, getWatchlist, removeFromWatchlist } from "@/lib/discovery.functions";

export const Route = createFileRoute("/_authenticated/watchlist")({
  component: WatchlistPage,
});

function WatchlistPage() {
  const qc = useQueryClient();
  const getList = useServerFn(getWatchlist);
  const addFn = useServerFn(addToWatchlist);
  const removeFn = useServerFn(removeFromWatchlist);

  const q = useQuery({ queryKey: ["watchlist"], queryFn: () => getList() });

  const [kind, setKind] = useState<"channel" | "video">("channel");
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!identifier.trim()) return;
    setBusy(true);
    try {
      await addFn({ data: { kind, platform: "youtube", identifier: identifier.trim() } });
      toast.success(kind === "channel" ? "Kanal hinzugefügt." : "Video hinzugefügt.");
      setIdentifier("");
      qc.invalidateQueries({ queryKey: ["watchlist"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler beim Hinzufügen.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await removeFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["watchlist"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler beim Entfernen.");
    }
  }

  const items = q.data?.items ?? [];
  const channels = items.filter((i) => i.kind === "channel");
  const videos = items.filter((i) => i.kind === "video");

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-6 py-10 md:px-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-signal">❤️ Watchlist</p>
        <h1 className="font-display mt-2 text-4xl font-bold tracking-tight">Deine Beobachtungsliste</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Kanäle und Videos, die die App automatisch für dich im Blick behält. Bereit für YouTube — TikTok und
          Instagram folgen als weitere Adapter.
        </p>

        {/* Add form */}
        <div className="mt-8 rounded-2xl border border-border bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-border bg-surface p-1">
              <button
                onClick={() => setKind("channel")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${kind === "channel" ? "bg-white shadow-sm" : "text-muted-foreground"}`}
              >
                Kanal
              </button>
              <button
                onClick={() => setKind("video")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${kind === "video" ? "bg-white shadow-sm" : "text-muted-foreground"}`}
              >
                Video
              </button>
            </div>
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={
                kind === "channel"
                  ? "@handle, Kanal-URL oder Kanal-ID"
                  : "YouTube-URL oder Video-ID"
              }
              className="min-w-0 flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-signal"
            />
            <button
              disabled={busy}
              onClick={add}
              className="inline-flex items-center gap-1.5 rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-signal-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Hinzufügen
            </button>
          </div>
        </div>

        {/* Channels */}
        <section className="mt-8">
          <h2 className="font-display text-lg font-bold">Kanäle · {channels.length}</h2>
          {channels.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Noch keine Kanäle beobachtet.</p>
          ) : (
            <ul className="mt-3 grid gap-2">
              {channels.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-white p-3"
                >
                  {c.thumbnail_url ? (
                    <img src={c.thumbnail_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-accent text-accent-foreground">
                      <Heart className="h-4 w-4" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.label ?? c.external_id}</p>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {c.platform} · Kanal
                    </p>
                  </div>
                  {c.url && (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="rounded-md p-2 text-muted-foreground hover:bg-accent"
                      title="Öffnen"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  <button
                    onClick={() => remove(c.id)}
                    className="rounded-md p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                    title="Entfernen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Videos */}
        <section className="mt-8">
          <h2 className="font-display text-lg font-bold">Videos · {videos.length}</h2>
          {videos.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Noch keine Videos gespeichert.</p>
          ) : (
            <ul className="mt-3 grid gap-2">
              {videos.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-white p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{v.label ?? v.external_id}</p>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {v.platform} · Video
                    </p>
                  </div>
                  {v.url && (
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="rounded-md p-2 text-muted-foreground hover:bg-accent"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  <button
                    onClick={() => remove(v.id)}
                    className="rounded-md p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
