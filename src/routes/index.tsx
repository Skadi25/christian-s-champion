import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Compass, ScanSearch, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setAuthed(!!s?.user),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-signal" />
          <span className="font-display text-2xl leading-none">Veritas</span>
        </div>
        <nav className="flex items-center gap-2">
          {authed ? (
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 rounded-md bg-signal px-4 py-2 text-sm font-medium text-signal-foreground transition hover:opacity-90"
            >
              Dashboard <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <>
              <Link
                to="/auth"
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground"
              >
                Anmelden
              </Link>
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className="inline-flex items-center gap-2 rounded-md bg-signal px-4 py-2 text-sm font-medium text-signal-foreground transition hover:opacity-90"
              >
                Kostenlos starten <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          )}
        </nav>
      </header>

      {/* Hero */}
      <main className="mx-auto max-w-6xl px-6 pt-16 pb-24">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-signal">
          Faktencheck · KI-Assistent · Multi-Plattform
        </p>
        <h1 className="font-display mt-6 text-6xl leading-[0.95] tracking-tight md:text-8xl">
          Reagiere auf das,
          <br />
          <em className="text-muted-foreground">was wirklich zählt.</em>
        </h1>
        <p className="mt-8 max-w-2xl text-lg text-muted-foreground">
          Veritas beobachtet YouTube, TikTok und Instagram auf virale Falschaussagen
          zu deinen Themen. Jeden Morgen: priorisierte Videos, erkannte Claims und
          fertige Reaktionsentwürfe mit Quellen — in unter 30 Sekunden.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="inline-flex items-center gap-2 rounded-md bg-signal px-5 py-3 text-sm font-medium text-signal-foreground transition hover:opacity-90"
          >
            Mit Beispielthemen starten
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-3 text-sm text-foreground transition hover:bg-accent"
          >
            Ich habe bereits einen Account
          </Link>
        </div>

        {/* Value pillars */}
        <div className="mt-24 grid gap-px overflow-hidden rounded-xl bg-border md:grid-cols-3">
          {[
            {
              icon: Compass,
              kicker: "01 · Discovery",
              title: "Was viral geht",
              body: "Plattformübergreifend priorisiert nach Reichweite, Wachstum und Kommentar-Zustimmung.",
            },
            {
              icon: ScanSearch,
              kicker: "02 · Claim-Detection",
              title: "Was falsch ist",
              body: "KI erkennt die konkrete Aussage im Video und matcht sie mit deiner persönlichen Claim-Bibliothek.",
            },
            {
              icon: Sparkles,
              kicker: "03 · Reaction Draft",
              title: "Was zu tun ist",
              body: "Fertiger Reaktionsentwurf in deinem Ton — mit Hook, Argumentation und Studien-Zitaten.",
            },
          ].map((f) => (
            <div key={f.kicker} className="bg-surface p-8">
              <f.icon className="h-5 w-5 text-signal" strokeWidth={1.5} />
              <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                {f.kicker}
              </p>
              <h3 className="font-display mt-3 text-2xl">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>

        <p className="mt-16 max-w-xl font-display text-xl italic text-muted-foreground">
          &ldquo;Kein Scrollen mehr durch drei Plattformen. Nur die Videos, bei denen
          eine Reaktion wirklich etwas bewegt.&rdquo;
        </p>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-xs text-muted-foreground">
          <span className="font-mono uppercase tracking-[0.2em]">Veritas · v0.1</span>
          <span>Made for evidence-based creators.</span>
        </div>
      </footer>
    </div>
  );
}
