import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { seedStarterPack } from "@/lib/starter-pack";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/topics")({
  component: TopicsPage,
});

type Topic = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

type Claim = {
  id: string;
  topic_id: string | null;
  text: string;
  why_problematic: string | null;
  correct_statement: string | null;
};

function TopicsPage() {
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [newTopicName, setNewTopicName] = useState("");
  const [newTopicDesc, setNewTopicDesc] = useState("");
  const [addingTopic, setAddingTopic] = useState(false);
  const [newClaimText, setNewClaimText] = useState("");
  const [newClaimWhy, setNewClaimWhy] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const topicsQ = useQuery({
    queryKey: ["topics", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topics")
        .select("id, name, description, is_active")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Topic[];
    },
  });

  useEffect(() => {
    if (!selectedTopic && topicsQ.data && topicsQ.data.length > 0) {
      setSelectedTopic(topicsQ.data[0].id);
    }
  }, [topicsQ.data, selectedTopic]);

  const claimsQ = useQuery({
    queryKey: ["claims", selectedTopic],
    enabled: !!selectedTopic,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claims")
        .select("id, topic_id, text, why_problematic, correct_statement")
        .eq("topic_id", selectedTopic!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Claim[];
    },
  });

  const addTopic = useMutation({
    mutationFn: async () => {
      if (!userId || !newTopicName.trim()) return;
      const { data, error } = await supabase
        .from("topics")
        .insert({
          user_id: userId,
          name: newTopicName.trim(),
          description: newTopicDesc.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success("Thema hinzugefügt.");
      setNewTopicName("");
      setNewTopicDesc("");
      setAddingTopic(false);
      qc.invalidateQueries({ queryKey: ["topics"] });
      if (id) setSelectedTopic(id);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Fehler."),
  });

  const removeTopic = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("topics").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Thema entfernt.");
      setSelectedTopic(null);
      qc.invalidateQueries({ queryKey: ["topics"] });
    },
  });

  const addClaim = useMutation({
    mutationFn: async () => {
      if (!userId || !selectedTopic || !newClaimText.trim()) return;
      const { error } = await supabase.from("claims").insert({
        user_id: userId,
        topic_id: selectedTopic,
        text: newClaimText.trim(),
        why_problematic: newClaimWhy.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Claim hinzugefügt.");
      setNewClaimText("");
      setNewClaimWhy("");
      qc.invalidateQueries({ queryKey: ["claims", selectedTopic] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Fehler."),
  });

  const removeClaim = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("claims").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["claims", selectedTopic] });
    },
  });

  async function loadStarter() {
    if (!userId) return;
    try {
      const res = await seedStarterPack(userId);
      toast.success(`${res.topics} Themen · ${res.claims} Claims geladen.`);
      qc.invalidateQueries({ queryKey: ["topics"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler.");
    }
  }

  const currentTopic = topicsQ.data?.find((t) => t.id === selectedTopic);
  const isEmpty = !topicsQ.isLoading && (topicsQ.data?.length ?? 0) === 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-8 py-10">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-signal">
              Watchlist · 02
            </p>
            <h1 className="font-display mt-3 text-5xl leading-none">
              Themen & Claims.
            </h1>
            <p className="mt-3 max-w-xl text-sm text-muted-foreground">
              Definiere, worauf Veritas jeden Tag achten soll. Themen sind grobe
              Kategorien, Claims sind konkrete Falschaussagen, nach denen die KI im
              Video-Content sucht.
            </p>
          </div>
        </div>

        {isEmpty ? (
          <div className="mt-10 rounded-xl border border-dashed border-border bg-surface p-10 text-center">
            <Sparkles className="mx-auto h-6 w-6 text-signal" strokeWidth={1.5} />
            <h2 className="font-display mt-5 text-3xl">Noch keine Themen.</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
              Starte mit dem kuratierten Christian-Wolf-Pack — oder lege eigene an.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={loadStarter}
                className="inline-flex items-center gap-2 rounded-md bg-signal px-5 py-3 text-sm font-medium text-signal-foreground transition hover:opacity-90"
              >
                Starter-Pack laden
              </button>
              <button
                onClick={() => setAddingTopic(true)}
                className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-3 text-sm transition hover:bg-accent"
              >
                <Plus className="h-4 w-4" /> Eigenes Thema
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-10 grid gap-6 md:grid-cols-[280px_1fr]">
            {/* Topics list */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  Themen ({topicsQ.data?.length ?? 0})
                </p>
                <button
                  onClick={() => setAddingTopic(true)}
                  className="rounded-md p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {addingTopic && (
                <div className="mb-3 rounded-md border border-border bg-surface p-3">
                  <input
                    autoFocus
                    placeholder="Themen-Name"
                    value={newTopicName}
                    onChange={(e) => setNewTopicName(e.target.value)}
                    className="w-full rounded-md bg-transparent px-2 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none"
                  />
                  <input
                    placeholder="Kurzbeschreibung (optional)"
                    value={newTopicDesc}
                    onChange={(e) => setNewTopicDesc(e.target.value)}
                    className="mt-1 w-full rounded-md bg-transparent px-2 py-1.5 text-xs text-muted-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                  />
                  <div className="mt-2 flex justify-end gap-1">
                    <button
                      onClick={() => {
                        setAddingTopic(false);
                        setNewTopicName("");
                        setNewTopicDesc("");
                      }}
                      className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                    >
                      Abbrechen
                    </button>
                    <button
                      onClick={() => addTopic.mutate()}
                      disabled={!newTopicName.trim() || addTopic.isPending}
                      className="rounded bg-signal px-2 py-1 text-xs font-medium text-signal-foreground disabled:opacity-50"
                    >
                      Hinzufügen
                    </button>
                  </div>
                </div>
              )}

              <ul className="space-y-1">
                {topicsQ.data?.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => setSelectedTopic(t.id)}
                      className={cn(
                        "group flex w-full items-center justify-between rounded-md border px-3 py-2.5 text-left text-sm transition",
                        selectedTopic === t.id
                          ? "border-signal/40 bg-accent text-foreground"
                          : "border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                      )}
                    >
                      <span className="truncate">{t.name}</span>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`"${t.name}" wirklich löschen?`))
                            removeTopic.mutate(t.id);
                        }}
                        className="ml-2 rounded p-1 opacity-0 transition hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Claims panel */}
            <div className="min-w-0">
              {currentTopic ? (
                <>
                  <div className="border-b border-border pb-4">
                    <h2 className="font-display text-3xl">{currentTopic.name}</h2>
                    {currentTopic.description && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {currentTopic.description}
                      </p>
                    )}
                  </div>

                  <div className="mt-6">
                    <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                      Falschaussagen ({claimsQ.data?.length ?? 0})
                    </p>

                    <div className="mt-4 space-y-3">
                      {claimsQ.data?.map((c) => (
                        <div
                          key={c.id}
                          className="group rounded-lg border border-border bg-surface p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm leading-relaxed">
                              <span className="text-muted-foreground">„</span>
                              {c.text}
                              <span className="text-muted-foreground">"</span>
                            </p>
                            <button
                              onClick={() => removeClaim.mutate(c.id)}
                              className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {c.why_problematic && (
                            <p className="mt-2 border-l-2 border-signal/50 pl-3 text-xs text-muted-foreground">
                              {c.why_problematic}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 rounded-lg border border-dashed border-border bg-surface/50 p-4">
                      <textarea
                        placeholder="Neue Falschaussage — z.B. „Kreatin schädigt die Nieren“"
                        value={newClaimText}
                        onChange={(e) => setNewClaimText(e.target.value)}
                        rows={2}
                        className="w-full resize-none rounded-md bg-transparent px-2 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none"
                      />
                      <textarea
                        placeholder="Warum ist das problematisch? (optional, hilft der KI)"
                        value={newClaimWhy}
                        onChange={(e) => setNewClaimWhy(e.target.value)}
                        rows={2}
                        className="mt-1 w-full resize-none rounded-md bg-transparent px-2 py-1.5 text-xs text-muted-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                      />
                      <div className="mt-2 flex justify-end">
                        <button
                          onClick={() => addClaim.mutate()}
                          disabled={!newClaimText.trim() || addClaim.isPending}
                          className="inline-flex items-center gap-2 rounded-md bg-signal px-4 py-2 text-xs font-medium text-signal-foreground transition hover:opacity-90 disabled:opacity-50"
                        >
                          <Plus className="h-3.5 w-3.5" /> Claim hinzufügen
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border bg-surface p-10 text-center text-sm text-muted-foreground">
                  Wähle links ein Thema aus.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
